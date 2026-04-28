const express  = require('express')
const bcrypt   = require('bcryptjs')
const pool     = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const { createPpiWallet, suspendPpiWallet, closePpiWallet } = require('../services/ppiWallet')
const { normaliseApprovalConfig, resolveTierForDesignation, deriveApprovalFromTier } = require('../services/employeeApproval')
const router   = express.Router()

router.use(authenticate)
router.use(authorise('Super Admin'))

// ── Helper: load an employee's approver chain (ordered) ──────────
async function fetchApproverChain(client, employeeId) {
  const { rows } = await client.query(`
    SELECT ea.id, ea.step_designation, ea.step_order,
           ea.primary_user_id,
           up.name AS primary_name, up.is_active AS primary_active,
           ea.backup_user_id,
           ub.name AS backup_name,  ub.is_active AS backup_active
    FROM employee_approvers ea
    LEFT JOIN users up ON up.id = ea.primary_user_id
    LEFT JOIN users ub ON ub.id = ea.backup_user_id
    WHERE ea.user_id = $1
    ORDER BY ea.step_order ASC, ea.step_designation ASC
  `, [employeeId])
  return rows
}

// ── Helper: replace an employee's approver chain in one transaction ──
//   payload: [{ step_designation, step_order, primary_user_id, backup_user_id }]
async function saveApproverChain(client, employeeId, chain) {
  if (!Array.isArray(chain)) return
  await client.query('DELETE FROM employee_approvers WHERE user_id = $1', [employeeId])
  for (const step of chain) {
    if (!step || !step.step_designation) continue
    await client.query(
      `INSERT INTO employee_approvers
         (user_id, step_designation, step_order, primary_user_id, backup_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        employeeId,
        step.step_designation,
        Number.isInteger(Number(step.step_order)) ? Number(step.step_order) : 1,
        step.primary_user_id || null,
        step.backup_user_id  || null,
      ]
    )
  }
}

// ── GET /api/employees ───────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.emp_id, u.name, u.email, u.role, u.department,
             u.avatar, u.color, u.reporting_to, u.is_active,
             u.mobile_number,
             TO_CHAR(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
             u.gender, u.pan_number, u.aadhaar_number,
             u.ppi_wallet_id, u.ppi_wallet_number, u.ppi_customer_id, u.ppi_wallet_status, u.ppi_kyc_status,
             u.approver_roles, u.approval_type, u.required_approval_count,
             u.designation, u.tier_id, t.name AS tier_name, t.rank AS tier_rank,
             u.last_login, u.created_at,
             w.balance AS wallet_balance
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN tiers t ON t.id = u.tier_id
      ORDER BY u.created_at DESC
    `)
    res.json({ success: true, data: rows })
  } catch (e) { next(e) }
})

