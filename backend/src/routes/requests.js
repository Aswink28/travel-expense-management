const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const { loadPpiWallet } = require('../services/ppiWallet')
const router  = express.Router()

router.use(authenticate)

// ── Sequential approval engine ───────────────────────────────
// Tier hierarchy (1 = highest authority). Lower authority approves first.
const ROLE_RANK = {
  'Super Admin':   1,
  'Booking Admin': 2,
  'Manager':       3,
  'Finance':       3,
  'Tech Lead':     4,
  'Software Engineer': 5,
}
function roleRank(role) { return ROLE_RANK[role] ?? 99 }

// Sort roles so the lowest-authority approver comes first (highest rank number first).
// Super Admin is filtered (handled via override lane) and Booking Admin is filtered
// (they manage post-approval bookings, not the approval flow itself).
function computeApprovalSequence(approverRoles) {
  if (!Array.isArray(approverRoles) || !approverRoles.length) return []
  const BLOCKED = new Set(['Super Admin', 'Booking Admin'])
  const uniq = [...new Set(approverRoles.filter(r => r && !BLOCKED.has(r)))]
  return uniq.sort((a, b) => roleRank(b) - roleRank(a))
}

// Returns the role expected to act next on the request, or null when every step is done.
async function nextPendingStep(client, requestId, sequence) {
  if (!sequence.length) return null
  const { rows } = await client.query(
    `SELECT DISTINCT approver_role FROM approvals WHERE request_id=$1 AND action='approved'`,
    [requestId]
  )
  const approved = new Set(rows.map(r => r.approver_role))
  return sequence.find(r => !approved.has(r)) || null
}

// Resolve the effective approver_roles sequence for a given request.
// Tier Config is the single source of truth; legacy paths remain as safety nets.
async function approverSequenceForRequest(client, tr) {
  // 1. Per-employee override (users.approver_roles)
  const { rows: userRows } = await client.query(
    'SELECT approver_roles FROM users WHERE id = $1',
    [tr.user_id]
  )
  const perUser = userRows[0]?.approver_roles
  if (Array.isArray(perUser) && perUser.length) return computeApprovalSequence(perUser)

  // 2. Tier defaults (via tier mapped to user's designation, or directly via tier_id)
  const { rows: tierRows } = await client.query(`
    SELECT t.approver_roles
    FROM users u
    LEFT JOIN tiers t ON t.id = u.tier_id
    WHERE u.id = $1
  `, [tr.user_id])
  const tierRoles = tierRows[0]?.approver_roles
  if (Array.isArray(tierRoles) && tierRoles.length) return computeApprovalSequence(tierRoles)

  // 3. Role-name designation fallback — look up designation_tiers using the user's role
  //    as the designation key. This lets existing employees (who have no designation
  //    set yet) still pick up the tier for their role.
  const { rows: roleTier } = await client.query(`
    SELECT t.approver_roles
    FROM designation_tiers dt
    JOIN tiers t ON t.id = dt.tier_id
    WHERE LOWER(dt.designation) = LOWER($1)
    LIMIT 1
  `, [tr.user_role])
  if (Array.isArray(roleTier[0]?.approver_roles) && roleTier[0].approver_roles.length) {
    return computeApprovalSequence(roleTier[0].approver_roles)
  }

  // 4. Legacy fallback (role_approvers table) — still honoured for backward compat
  const { rows: legacyRows } = await client.query(
    'SELECT approver_role_name FROM role_approvers WHERE role_name = $1',
    [tr.user_role]
  )
  return computeApprovalSequence(legacyRows.map(r => r.approver_role_name))
}

// ── Distance/mode lookup helper ───────────────────────────────
async function getDistanceInfo(from, to) {
  const { rows } = await pool.query(
    `SELECT dist_type, required_mode FROM v_distance_rules
     WHERE LOWER(from_l)=LOWER($1) AND LOWER(to_l)=LOWER($2)`,
    [from, to]
  )
  if (rows.length) return rows[0]
  // Default: if either is international keyword assume international
  const intl = ['london','singapore','dubai','new york','tokyo','sydney']
  const isIntl = intl.some(c => from.toLowerCase().includes(c) || to.toLowerCase().includes(c))
  return { dist_type: isIntl ? 'international' : 'short', required_mode: isIntl ? 'Flight' : null }
}

