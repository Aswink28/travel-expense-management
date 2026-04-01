const express  = require('express')
const bcrypt   = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const pool     = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router   = express.Router()

// ── PPI Wallet API helper ────────────────────────────────────
async function createPpiWallet(employeeData) {
  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  // Match exact PPI API field names from spec
  const body = {
    customerMobile: employeeData.mobile_number,
    customerName:   employeeData.name,
    customerEmail:  employeeData.email,
    aadhaarNumber:  employeeData.aadhaar_number,
    panNumber:      employeeData.pan_number,
    dateOfBirth:    employeeData.date_of_birth,
    gender:         employeeData.gender?.toUpperCase(),
    productId:      employeeData.productId,
  }

  console.log(`[PPI] Creating wallet — requestId: ${requestId}, mobile: ${employeeData.mobile_number}`)

  let res, data
  try {
    res = await fetch(process.env.PPI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Partner-Key':   process.env.PPI_PARTNER_KEY,
        'X-Partner-Secret': process.env.PPI_PARTNER_SECRET,
        'X-Request-Id':    requestId,
        'X-Timestamp':     timestamp,
      },
      body: JSON.stringify(body),
    })
    data = await res.json()
  } catch (networkErr) {
    console.error(`[PPI] Network error — requestId: ${requestId}`, networkErr.message)
    const err = new Error('Unable to connect to wallet service. Please try again later.')
    err.requestId = requestId
    throw err
  }

  // Response: { success, data: { walletId, walletNumber, ... }, message, traceId }
  if (!res.ok || !data.success || !data.data?.walletId) {
    console.error(`[PPI] Wallet creation failed — requestId: ${requestId}, status: ${res.status}, response:`, JSON.stringify(data))
    const errMsg = data.message || data.error || `Wallet service returned status ${res.status}`
    const err = new Error(errMsg)
    err.ppiResponse = data
    err.requestId = data.traceId || requestId
    throw err
  }

  const wallet = data.data
  console.log(`[PPI] Wallet created — requestId: ${requestId}, walletId: ${wallet.walletId}, walletNumber: ${wallet.walletNumber}`)

  return {
    walletId:     wallet.walletId,
    walletNumber: wallet.walletNumber || null,
    customerId:   wallet.customerId || null,
    walletStatus: wallet.walletStatus || null,
    kycStatus:    wallet.kycStatus || null,
    traceId:      data.traceId || requestId,
  }
}

router.use(authenticate)
router.use(authorise('Super Admin'))

// ── GET /api/employees ───────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.emp_id, u.name, u.email, u.role, u.department,
             u.avatar, u.color, u.reporting_to, u.is_active,
             u.mobile_number, u.date_of_birth, u.gender, u.pan_number, u.aadhaar_number,
             u.ppi_wallet_id, u.ppi_wallet_number, u.ppi_customer_id, u.ppi_wallet_status, u.ppi_kyc_status,
             u.last_login, u.created_at,
             w.balance AS wallet_balance
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      ORDER BY u.created_at DESC
    `)
    res.json({ success: true, data: rows })
  } catch (e) { next(e) }
})

// ── POST /api/employees ──────────────────────────────────────
router.post('/', async (req, res, next) => {
  const { name, email, password, role, department, reporting_to,
          mobile_number, date_of_birth, gender, pan_number, aadhaar_number, productId } = req.body

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, email, password, and role are required' })
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

    const password_hash = await bcrypt.hash(password, 10)

    // ── Call PPI Wallet API before inserting ─────────────────
    let ppiWallet
    try {
      ppiWallet = await createPpiWallet({
        productId:      productId || 'cbad7cad-5bef-4289-9150-15d613fcb89b',
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
                          ppi_wallet_id, ppi_wallet_number, ppi_customer_id, ppi_wallet_status, ppi_kyc_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id, emp_id, name, email, role, department, avatar, color, reporting_to, is_active,
                 mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                 ppi_wallet_id, ppi_wallet_number, ppi_customer_id, ppi_wallet_status, ppi_kyc_status, created_at`,
      [emp_id, name.trim(), email.trim().toLowerCase(), password_hash, role, department || 'Engineering',
       avatar, color, reporting_to || null, mobile_number, date_of_birth, gender,
       pan_number.toUpperCase(), aadhaar_number,
       ppiWallet.walletId, ppiWallet.walletNumber, ppiWallet.customerId,
       ppiWallet.walletStatus, ppiWallet.kycStatus]
    )

    // Create internal wallet for the new employee
    await client.query(
      `INSERT INTO wallets (user_id, balance, total_credited, total_debited, travel_balance, hotel_balance, allowance_balance)
       VALUES ($1, 0, 0, 0, 0, 0, 0)`,
      [user.id]
    )

    await client.query('COMMIT')
    res.status(201).json({ success: true, message: 'Employee created successfully', data: user })
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
            mobile_number, date_of_birth, gender, pan_number, aadhaar_number } = req.body
    const { id } = req.params

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

    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' })

    vals.push(id)
    const { rows: [user] } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, emp_id, name, email, role, department, avatar, color, reporting_to, is_active,
                 mobile_number, date_of_birth, gender, pan_number, aadhaar_number, created_at`,
      vals
    )

    res.json({ success: true, message: 'Employee updated', data: user })
  } catch (e) { next(e) }
})

// ── PATCH /api/employees/:id/status ──────────────────────────
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params
    const { is_active } = req.body

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' })
    }

    const { rows: [user] } = await pool.query(
      `UPDATE users SET is_active = $1 WHERE id = $2
       RETURNING id, emp_id, name, email, role, is_active`,
      [is_active, id]
    )
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' })

    res.json({ success: true, message: `Employee ${user.is_active ? 'activated' : 'deactivated'}`, data: user })
  } catch (e) { next(e) }
})

module.exports = router