// ── GET /api/employees/audit-log ─────────────────────────────
// Audit log of approver reassignments. Defined BEFORE /:id so the literal path wins
// the route match.
router.get('/audit-log', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.acted_at, a.action_type, a.step_designation, a.reason,
             a.affected_user_id, ua.name AS affected_name,
             a.old_user_id,      uo.name AS old_name,
             a.new_user_id,      un.name AS new_name,
             a.acted_by,         ub.name AS acted_by_name
      FROM approver_audit_log a
      LEFT JOIN users ua ON ua.id = a.affected_user_id
      LEFT JOIN users uo ON uo.id = a.old_user_id
      LEFT JOIN users un ON un.id = a.new_user_id
      LEFT JOIN users ub ON ub.id = a.acted_by
      ORDER BY a.acted_at DESC
      LIMIT 200
    `)
    res.json({ success: true, count: rows.length, data: rows })
  } catch (e) { next(e) }
})

// ── GET /api/employees/:id ───────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.emp_id, u.name, u.email, u.role, u.department,
             u.avatar, u.color, u.reporting_to, u.is_active,
             u.mobile_number,
             TO_CHAR(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
             u.gender, u.pan_number, u.aadhaar_number,
             u.ppi_wallet_id, u.ppi_wallet_number, u.ppi_customer_id, u.ppi_wallet_status, u.ppi_kyc_status,
             u.approver_roles, u.approval_type, u.required_approval_count,
             u.designation, u.tier_id, t.name AS tier_name, t.rank AS tier_rank,
             u.last_login, u.created_at,
             w.balance AS wallet_balance
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN tiers t ON t.id = u.tier_id
      WHERE u.id = $1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' })
    const approver_chain = await fetchApproverChain(pool, req.params.id)
    res.json({ success: true, data: { ...rows[0], approver_chain } })
  } catch (e) { next(e) }
})

// ── POST /api/employees ──────────────────────────────────────
router.post('/', async (req, res, next) => {
  const { name, email, password, role, department, reporting_to,
          mobile_number, date_of_birth, gender, pan_number, aadhaar_number, productId,
          approver_roles, approval_type, required_approval_count,
          designation, tier_id: tier_id_in,
          approver_chain } = req.body

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, email, password, and role are required' })
  }

  // Defer tier resolution and approval validation until after we have a DB client
  // so resolveTierForDesignation can use the same transaction.
  let approvalCfg = { provided: false }
  if (approver_roles !== undefined || approval_type !== undefined) {
    approvalCfg = normaliseApprovalConfig({ approver_roles, approval_type, required_approval_count })
    if (approvalCfg.error) return res.status(400).json({ success: false, message: approvalCfg.error })
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
  }
  if (!mobile_number || !/^\d{10}$/.test(mobile_number)) {
    return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' })
  }
  if (!date_of_birth) {
    return res.status(400).json({ success: false, message: 'Date of birth is required' })
  }
  if (!gender) {
    return res.status(400).json({ success: false, message: 'Gender is required' })
  }
  if (!pan_number || !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan_number.toUpperCase())) {
    return res.status(400).json({ success: false, message: 'Valid PAN number is required (e.g. ABCDE1234F)' })
  }
  if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
    return res.status(400).json({ success: false, message: 'Valid 12-digit Aadhaar number is required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Check duplicate email
    const { rows: existing } = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email])
    if (existing.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ success: false, message: 'Email already exists' })
    }

    // Check duplicate mobile
    const { rows: mobDup } = await client.query('SELECT id FROM users WHERE mobile_number = $1', [mobile_number])
    if (mobDup.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ success: false, message: 'Mobile number already registered' })
    }

    // Generate emp_id
    const { rows: maxEmp } = await client.query(
      `SELECT emp_id FROM users WHERE emp_id LIKE 'EMP-%' ORDER BY LENGTH(emp_id) DESC, emp_id DESC LIMIT 1`
    )
    let nextNum = 1
    if (maxEmp.length && maxEmp[0].emp_id) {
      const match = maxEmp[0].emp_id.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const emp_id = `EMP-${String(nextNum).padStart(3, '0')}`

    // Generate avatar from initials
    const parts = name.trim().split(/\s+/)
    const avatar = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()

    // Fetch role color from roles table
    const { rows: roleRow } = await client.query('SELECT color FROM roles WHERE name = $1', [role])
    const color = roleRow[0]?.color || '#0A84FF'

    // Resolve tier from designation (if designation provided and not already explicitly mapped).
    let tierRow = null
    let resolvedTierId = Number.isInteger(Number(tier_id_in)) ? Number(tier_id_in) : null
    if (designation && !resolvedTierId) {
      tierRow = await resolveTierForDesignation(client, designation)
      if (tierRow) resolvedTierId = tierRow.id
    } else if (resolvedTierId) {
      const { rows } = await client.query('SELECT * FROM tiers WHERE id = $1', [resolvedTierId])
      tierRow = rows[0] || null
    }

    // If caller didn't supply an approval config, inherit from the resolved tier.
    if (!approvalCfg.provided && tierRow) {
      const fromTier = deriveApprovalFromTier(tierRow)
      if (fromTier) approvalCfg = fromTier
    }

    // Every new employee must have at least one approver — either directly supplied
    // or inherited from the tier. Reject the create if neither produces any approvers.
    if (!approvalCfg.provided || !Array.isArray(approvalCfg.approver_roles) || approvalCfg.approver_roles.length === 0) {
      await client.query('ROLLBACK').catch(() => {})
      return res.status(400).json({
        success: false,
        message: 'At least one approver must be assigned. Select one in the Sequential Approval Flow, or map the designation to a tier with approvers in Tier Config.',
      })
    }

    const password_hash = await bcrypt.hash(password, 10)

    // ── Call PPI Wallet API before inserting ─────────────────
    let ppiWallet
    try {
      ppiWallet = await createPpiWallet({
        // Optional overrides — when omitted, defaults come from PPI_PRODUCT_IDS / PPI_PROGRAM_ID in env.
        productId:      productId || undefined,
        productIds:     Array.isArray(req.body.productIds) ? req.body.productIds : undefined,
        programId:      req.body.programId || undefined,
        name:           name.trim(),
        mobile_number,
        email:          email.trim().toLowerCase(),
        date_of_birth,
        gender,
        pan_number:     pan_number.toUpperCase(),
        aadhaar_number,
      })
    } catch (ppiErr) {
      await client.query('ROLLBACK')
      return res.status(502).json({
        success: false,
        message: ppiErr.message,
        traceId: ppiErr.requestId || null,
      })
    }

    const { rows: [user] } = await client.query(
      `INSERT INTO users (emp_id, name, email, password_hash, role, department, avatar, color, reporting_to,
                          mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                          ppi_wallet_id, ppi_wallet_number, ppi_customer_id, ppi_wallet_status, ppi_kyc_status,
                          approver_roles, approval_type, required_approval_count,
                          designation, tier_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING id, emp_id, name, email, role, department, avatar, color, reporting_to, is_active,
                 mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                 ppi_wallet_id, ppi_wallet_number, ppi_customer_id, ppi_wallet_status, ppi_kyc_status,
                 approver_roles, approval_type, required_approval_count,
                 designation, tier_id, created_at`,
      [emp_id, name.trim(), email.trim().toLowerCase(), password_hash, role, department || 'Engineering',
       avatar, color, reporting_to || null, mobile_number, date_of_birth, gender,
       pan_number.toUpperCase(), aadhaar_number,
       ppiWallet.walletId, ppiWallet.walletNumber, ppiWallet.customerId,
       ppiWallet.walletStatus, ppiWallet.kycStatus,
       approvalCfg.provided ? approvalCfg.approver_roles : null,
       approvalCfg.provided ? approvalCfg.approval_type : null,
       approvalCfg.provided ? approvalCfg.required_approval_count : null,
       designation || null,
       resolvedTierId || null]
    )

    // Create internal wallet for the new employee
    await client.query(
      `INSERT INTO wallets (user_id, balance, total_credited, total_debited, travel_balance, hotel_balance, allowance_balance)
       VALUES ($1, 0, 0, 0, 0, 0, 0)`,
      [user.id]
    )

    // Save the per-employee approver chain (primary + backup per step) inside the same txn.
    if (Array.isArray(approver_chain)) {
      await saveApproverChain(client, user.id, approver_chain)
    }

    await client.query('COMMIT')
    const finalChain = await fetchApproverChain(pool, user.id)
    res.status(201).json({ success: true, message: 'Employee created successfully', data: { ...user, approver_chain: finalChain } })
  } catch (e) {
    await client.query('ROLLBACK')
    if (e.code === '23505') {
      const detail = e.detail || ''
      if (detail.includes('email'))  return res.status(409).json({ success: false, message: 'Email already exists' })
      if (detail.includes('emp_id')) return res.status(409).json({ success: false, message: 'Employee ID conflict — please try again' })
      return res.status(409).json({ success: false, message: 'Duplicate entry: ' + detail })
    }
    next(e)
  } finally {
    client.release()
  }
})

// ── PUT /api/employees/:id ───────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, role, department, reporting_to, password,
            mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
            approver_roles, approval_type, required_approval_count,
            designation, tier_id: tier_id_in,
            approver_chain } = req.body
    const { id } = req.params

    let approvalCfg = { provided: false }
    if (approver_roles !== undefined || approval_type !== undefined) {
      approvalCfg = normaliseApprovalConfig({ approver_roles, approval_type, required_approval_count })
      if (approvalCfg.error) return res.status(400).json({ success: false, message: approvalCfg.error })
    }

    // Resolve tier_id from designation when caller didn't supply one explicitly.
    let resolvedTierId = (tier_id_in === null) ? null
      : (Number.isInteger(Number(tier_id_in)) ? Number(tier_id_in) : undefined)
    if (designation !== undefined && resolvedTierId === undefined) {
      const t = await resolveTierForDesignation(pool, designation)
      resolvedTierId = t ? t.id : null
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE id = $1', [id])
    if (!existing.length) return res.status(404).json({ success: false, message: 'Employee not found' })

    if (email) {
      const { rows: dup } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [email, id])
      if (dup.length) return res.status(409).json({ success: false, message: 'Email already in use' })
    }
    if (mobile_number) {
      const { rows: mobDup } = await pool.query('SELECT id FROM users WHERE mobile_number = $1 AND id != $2', [mobile_number, id])
      if (mobDup.length) return res.status(409).json({ success: false, message: 'Mobile number already in use' })
    }

    const sets = []
    const vals = []
    let idx = 1

    if (name)         { sets.push(`name = $${idx++}`);         vals.push(name.trim()) }
    if (email)        { sets.push(`email = $${idx++}`);        vals.push(email.trim().toLowerCase()) }
    if (role)         { sets.push(`role = $${idx++}`);         vals.push(role) }
    if (department !== undefined)   { sets.push(`department = $${idx++}`);    vals.push(department || 'Engineering') }
    if (reporting_to !== undefined) { sets.push(`reporting_to = $${idx++}`);  vals.push(reporting_to || null) }
    if (mobile_number !== undefined) { sets.push(`mobile_number = $${idx++}`); vals.push(mobile_number || null) }
    if (date_of_birth !== undefined) { sets.push(`date_of_birth = $${idx++}`); vals.push(date_of_birth || null) }
    if (gender !== undefined)        { sets.push(`gender = $${idx++}`);        vals.push(gender || null) }
    if (pan_number !== undefined)    { sets.push(`pan_number = $${idx++}`);    vals.push(pan_number ? pan_number.toUpperCase() : null) }
    if (aadhaar_number !== undefined){ sets.push(`aadhaar_number = $${idx++}`);vals.push(aadhaar_number || null) }

    if (approvalCfg.provided) {
      sets.push(`approver_roles = $${idx++}`);          vals.push(approvalCfg.approver_roles)
      sets.push(`approval_type = $${idx++}`);           vals.push(approvalCfg.approval_type)
      sets.push(`required_approval_count = $${idx++}`); vals.push(approvalCfg.required_approval_count)
    }
    if (designation !== undefined)       { sets.push(`designation = $${idx++}`); vals.push(designation || null) }
    if (resolvedTierId !== undefined)    { sets.push(`tier_id = $${idx++}`);     vals.push(resolvedTierId) }

    if (password) {
      if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
      sets.push(`password_hash = $${idx++}`)
      vals.push(await bcrypt.hash(password, 10))
    }

    if (name) {
      const parts = name.trim().split(/\s+/)
      const avatar = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
      sets.push(`avatar = $${idx++}`); vals.push(avatar)
    }

    if (role) {
      const { rows: roleRow } = await pool.query('SELECT color FROM roles WHERE name = $1', [role])
      sets.push(`color = $${idx++}`); vals.push(roleRow[0]?.color || '#0A84FF')
    }

    // Allow chain-only updates (no other fields changed) — common when admins just
    // re-assign approvers without touching personal data.
    const onlyChainUpdate = !sets.length && Array.isArray(approver_chain)
    if (!sets.length && !onlyChainUpdate) {
      return res.status(400).json({ success: false, message: 'No fields to update' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      let user
      if (sets.length) {
        vals.push(id)
        const { rows } = await client.query(
          `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
           RETURNING id, emp_id, name, email, role, department, avatar, color, reporting_to, is_active,
                     mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                     approver_roles, approval_type, required_approval_count,
                     designation, tier_id, created_at`,
          vals
        )
        user = rows[0]
      } else {
        const { rows } = await client.query(
          `SELECT id, emp_id, name, email, role, department, avatar, color, reporting_to, is_active,
                  mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                  approver_roles, approval_type, required_approval_count,
                  designation, tier_id, created_at
           FROM users WHERE id = $1`,
          [id]
        )
        user = rows[0]
      }

      if (Array.isArray(approver_chain)) {
        await saveApproverChain(client, id, approver_chain)
      }

      await client.query('COMMIT')
      const finalChain = await fetchApproverChain(pool, id)
      res.json({ success: true, message: 'Employee updated', data: { ...user, approver_chain: finalChain } })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  } catch (e) { next(e) }
})

// ── PATCH /api/employees/:id/status ──────────────────────────
// Deactivation triggers bulk reassignment: every employee that has this user as a
// primary approver gets routed to the backup. Audit log captures each swap.
router.patch('/:id/status', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { id } = req.params
    const { is_active } = req.body

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' })
    }

    await client.query('BEGIN')
    const { rows: [user] } = await client.query(
      `UPDATE users SET is_active = $1 WHERE id = $2
       RETURNING id, emp_id, name, email, role, is_active`,
      [is_active, id]
    )
    if (!user) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Employee not found' })
    }

    let reassignmentSummary = null
    // On deactivation, audit every employee_approvers row whose primary is this user.
    // The engine resolves primary→backup at read time, so no row mutation is needed —
    // we just log the implicit reassignment so the chain change is auditable.
    if (is_active === false) {
      const { rows: affected } = await client.query(`
        SELECT ea.user_id        AS affected_user_id,
               ea.step_designation,
               ea.primary_user_id,
               ea.backup_user_id
        FROM employee_approvers ea
        WHERE ea.primary_user_id = $1
      `, [id])

      for (const row of affected) {
        await client.query(
          `INSERT INTO approver_audit_log
             (action_type, affected_user_id, step_designation, old_user_id, new_user_id, reason, acted_by)
           VALUES ('reassign_pending', $1, $2, $3, $4, $5, $6)`,
          [
            row.affected_user_id,
            row.step_designation,
            row.primary_user_id,
            row.backup_user_id,
            `Primary approver deactivated (${user.name}); requests now route to backup.`,
            req.user.id,
          ]
        )
      }
      reassignmentSummary = { affected: affected.length }
    }

    await client.query('COMMIT')
    res.json({
      success: true,
      message: `Employee ${user.is_active ? 'activated' : 'deactivated'}`,
      data: user,
      reassignment: reassignmentSummary,
    })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    next(e)
  } finally {
    client.release()
  }
})

// ── POST /api/employees/:id/suspend-wallet ──────────────────
// Allowed: Super Admin, Finance
router.post('/:id/suspend-wallet', async (req, res, next) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    // Role check — only Super Admin and Finance can suspend
    if (!['Super Admin', 'Finance'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only Super Admin or Finance can suspend wallets' })
    }

    // Validate reason
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required to suspend a wallet' })
    }

    // Cannot suspend own wallet
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot suspend your own wallet' })
    }

    // Fetch the employee
    const { rows: users } = await pool.query(
      'SELECT id, name, ppi_wallet_id, ppi_wallet_status FROM users WHERE id = $1',
      [id]
    )
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'Employee not found' })
    }

    const employee = users[0]

    if (!employee.ppi_wallet_id) {
      return res.status(400).json({ success: false, message: 'This employee does not have a PPI wallet linked' })
    }

    if (employee.ppi_wallet_status === 'SUSPENDED') {
      return res.status(400).json({ success: false, message: `Wallet is already suspended for ${employee.name}` })
    }

    if (employee.ppi_wallet_status === 'CLOSED') {
      return res.status(400).json({ success: false, message: `Cannot suspend a closed wallet. ${employee.name}'s wallet is permanently closed` })
    }

    // Call PPI suspend API (backend only — never from frontend)
    const result = await suspendPpiWallet(employee.ppi_wallet_id, reason.trim())

    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error || 'Failed to suspend wallet via PPI service' })
    }

    // Update local DB
    await pool.query(
      'UPDATE users SET ppi_wallet_status = $1 WHERE id = $2',
      [result.wallet_status || 'SUSPENDED', id]
    )

    res.json({
      success: true,
      message: `Wallet suspended successfully for ${employee.name}`,
      data: {
        employee_id: id,
        employee_name: employee.name,
        wallet_status: result.wallet_status || 'SUSPENDED',
        suspended_at: result.suspended_at,
        reason: reason.trim(),
        performed_by: req.user.name,
      }
    })
  } catch (e) { next(e) }
})