// ── GET /api/requests/distance-check ─────────────────────────
router.get('/distance-check', async (req, res, next) => {
  try {
    const { from, to } = req.query
    if (!from || !to) return res.status(400).json({ success:false, message:'from and to required' })
    const info = await getDistanceInfo(from, to)
    const { rows: tier } = await pool.query('SELECT allowed_modes FROM tier_config WHERE role=$1', [req.user.role])
    const allowed = tier[0]?.allowed_modes || []
    res.json({ success:true, data: { ...info, user_allowed_modes:allowed,
      effective_modes: info.required_mode ? [info.required_mode] : allowed.filter(m => m !== 'Metro')
    }})
  } catch(e) { next(e) }
})

// ── GET /api/requests ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { role, id:uid } = req.user
    const { status } = req.query
    let where = '', params = []
    if (role === 'Software Engineer')      { where = 'WHERE tr.user_id=$1'; params=[uid] }
    else if (role === 'Tech Lead') { where = `WHERE tr.user_role='Software Engineer'` }
    else if (role === 'Manager')   { where = `WHERE tr.user_role IN ('Software Engineer','Tech Lead','Finance')` }
    else if (role === 'Finance')   { where = `WHERE tr.status IN ('pending','pending_finance') OR tr.finance_approved=FALSE` }
    else if (role === 'Booking Admin') { where = `WHERE tr.status='approved' AND tr.booking_type='company'` }
    if (status) {
      where += (where?` AND `:' WHERE ') + `tr.status=$${params.length+1}`
      params.push(status)
    }
    const { rows } = await pool.query(`
      SELECT tr.*,
        COALESCE((SELECT json_agg(json_build_object('approver_name',a.approver_name,'approver_role',a.approver_role,'action',a.action,'note',a.note,'acted_at',a.acted_at) ORDER BY a.acted_at) FROM approvals a WHERE a.request_id=tr.id),'[]') AS approvals,
        COALESCE((SELECT json_agg(json_build_object('id',b.id,'category',b.category,'amount',b.amount,'vendor',b.vendor,'status',b.status,'pnr_number',b.pnr_number,'booking_ref',b.booking_ref,'travel_date',b.travel_date,'created_at',b.created_at) ORDER BY b.created_at) FROM bookings b WHERE b.request_id=tr.id),'[]') AS bookings_list,
        COALESCE((SELECT json_agg(json_build_object('id',d.id,'doc_type',d.doc_type,'file_name',d.file_name,'original_name',d.original_name,'description',d.description,'created_at',d.created_at,'booking_id',d.booking_id) ORDER BY d.created_at) FROM documents d WHERE d.request_id=tr.id AND d.is_visible=TRUE),'[]') AS documents,
        COALESCE((SELECT json_agg(json_build_object('id',t.id,'pnr_number',t.pnr_number,'ticket_type',t.ticket_type,'travel_mode',t.travel_mode,'vendor',t.vendor,'status',t.status) ORDER BY t.created_at) FROM tickets t WHERE t.request_id=tr.id),'[]') AS tickets,
        w.balance AS wallet_balance, w.travel_balance, w.hotel_balance, w.allowance_balance
      FROM travel_requests tr
      LEFT JOIN wallets w ON w.user_id=tr.user_id
      ${where}
      ORDER BY tr.submitted_at DESC
    `, params)
    res.json({ success:true, count:rows.length, data:rows })
  } catch(e) { next(e) }
})

