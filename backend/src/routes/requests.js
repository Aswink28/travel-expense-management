const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

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
    if (role === 'Employee')      { where = 'WHERE tr.user_id=$1'; params=[uid] }
    else if (role === 'Tech Lead') { where = `WHERE tr.user_role='Employee'` }
    else if (role === 'Manager')   { where = `WHERE tr.user_role IN ('Employee','Tech Lead','Finance')` }
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
    const { role, id:uid } = req.user
    if (['Employee','Booking Admin'].includes(role)) return res.json({ success:true, count:0, data:[] })
    let where = '', params = [uid]
    if (role === 'Super Admin')   where = `WHERE tr.status='pending' AND tr.user_id!=$1`
    else if (role === 'Finance')  where = `WHERE tr.status IN ('pending','pending_finance') AND tr.finance_approved=FALSE AND tr.user_id!=$1 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)`
    else if (role === 'Tech Lead') where = `WHERE tr.status='pending' AND tr.hierarchy_approved=FALSE AND tr.user_role='Employee' AND tr.user_id!=$1 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)`
    else if (role === 'Manager')  where = `WHERE tr.status='pending' AND tr.hierarchy_approved=FALSE AND tr.user_role IN ('Employee','Tech Lead') AND tr.user_id!=$1 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)`
    const { rows } = await pool.query(`
      SELECT tr.*, COALESCE((SELECT json_agg(json_build_object('approver_name',a.approver_name,'approver_role',a.approver_role,'action',a.action,'note',a.note,'acted_at',a.acted_at) ORDER BY a.acted_at) FROM approvals a WHERE a.request_id=tr.id),'[]') AS approvals
      FROM travel_requests tr ${where}
      ORDER BY tr.submitted_at ASC
    `, params)
    res.json({ success:true, count:rows.length, data:rows })
  } catch(e) { next(e) }
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
      trip_name, trip_type, approver_1, approver_2, approver_3, project_name, contact_name, contact_mobile, contact_email, itinerary, passengers
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
    
    // Inject the rich JSON payload into the new columns
    await client.query(`
      INSERT INTO travel_requests (
        id,user_id,user_name,user_role,department,from_location,to_location,distance_type,required_mode,travel_mode,booking_type,start_date,end_date,purpose,notes,
        estimated_travel_cost,estimated_hotel_cost,estimated_total,status,
        trip_name, trip_type, approver_1, approver_2, approver_3, project_name, contact_name, contact_mobile, contact_email, itinerary, passengers
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending', $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
    `, [
      id,u.id,u.name,u.role,u.department,from_location,to_location,distInfo.dist_type,distInfo.required_mode||null,travel_mode,booking_type,start_date,end_date,purpose,notes||null,
      travelCost,hotelCost,total,
      trip_name||"Default Trip", trip_type||"Domestic", approver_1||null, approver_2||null, approver_3||null, project_name||null, contact_name||u.name, contact_mobile||null, contact_email||null,
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

    if (!['approved','rejected'].includes(action)) return res.status(400).json({ success:false, message:'action must be approved or rejected' })
    if (action==='rejected' && !note?.trim()) return res.status(400).json({ success:false, message:'Rejection note required' })

    const { rows: reqRows } = await client.query('SELECT * FROM travel_requests WHERE id=$1 FOR UPDATE',[id])
    if (!reqRows.length) return res.status(404).json({ success:false, message:'Not found' })
    const tr = reqRows[0]

    if (!['pending','pending_finance'].includes(tr.status)) return res.status(400).json({ success:false, message:`Request is already ${tr.status}` })
    if (tr.user_id === u.id) return res.status(403).json({ success:false, message:'Cannot approve own request' })

    const { rows:acted } = await client.query('SELECT 1 FROM approvals WHERE request_id=$1 AND approver_id=$2',[id,u.id])
    if (acted.length) return res.status(409).json({ success:false, message:'Already acted on this request' })

    await client.query('INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id,u.id,u.name,u.role,action,note||null,approved_travel_cost||null,approved_hotel_cost||null,approved_allowance||null])

    if (action==='rejected') {
      await client.query("UPDATE travel_requests SET status='rejected',rejected_by=$1,rejection_reason=$2 WHERE id=$3",[u.name,note,id])
    } else {
      // Update approval flags
      if (u.role==='Super Admin') {
        await client.query(`UPDATE travel_requests SET hierarchy_approved=TRUE,hierarchy_approved_by=$1,hierarchy_approved_at=NOW(),finance_approved=TRUE,finance_approved_by=$1,finance_approved_at=NOW() WHERE id=$2`,[u.name,id])
      } else if (['Tech Lead','Manager'].includes(u.role)) {
        await client.query(`UPDATE travel_requests SET hierarchy_approved=TRUE,hierarchy_approved_by=$1,hierarchy_approved_at=NOW() WHERE id=$2`,[u.name,id])
      } else if (u.role==='Finance') {
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
        await client.query("UPDATE travel_requests SET status='approved',approved_total=$1 WHERE id=$2",[total,id])

        // Credit wallet with 3 separate transactions
        const { rows:wallet } = await client.query('SELECT id,balance FROM wallets WHERE user_id=$1 FOR UPDATE',[r2.user_id])
        if (wallet.length) {
          let bal = Number(wallet[0].balance)
          const tCost = Number(r2.approved_travel_cost||0)
          const hCost = Number(r2.approved_hotel_cost||0)
          const aCost = Number(r2.approved_allowance||0)

          if (tCost>0) { bal+=tCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,$3,'credit','travel',$4,$5,$6)`, [wallet[0].id,r2.user_id,id,tCost,`Travel cost — ${id}`,bal]) }
          if (hCost>0) { bal+=hCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,$3,'credit','hotel',$4,$5,$6)`, [wallet[0].id,r2.user_id,id,hCost,`Hotel cost — ${id}`,bal]) }
          if (aCost>0) { bal+=aCost; await client.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,$3,'credit','allowance',$4,$5,$6)`, [wallet[0].id,r2.user_id,id,aCost,`Daily allowance (${r2.total_days} days) — ${id}`,bal]) }

          await client.query("UPDATE travel_requests SET wallet_credited=TRUE,wallet_credit_amount=$1,wallet_credited_at=NOW() WHERE id=$2",[total,id])
        }
      } else if (hierarchyDone && !financeDone) {
        await client.query("UPDATE travel_requests SET status='pending_finance' WHERE id=$1",[id])
      }
    }

    await client.query('COMMIT')
    const { rows } = await pool.query(`SELECT tr.*,COALESCE((SELECT json_agg(json_build_object('approver_name',a.approver_name,'approver_role',a.approver_role,'action',a.action,'note',a.note,'acted_at',a.acted_at) ORDER BY a.acted_at) FROM approvals a WHERE a.request_id=tr.id),'[]') AS approvals FROM travel_requests tr WHERE tr.id=$1`,[id])
    res.json({ success:true, message:`Request ${action}`, data:rows[0] })
  } catch(e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

module.exports = router