// ── POST /api/employees/:id/close-wallet ────────────────────
// Allowed: Super Admin only
router.post('/:id/close-wallet', async (req, res, next) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    // Role check — only Super Admin can permanently close
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can permanently close wallets' })
    }

    // Validate reason
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required to close a wallet' })
    }

    // Cannot close own wallet
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot close your own wallet' })
    }

    // Fetch the employee
    const { rows: users } = await pool.query(
      'SELECT id, name, ppi_wallet_id, ppi_wallet_status FROM users WHERE id = $1',
      [id]
    )
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'Employee not found' })
    }

    const employee = users[0]

    if (!employee.ppi_wallet_id) {
      return res.status(400).json({ success: false, message: 'This employee does not have a PPI wallet linked' })
    }

    if (employee.ppi_wallet_status === 'CLOSED') {
      return res.status(400).json({ success: false, message: `Wallet is already closed for ${employee.name}` })
    }

    // Call PPI close API (backend only — never from frontend)
    const result = await closePpiWallet(employee.ppi_wallet_id, reason.trim())

    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error || 'Failed to close wallet via PPI service' })
    }

    // Update local DB
    await pool.query(
      'UPDATE users SET ppi_wallet_status = $1 WHERE id = $2',
      [result.wallet_status || 'CLOSED', id]
    )

    // Deactivate the employee account
    await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [id])

    res.json({
      success: true,
      message: `Wallet permanently closed for ${employee.name}. Account deactivated.`,
      data: {
        employee_id: id,
        employee_name: employee.name,
        wallet_status: result.wallet_status || 'CLOSED',
        closed_at: result.closed_at,
        reason: reason.trim(),
        performed_by: req.user.name,
      }
    })
  } catch (e) { next(e) }
})

module.exports = router