// ── GET /api/requests/queue ───────────────────────────────────
router.get('/queue', async (req, res, next) => {
  try {
    const { role, id: uid } = req.user
    // Employees submit requests but never approve them.
    // Booking Admin handles post-approval bookings only — they're not part of the approval flow.
    if (['Software Engineer', 'Booking Admin'].includes(role)) return res.json({ success: true, count: 0, data: [] })

    // Super Admin: sees all pending (override lane).
    if (role === 'Super Admin') {
      const { rows } = await pool.query(`
        SELECT tr.*, COALESCE((SELECT json_agg(json_build_object('approver_name',a.approver_name,'approver_role',a.approver_role,'action',a.action,'note',a.note,'acted_at',a.acted_at) ORDER BY a.acted_at) FROM approvals a WHERE a.request_id=tr.id),'[]') AS approvals
        FROM travel_requests tr
        WHERE tr.status='pending' AND tr.user_id != $1
        ORDER BY tr.submitted_at ASC
      `, [uid])
      return res.json({ success: true, count: rows.length, data: rows })
    }

    // Every other role (including Finance): show only requests whose NEXT pending
    // step matches this role. If Finance is NOT part of the sequence (legacy budget
    // lane) we fall back to the old behaviour of surfacing it for the amount set-up.
    const isFinance = role === 'Finance'
    const { rows: candidates } = await pool.query(`
      SELECT tr.*,
             COALESCE((SELECT json_agg(json_build_object('approver_name',a.approver_name,'approver_role',a.approver_role,'action',a.action,'note',a.note,'acted_at',a.acted_at) ORDER BY a.acted_at) FROM approvals a WHERE a.request_id=tr.id),'[]') AS approvals
      FROM travel_requests tr
      WHERE tr.status IN ('pending','pending_finance')
        AND (
          (tr.status = 'pending' AND tr.hierarchy_approved = FALSE)
          OR ($2 = TRUE AND tr.finance_approved = FALSE)
        )
        AND tr.user_id != $1
        AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)
      ORDER BY tr.submitted_at ASC
    `, [uid, isFinance])

    const filtered = []
    for (const tr of candidates) {
      const sequence = await approverSequenceForRequest(pool, tr)
      if (isFinance && !sequence.includes('Finance')) {
        // Parallel budget lane — Finance handles amounts independently.
        filtered.push(tr)
        continue
      }
      const step = await nextPendingStep(pool, tr.id, sequence)
      if (step === role) filtered.push(tr)
    }
    res.json({ success: true, count: filtered.length, data: filtered })
  } catch (e) { next(e) }
})

// ── GET /api/requests/:id ─────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT tr.*, tc.daily_allowance, tc.max_hotel_per_night, tc.allowed_modes,
        COALESCE((SELECT json_agg(json_build_object('id',a.id,'approver_name',a.approver_name,'approver_role',a.approver_role,'action',a.action,'note',a.note,'approved_travel_cost',a.approved_travel_cost,'approved_hotel_cost',a.approved_hotel_cost,'approved_allowance',a.approved_allowance,'acted_at',a.acted_at) ORDER BY a.acted_at) FROM approvals a WHERE a.request_id=tr.id),'[]') AS approvals,
        COALESCE((SELECT json_agg(json_build_object('id',b.id,'category',b.category,'amount',b.amount,'vendor',b.vendor,'status',b.status,'pnr_number',b.pnr_number,'booking_ref',b.booking_ref,'travel_date',b.travel_date,'check_in_date',b.check_in_date,'check_out_date',b.check_out_date,'notes',b.notes,'created_at',b.created_at) ORDER BY b.created_at) FROM bookings b WHERE b.request_id=tr.id),'[]') AS bookings_list,
        COALESCE((SELECT json_agg(json_build_object('id',d.id,'doc_type',d.doc_type,'file_name',d.file_name,'original_name',d.original_name,'description',d.description,'mime_type',d.mime_type,'booking_id',d.booking_id,'created_at',d.created_at) ORDER BY d.created_at) FROM documents d WHERE d.request_id=tr.id AND d.is_visible=TRUE),'[]') AS documents,
        COALESCE((SELECT json_agg(json_build_object('id',t.id,'pnr_number',t.pnr_number,'ticket_type',t.ticket_type,'travel_mode',t.travel_mode,'vendor',t.vendor,'status',t.status) ORDER BY t.created_at) FROM tickets t WHERE t.request_id=tr.id),'[]') AS tickets,
        w.balance AS wallet_balance, w.travel_balance, w.hotel_balance, w.allowance_balance
      FROM travel_requests tr
      LEFT JOIN tier_config tc ON tc.role=tr.user_role
      LEFT JOIN wallets w ON w.user_id=tr.user_id
      WHERE tr.id=$1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ success:false, message:'Not found' })
    res.json({ success:true, data:rows[0] })
  } catch(e) { next(e) }
})

// ── POST /api/requests ────────────────────────────────────────
router.post('/', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const u = req.user
    const {
      from_location, to_location, travel_mode, booking_type, start_date, end_date, purpose, notes, estimated_travel_cost, estimated_hotel_cost,
      trip_name, trip_type, project_name, contact_name, contact_mobile, contact_email, itinerary, passengers
    } = req.body

    if (!from_location||!to_location||!travel_mode||!booking_type||!start_date||!end_date||!purpose)
      return res.status(400).json({ success:false, message:'from_location, to_location, travel_mode, booking_type, start_date, end_date, purpose are required' })

    // Date validation
    const today = new Date(); today.setHours(0,0,0,0)
    if (new Date(start_date) < today) return res.status(400).json({ success:false, message:'Start date cannot be in the past' })
    if (new Date(end_date) < new Date(start_date)) return res.status(400).json({ success:false, message:'End date must be on or after start date' })

    // Distance + mode validation
    const distInfo = await getDistanceInfo(from_location, to_location)
    if (distInfo.required_mode && travel_mode !== distInfo.required_mode) {
      return res.status(400).json({ success:false, message:`${distInfo.dist_type} distance route requires ${distInfo.required_mode}. You selected ${travel_mode}.` })
    }

    // Tier eligibility
    const { rows: tier } = await client.query('SELECT * FROM tier_config WHERE role=$1', [u.role])
    if (tier.length && !tier[0].allowed_modes.includes(travel_mode)) {
      return res.status(400).json({ success:false, message:`Travel mode "${travel_mode}" not allowed for ${u.role}` })
    }

    // Calculate daily allowance: days × daily_allowance
    const days = Math.ceil((new Date(end_date)-new Date(start_date))/(1000*60*60*24)) + 1
    const dailyAllow = tier[0]?.daily_allowance || 500
    const allowance  = days * dailyAllow
    const travelCost = Number(estimated_travel_cost||0)
    const hotelCost  = Number(estimated_hotel_cost||0)
    const total      = travelCost + hotelCost + allowance

    const id = 'TR-' + Date.now().toString().slice(-7)
    
    await client.query(`
      INSERT INTO travel_requests (
        id,user_id,user_name,user_role,department,from_location,to_location,distance_type,required_mode,travel_mode,booking_type,start_date,end_date,purpose,notes,
        estimated_travel_cost,estimated_hotel_cost,estimated_total,status,
        trip_name, trip_type, project_name, contact_name, contact_mobile, contact_email, itinerary, passengers
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending', $19,$20,$21,$22,$23,$24,$25,$26)
    `, [
      id,u.id,u.name,u.role,u.department,from_location,to_location,distInfo.dist_type,distInfo.required_mode||null,travel_mode,booking_type,start_date,end_date,purpose,notes||null,
      travelCost,hotelCost,total,
      trip_name||"Default Trip", trip_type||"Domestic", project_name||null, contact_name||u.name, contact_mobile||null, contact_email||null,
      itinerary ? JSON.stringify(itinerary) : '{}',
      passengers ? JSON.stringify(passengers) : '[]'
    ])

    await client.query('COMMIT')
    const { rows } = await pool.query('SELECT * FROM travel_requests WHERE id=$1',[id])
    res.status(201).json({ success:true, message:'Request submitted', data:rows[0] })
  } catch(e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

// ── POST /api/requests/:id/action ────────────────────────────
router.post('/:id/action', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { id } = req.params
    const { action, note, approved_travel_cost, approved_hotel_cost, approved_allowance } = req.body
    const u = req.user

    if (!['approved','rejected'].includes(action)) { await client.query('ROLLBACK'); return res.status(400).json({ success:false, message:'action must be approved or rejected' }) }
    if (action==='rejected' && !note?.trim())      { await client.query('ROLLBACK'); return res.status(400).json({ success:false, message:'Rejection note required' }) }
    if (u.role === 'Booking Admin')                { await client.query('ROLLBACK'); return res.status(403).json({ success:false, message:'Booking Admin is not part of the approval flow' }) }

    const { rows: reqRows } = await client.query('SELECT * FROM travel_requests WHERE id=$1 FOR UPDATE',[id])
    if (!reqRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success:false, message:'Not found' }) }
    const tr = reqRows[0]

    if (!['pending','pending_finance'].includes(tr.status)) { await client.query('ROLLBACK'); return res.status(400).json({ success:false, message:`Request is already ${tr.status}` }) }
    if (tr.user_id === u.id)                                { await client.query('ROLLBACK'); return res.status(403).json({ success:false, message:'Cannot approve own request' }) }

    const { rows:acted } = await client.query('SELECT 1 FROM approvals WHERE request_id=$1 AND approver_id=$2',[id,u.id])
    if (acted.length) { await client.query('ROLLBACK'); return res.status(409).json({ success:false, message:'Already acted on this request' }) }

    // Pre-validate the approval sequence BEFORE inserting the approval row so we don't
    // leave a stale row behind when early-returning with 403.
    let sequence = []
    let inSequence = false
    if (action === 'approved' && u.role !== 'Super Admin') {
      sequence   = await approverSequenceForRequest(client, tr)
      inSequence = sequence.includes(u.role)
      const isFinance = u.role === 'Finance'

      if (!inSequence && !isFinance) {
        await client.query('ROLLBACK')
        return res.status(403).json({ success: false, message: `Your role (${u.role}) is not configured to approve requests from ${tr.user_name}` })
      }

      if (inSequence) {
        if (!sequence.length) {
          await client.query('ROLLBACK')
          return res.status(403).json({ success: false, message: 'No approval flow is configured for this employee' })
        }
        const step = await nextPendingStep(client, id, sequence)
        if (step === null) {
          await client.query('ROLLBACK')
          return res.status(409).json({ success: false, message: 'Approval sequence already complete' })
        }
        if (step !== u.role) {
          const order = sequence.map((r, i) => `${i + 1}. ${r}`).join(' → ')
          await client.query('ROLLBACK')
          return res.status(403).json({
            success: false,
            message: `Out of order. The next approver must be ${step}. Sequence: ${order}`,
          })
        }
      }
    }

    await client.query('INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id,u.id,u.name,u.role,action,note||null,approved_travel_cost||null,approved_hotel_cost||null,approved_allowance||null])

    let walletWarning = null

    if (action==='rejected') {
      await client.query("UPDATE travel_requests SET status='rejected',rejected_by=$1,rejection_reason=$2 WHERE id=$3",[u.name,note,id])
    } else {
      // Update approval flags
      if (u.role === 'Super Admin') {
        await client.query(`UPDATE travel_requests SET hierarchy_approved=TRUE,hierarchy_approved_by=$1,hierarchy_approved_at=NOW(),finance_approved=TRUE,finance_approved_by=$1,finance_approved_at=NOW() WHERE id=$2`, [u.name, id])
      } else if (inSequence) {
        // Recompute: is the sequence now complete (including this approval)?
        const remaining = await nextPendingStep(client, id, sequence)
        if (remaining === null) {
          await client.query(`UPDATE travel_requests SET hierarchy_approved=TRUE,hierarchy_approved_by=$1,hierarchy_approved_at=NOW() WHERE id=$2`, [u.name, id])
        }
      }
      // Finance always sets finance_approved + amounts — whether in-sequence or parallel.
      if (u.role==='Finance') {
        const appTravel = approved_travel_cost || tr.estimated_travel_cost
        const appHotel  = approved_hotel_cost  || tr.estimated_hotel_cost
        const days      = tr.total_days || 1
        const { rows:tier } = await client.query('SELECT daily_allowance FROM tier_config WHERE role=$1',[tr.user_role])
        const appAllow  = approved_allowance || (days * (tier[0]?.daily_allowance||500))
        await client.query(`UPDATE travel_requests SET finance_approved=TRUE,finance_approved_by=$1,finance_approved_at=NOW(),approved_travel_cost=$2,approved_hotel_cost=$3,approved_allowance=$4,approved_total=$5 WHERE id=$6`,
          [u.name,appTravel,appHotel,appAllow,Number(appTravel)+Number(appHotel)+Number(appAllow),id])
      }

      // Check both lanes done
      const { rows:fresh } = await client.query('SELECT * FROM travel_requests WHERE id=$1',[id])
      const r2 = fresh[0]
      const hierarchyDone = r2.hierarchy_approved
      const financeDone   = r2.finance_approved
      const bothDone      = hierarchyDone && financeDone

      if (bothDone) {
        const total = Number(r2.approved_travel_cost||0)+Number(r2.approved_hotel_cost||0)+Number(r2.approved_allowance||0)
        await client.query("UPDATE travel_requests SET status='approved',approved_total=$1,ppi_load_status='loading' WHERE id=$2",[total,id])

        // ── Fetch user's PPI walletId and status from DB ──
        const { rows:userRow } = await client.query('SELECT ppi_wallet_id, ppi_wallet_status FROM users WHERE id=$1',[r2.user_id])
        const ppiWalletId = userRow[0]?.ppi_wallet_id
        const ppiWalletStatus = (userRow[0]?.ppi_wallet_status || 'ACTIVE').toUpperCase()

        // ── Lock internal wallet ──
        const { rows:wallet } = await client.query('SELECT id,balance FROM wallets WHERE user_id=$1 FOR UPDATE',[r2.user_id])

        if (wallet.length && ppiWalletId && ppiWalletStatus === 'ACTIVE') {
          let bal = Number(wallet[0].balance)
          const tCost = Number(r2.approved_travel_cost||0)
          const hCost = Number(r2.approved_hotel_cost||0)
          const aCost = Number(r2.approved_allowance||0)

          // ── Build category loads with unique referenceIds for idempotency ──
          const loads = []
          if (tCost > 0) loads.push({ category: 'travel',    amount: tCost, desc: `Travel cost — ${id}`,                       ref: `${id}-TRAVEL` })
          if (hCost > 0) loads.push({ category: 'hotel',     amount: hCost, desc: `Hotel cost — ${id}`,                        ref: `${id}-HOTEL` })
          if (aCost > 0) loads.push({ category: 'allowance', amount: aCost, desc: `Daily allowance (${r2.total_days} days) — ${id}`, ref: `${id}-ALLOW` })

          let allPpiSuccess = true
          let ppiError = null

          for (const load of loads) {
            // ── Idempotency: skip if this referenceId was already loaded ──
            const { rows: existing } = await client.query(
              `SELECT id FROM wallet_transactions WHERE request_id=$1 AND reference=$2 AND ppi_status='SUCCESS'`,
              [id, load.ref]
            )
            if (existing.length) {
              bal += load.amount  // already loaded, just track balance
              continue
            }

            // ── Call PPI wallet load API (backend-only, never from frontend) ──
            const ppiResult = await loadPpiWallet(ppiWalletId, load.amount, load.ref, 'Bank')

            bal += load.amount
            await client.query(
              `INSERT INTO wallet_transactions
                (wallet_id, user_id, request_id, txn_type, category, amount, description, performed_by, balance_after, reference, ppi_txn_ref, ppi_status, ppi_new_balance, ppi_trace_id)
               VALUES ($1,$2,$3,'credit',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [
                wallet[0].id, r2.user_id, id,
                load.category, load.amount, load.desc, u.id, bal, load.ref,
                ppiResult.txn_ref_number || null,
                ppiResult.success ? 'SUCCESS' : 'FAILED',
                ppiResult.new_balance || null,
                ppiResult.traceId || null,
              ]
            )

            if (!ppiResult.success) {
              allPpiSuccess = false
              ppiError = ppiResult.error
              console.error(`[WALLET-LOAD] PPI load failed for ${load.ref}: ${ppiResult.error}`)
            }
          }

          // ── Update request with load status ──
          if (allPpiSuccess) {
            await client.query(
              "UPDATE travel_requests SET wallet_credited=TRUE, wallet_credit_amount=$1, wallet_credited_at=NOW(), ppi_load_status='loaded', ppi_load_error=NULL WHERE id=$2",
              [total, id]
            )
          } else {
            await client.query(
              "UPDATE travel_requests SET wallet_credited=TRUE, wallet_credit_amount=$1, wallet_credited_at=NOW(), ppi_load_status='failed', ppi_load_error=$2 WHERE id=$3",
              [total, ppiError, id]
            )
          }
        } else if (wallet.length && ppiWalletId && ppiWalletStatus !== 'ACTIVE') {
          // ── PPI wallet is SUSPENDED or CLOSED — credit internal wallet, skip PPI load ──
          let bal = Number(wallet[0].balance)
          const tCost = Number(r2.approved_travel_cost||0)
          const hCost = Number(r2.approved_hotel_cost||0)
          const aCost = Number(r2.approved_allowance||0)

          if (tCost>0) { bal+=tCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference,ppi_status) VALUES ($1,$2,$3,'credit','travel',$4,$5,$6,$7,$8,'SKIPPED')`, [wallet[0].id,r2.user_id,id,tCost,`Travel cost — ${id}`,u.id,bal,`${id}-TRAVEL`]) }
          if (hCost>0) { bal+=hCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference,ppi_status) VALUES ($1,$2,$3,'credit','hotel',$4,$5,$6,$7,$8,'SKIPPED')`, [wallet[0].id,r2.user_id,id,hCost,`Hotel cost — ${id}`,u.id,bal,`${id}-HOTEL`]) }
          if (aCost>0) { bal+=aCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference,ppi_status) VALUES ($1,$2,$3,'credit','allowance',$4,$5,$6,$7,$8,'SKIPPED')`, [wallet[0].id,r2.user_id,id,aCost,`Daily allowance (${r2.total_days} days) — ${id}`,u.id,bal,`${id}-ALLOW`]) }

          await client.query(
            "UPDATE travel_requests SET wallet_credited=TRUE, wallet_credit_amount=$1, wallet_credited_at=NOW(), ppi_load_status='failed', ppi_load_error=$2 WHERE id=$3",
            [total, `PPI wallet is ${ppiWalletStatus} — load skipped`, id]
          )
          walletWarning = `Employee's PPI wallet is ${ppiWalletStatus}. Internal wallet was credited but PPI wallet load was skipped. The employee cannot use these funds until the wallet is reactivated.`
        } else if (wallet.length && !ppiWalletId) {
          // ── No PPI wallet linked — credit internal wallet only ──
          let bal = Number(wallet[0].balance)
          const tCost = Number(r2.approved_travel_cost||0)
          const hCost = Number(r2.approved_hotel_cost||0)
          const aCost = Number(r2.approved_allowance||0)

          if (tCost>0) { bal+=tCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference,ppi_status) VALUES ($1,$2,$3,'credit','travel',$4,$5,$6,$7,$8,'SKIPPED')`, [wallet[0].id,r2.user_id,id,tCost,`Travel cost — ${id}`,u.id,bal,`${id}-TRAVEL`]) }
          if (hCost>0) { bal+=hCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference,ppi_status) VALUES ($1,$2,$3,'credit','hotel',$4,$5,$6,$7,$8,'SKIPPED')`, [wallet[0].id,r2.user_id,id,hCost,`Hotel cost — ${id}`,u.id,bal,`${id}-HOTEL`]) }
          if (aCost>0) { bal+=aCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference,ppi_status) VALUES ($1,$2,$3,'credit','allowance',$4,$5,$6,$7,$8,'SKIPPED')`, [wallet[0].id,r2.user_id,id,aCost,`Daily allowance (${r2.total_days} days) — ${id}`,u.id,bal,`${id}-ALLOW`]) }

          await client.query(
            "UPDATE travel_requests SET wallet_credited=TRUE, wallet_credit_amount=$1, wallet_credited_at=NOW(), ppi_load_status='loaded', ppi_load_error=NULL WHERE id=$2",
            [total, id]
          )
        }
      } else if (hierarchyDone && !financeDone) {
        await client.query("UPDATE travel_requests SET status='pending_finance' WHERE id=$1",[id])
      }
    }

    await client.query('COMMIT')
    const { rows } = await pool.query(`SELECT tr.*,COALESCE((SELECT json_agg(json_build_object('approver_name',a.approver_name,'approver_role',a.approver_role,'action',a.action,'note',a.note,'acted_at',a.acted_at) ORDER BY a.acted_at) FROM approvals a WHERE a.request_id=tr.id),'[]') AS approvals FROM travel_requests tr WHERE tr.id=$1`,[id])
    const response = { success:true, message:`Request ${action}`, data:rows[0] }
    if (walletWarning) response.walletWarning = walletWarning
    res.json(response)
  } catch(e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

module.exports = router
