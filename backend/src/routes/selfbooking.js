const express = require('express')
const pool    = require('../config/db')
const { v4: uuidv4 } = require('uuid')
const { authenticate } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────
function genPNR() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let pnr = ''
  for (let i = 0; i < 10; i++) pnr += chars[Math.floor(Math.random() * chars.length)]
  return pnr
}

function genRef(prefix) {
  return `${prefix}${Date.now().toString().slice(-8)}${Math.floor(Math.random()*100).toString().padStart(2,'0')}`
}

function buildTicketData(type, form, user, request, amount) {
  const base = {
    ticketType:    type,
    passengerName: user.name,
    empId:         user.emp_id,
    requestId:     request.id,
    purpose:       request.purpose,
    issuedAt:      new Date().toISOString(),
    amount,
    currency:      'INR',
  }
  if (type === 'transport') {
    return {
      ...base,
      travelMode:    form.travel_mode,
      fromLocation:  form.from_location || request.from_location,
      toLocation:    form.to_location   || request.to_location,
      travelDate:    form.travel_date,
      travelTime:    form.travel_time   || '',
      seatClass:     form.seat_class    || '',
      seatNumber:    form.seat_number   || '',
      vendor:        form.vendor        || '',
      trainNumber:   form.train_number  || '',
      flightNumber:  form.flight_number || '',
    }
  }
  return {
    ...base,
    hotelName:     form.hotel_name    || form.vendor || '',
    hotelAddress:  form.hotel_address || '',
    checkInDate:   form.check_in_date,
    checkOutDate:  form.check_out_date,
    roomType:      form.room_type     || 'Standard',
    numNights:     form.num_nights    || 1,
    vendor:        form.vendor        || '',
  }
}

// ── GET /api/self-booking/my-approved ─────────────────────────
// Returns employee's approved requests with wallet + ticket info
router.get('/my-approved', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        tr.*,
        w.balance           AS wallet_balance,
        w.travel_balance,
        w.hotel_balance,
        w.allowance_balance,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', b.id, 'category', b.category, 'amount', b.amount,
            'status', b.status, 'created_at', b.created_at,
            'ticket', (SELECT json_build_object(
              'id', t.id, 'pnr_number', t.pnr_number, 'booking_ref', t.booking_ref,
              'ticket_type', t.ticket_type, 'travel_mode', t.travel_mode,
              'from_location', t.from_location, 'to_location', t.to_location,
              'travel_date', t.travel_date, 'hotel_name', t.hotel_name,
              'check_in_date', t.check_in_date, 'check_out_date', t.check_out_date,
              'seat_class', t.seat_class, 'vendor', t.vendor, 'amount', t.amount,
              'status', t.status, 'ticket_data', t.ticket_data
            ) FROM tickets t WHERE t.booking_id = b.id LIMIT 1)
          ) ORDER BY b.created_at)
          FROM bookings b WHERE b.request_id = tr.id AND b.booked_for_id = $1
        ), '[]') AS my_bookings,
        COALESCE((SELECT SUM(b2.amount) FROM bookings b2 WHERE b2.request_id=tr.id AND b2.booked_for_id=$1 AND b2.status!='cancelled'),0) AS total_self_booked,
        COALESCE((SELECT COUNT(*) FROM tickets t2 JOIN bookings b3 ON b3.id=t2.booking_id WHERE b3.request_id=tr.id AND t2.user_id=$1),0) AS ticket_count
      FROM travel_requests tr
      JOIN wallets w ON w.user_id = tr.user_id
      WHERE tr.user_id = $1
        AND tr.status = 'approved'
        AND tr.booking_type = 'self'
      ORDER BY tr.start_date ASC
    `, [req.user.id])

    res.json({ success:true, count:rows.length, data:rows })
  } catch(e) { next(e) }
})

// ── GET /api/self-booking/request/:requestId ──────────────────
// Full detail for one request — booking panel data
router.get('/request/:requestId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        tr.*,
        tc.daily_allowance,
        tc.max_hotel_per_night,
        tc.allowed_modes,
        w.id            AS wallet_id,
        w.balance       AS wallet_balance,
        w.travel_balance,
        w.hotel_balance,
        w.allowance_balance,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', b.id, 'category', b.category, 'amount', b.amount,
            'vendor', b.vendor, 'status', b.status,
            'booking_type_flag', b.booking_type,
            'created_at', b.created_at,
            'ticket', (SELECT json_build_object(
              'id', t.id, 'pnr_number', t.pnr_number, 'booking_ref', t.booking_ref,
              'ticket_type', t.ticket_type, 'travel_mode', t.travel_mode,
              'from_location', t.from_location, 'to_location', t.to_location,
              'travel_date', t.travel_date, 'travel_time', t.travel_time,
              'seat_class', t.seat_class, 'seat_number', t.seat_number,
              'hotel_name', t.hotel_name, 'check_in_date', t.check_in_date,
              'check_out_date', t.check_out_date, 'room_type', t.room_type,
              'vendor', t.vendor, 'amount', t.amount,
              'status', t.status, 'ticket_data', t.ticket_data,
              'created_at', t.created_at
            ) FROM tickets t WHERE t.booking_id = b.id LIMIT 1)
          ) ORDER BY b.created_at)
          FROM bookings b WHERE b.request_id = tr.id
        ), '[]') AS all_bookings,
        COALESCE((
          SELECT SUM(b2.amount) FROM bookings b2
          WHERE b2.request_id = tr.id AND b2.status != 'cancelled'
        ), 0) AS total_booked,
        COALESCE((
          SELECT json_agg(json_build_object(
            'txn_type', wt.txn_type, 'category', wt.category,
            'amount', wt.amount, 'description', wt.description,
            'balance_after', wt.balance_after, 'created_at', wt.created_at,
            'reference', wt.reference
          ) ORDER BY wt.created_at DESC)
          FROM wallet_transactions wt WHERE wt.request_id = tr.id
        ), '[]') AS request_transactions
      FROM travel_requests tr
      JOIN tier_config tc ON tc.role = tr.user_role
      JOIN wallets w ON w.user_id = tr.user_id
      WHERE tr.id = $1 AND tr.user_id = $2
    `, [req.params.requestId, req.user.id])

    if (!rows.length) return res.status(404).json({ success:false, message:'Request not found or access denied' })

    // Check request is approved
    if (rows[0].status !== 'approved') {
      return res.status(400).json({ success:false, message:`Request is ${rows[0].status} — booking only allowed after approval` })
    }

    res.json({ success:true, data:rows[0] })
  } catch(e) { next(e) }
})

// ── POST /api/self-booking/book-transport ─────────────────────
router.post('/book-transport', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const user = req.user
    const {
      request_id, travel_mode, from_location, to_location,
      travel_date, travel_time, seat_class, seat_number,
      vendor, train_number, flight_number, amount,
    } = req.body

    // ── Validations ───────────────────────────────────────────
    if (!request_id || !travel_mode || !travel_date || !amount) {
      return res.status(400).json({ success:false, message:'request_id, travel_mode, travel_date, amount are required' })
    }
    if (Number(amount) <= 0) return res.status(400).json({ success:false, message:'Amount must be greater than 0' })

    // Fetch request
    const { rows: reqRows } = await client.query(`
      SELECT tr.*, tc.allowed_modes, tc.max_trip_budget
      FROM travel_requests tr
      JOIN tier_config tc ON tc.role = tr.user_role
      WHERE tr.id = $1 AND tr.user_id = $2 AND tr.status = 'approved' AND tr.booking_type = 'self'
      FOR UPDATE
    `, [request_id, user.id])
    if (!reqRows.length) return res.status(400).json({ success:false, message:'Approved self-booking request not found' })
    const tr = reqRows[0]

    // Date range check
    const tDate   = new Date(travel_date)
    const startDt = new Date(tr.start_date)
    const endDt   = new Date(tr.end_date)
    if (tDate < startDt || tDate > endDt) {
      return res.status(400).json({ success:false, message:`Travel date ${travel_date} must be within your trip dates (${tr.start_date?.slice(0,10)} → ${tr.end_date?.slice(0,10)})` })
    }

    // Mode eligibility
    if (!tr.allowed_modes?.includes(travel_mode)) {
      return res.status(400).json({ success:false, message:`Travel mode "${travel_mode}" not allowed for ${user.role}. Allowed: ${tr.allowed_modes?.join(', ')}` })
    }

    // International → Flight only
    if (tr.distance_type === 'international' && travel_mode !== 'Flight') {
      return res.status(400).json({ success:false, message:'International travel requires Flight' })
    }

    // Duplicate check — same mode same date
    const { rows: dup } = await client.query(`
      SELECT b.id FROM bookings b
      JOIN tickets t ON t.booking_id = b.id
      WHERE b.request_id = $1 AND b.booked_for_id = $2
        AND t.travel_mode = $3 AND t.travel_date = $4 AND b.status != 'cancelled'
    `, [request_id, user.id, travel_mode, travel_date])
    if (dup.length) {
      return res.status(409).json({ success:false, message:`You already have a ${travel_mode} booking on ${travel_date} for this request` })
    }

    // Budget check — travel budget
    const travelBudget = Number(tr.approved_travel_cost || tr.estimated_travel_cost || 0)
    const { rows: prevTravel } = await client.query(`
      SELECT COALESCE(SUM(b.amount),0) AS used
      FROM bookings b WHERE b.request_id=$1 AND b.category='travel' AND b.booked_for_id=$2 AND b.status!='cancelled'
    `, [request_id, user.id])
    const travelUsed = Number(prevTravel[0].used)
    if (travelUsed + Number(amount) > travelBudget && travelBudget > 0) {
      return res.status(400).json({ success:false, message:`Amount ₹${amount} would exceed your travel budget of ₹${travelBudget.toLocaleString('en-IN')} (₹${travelUsed.toLocaleString('en-IN')} already used)` })
    }

    // Wallet balance check
    const { rows: walletRows } = await client.query('SELECT id, balance FROM wallets WHERE user_id=$1 FOR UPDATE', [user.id])
    if (!walletRows.length || Number(walletRows[0].balance) < Number(amount)) {
      return res.status(400).json({ success:false, message:`Insufficient wallet balance. Available: ₹${Number(walletRows[0]?.balance||0).toLocaleString('en-IN')}` })
    }
    const wallet    = walletRows[0]
    const newBal    = Number(wallet.balance) - Number(amount)
    const pnr       = genPNR()
    const bookingRef = genRef('TR')

    // Create booking
    const { rows: bookRows } = await client.query(`
      INSERT INTO bookings (
        request_id, wallet_id, booked_by_id, booked_for_id,
        booking_type, category, travel_mode,
        vendor, from_location, to_location, travel_date, amount, pnr_number, booking_ref
      ) VALUES ($1,$2,$3,$4,'self','travel',$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [request_id, wallet.id, user.id, user.id, travel_mode,
        vendor||null, from_location||tr.from_location, to_location||tr.to_location,
        travel_date, amount, pnr, bookingRef])
    const booking = bookRows[0]

    // Wallet debit transaction
    const { rows: txnRows } = await client.query(`
      INSERT INTO wallet_transactions
        (wallet_id, user_id, request_id, booking_id, txn_type, category, amount, description, performed_by, balance_after, reference)
      VALUES ($1,$2,$3,$4,'debit','travel',$5,$6,$7,$8,$9)
      RETURNING *
    `, [wallet.id, user.id, request_id, booking.id,
        amount, `${travel_mode} ticket: ${from_location||tr.from_location} → ${to_location||tr.to_location}`,
        user.id, newBal, pnr])

    // Generate ticket
    const ticketData = buildTicketData('transport', { travel_mode, from_location:from_location||tr.from_location, to_location:to_location||tr.to_location, travel_date, travel_time, seat_class, seat_number, vendor, train_number, flight_number }, user, tr, amount)

    const { rows: ticketRows } = await client.query(`
      INSERT INTO tickets (
        booking_id, user_id, request_id,
        pnr_number, booking_ref, ticket_type, travel_mode,
        passenger_name, from_location, to_location,
        travel_date, travel_time, seat_class, seat_number,
        vendor, amount, ticket_data
      ) VALUES ($1,$2,$3,$4,$5,'transport',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [booking.id, user.id, request_id,
        pnr, bookingRef, travel_mode,
        user.name, from_location||tr.from_location, to_location||tr.to_location,
        travel_date, travel_time||null, seat_class||null, seat_number||null,
        vendor||null, amount, JSON.stringify(ticketData)])

    // Update booking_status on request
    await client.query("UPDATE travel_requests SET booking_status='booked' WHERE id=$1", [request_id])

    await client.query('COMMIT')

    res.status(201).json({
      success:     true,
      message:     `${travel_mode} ticket booked! PNR: ${pnr}`,
      data: {
        booking:     booking,
        ticket:      ticketRows[0],
        transaction: txnRows[0],
        new_balance: newBal,
        pnr,
        booking_ref: bookingRef,
      }
    })
  } catch(e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

// ── POST /api/self-booking/book-hotel ────────────────────────
router.post('/book-hotel', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const user = req.user
    const {
      request_id, hotel_name, hotel_address,
      check_in_date, check_out_date, room_type,
      amount, vendor,
    } = req.body

    if (!request_id || !check_in_date || !check_out_date || !amount) {
      return res.status(400).json({ success:false, message:'request_id, check_in_date, check_out_date, amount are required' })
    }
    if (Number(amount) <= 0) return res.status(400).json({ success:false, message:'Amount must be > 0' })

    // Fetch approved request
    const { rows: reqRows } = await client.query(`
      SELECT tr.*, tc.max_hotel_per_night
      FROM travel_requests tr
      JOIN tier_config tc ON tc.role = tr.user_role
      WHERE tr.id = $1 AND tr.user_id = $2 AND tr.status = 'approved' AND tr.booking_type = 'self'
      FOR UPDATE
    `, [request_id, user.id])
    if (!reqRows.length) return res.status(400).json({ success:false, message:'Approved self-booking request not found' })
    const tr = reqRows[0]

    // Date range check
    const ci = new Date(check_in_date)
    const co = new Date(check_out_date)
    const ts = new Date(tr.start_date)
    const te = new Date(tr.end_date)
    if (ci < ts || co > new Date(te.getTime() + 86400000)) {
      return res.status(400).json({ success:false, message:`Hotel dates must be within your trip (${tr.start_date?.slice(0,10)} → ${tr.end_date?.slice(0,10)})` })
    }
    if (co <= ci) return res.status(400).json({ success:false, message:'Check-out must be after check-in' })

    const numNights = Math.ceil((co-ci) / 86400000)
    const perNight  = Number(amount) / numNights

    // Hotel budget check
    const hotelBudget = Number(tr.approved_hotel_cost || tr.estimated_hotel_cost || 0)
    const { rows: prevHotel } = await client.query(`
      SELECT COALESCE(SUM(b.amount),0) AS used
      FROM bookings b WHERE b.request_id=$1 AND b.category='hotel' AND b.booked_for_id=$2 AND b.status!='cancelled'
    `, [request_id, user.id])
    const hotelUsed = Number(prevHotel[0].used)
    if (hotelUsed + Number(amount) > hotelBudget && hotelBudget > 0) {
      return res.status(400).json({ success:false, message:`Amount would exceed hotel budget of ₹${hotelBudget.toLocaleString('en-IN')} (₹${hotelUsed.toLocaleString('en-IN')} used)` })
    }

    // Duplicate hotel check
    const { rows: dup } = await client.query(`
      SELECT b.id FROM bookings b WHERE b.request_id=$1 AND b.booked_for_id=$2 AND b.category='hotel' AND b.status!='cancelled'
    `, [request_id, user.id])
    if (dup.length) {
      return res.status(409).json({ success:false, message:'You already have a hotel booking for this request. Cancel it first to re-book.' })
    }

    // Wallet check
    const { rows: walletRows } = await client.query('SELECT id, balance FROM wallets WHERE user_id=$1 FOR UPDATE', [user.id])
    if (!walletRows.length || Number(walletRows[0].balance) < Number(amount)) {
      return res.status(400).json({ success:false, message:`Insufficient wallet balance. Available: ₹${Number(walletRows[0]?.balance||0).toLocaleString('en-IN')}` })
    }
    const wallet   = walletRows[0]
    const newBal   = Number(wallet.balance) - Number(amount)
    const pnr      = genPNR()
    const bookRef  = genRef('HT')

    // Create booking
    const { rows: bookRows } = await client.query(`
      INSERT INTO bookings (
        request_id, wallet_id, booked_by_id, booked_for_id,
        booking_type, category, vendor,
        check_in_date, check_out_date, amount, pnr_number, booking_ref
      ) VALUES ($1,$2,$3,$4,'self','hotel',$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [request_id, wallet.id, user.id, user.id,
        hotel_name||vendor||null, check_in_date, check_out_date, amount, pnr, bookRef])
    const booking = bookRows[0]

    // Wallet debit
    const { rows: txnRows } = await client.query(`
      INSERT INTO wallet_transactions
        (wallet_id, user_id, request_id, booking_id, txn_type, category, amount, description, performed_by, balance_after, reference)
      VALUES ($1,$2,$3,$4,'debit','hotel',$5,$6,$7,$8,$9)
      RETURNING *
    `, [wallet.id, user.id, request_id, booking.id,
        amount, `Hotel: ${hotel_name||vendor||'Accommodation'} (${numNights} night${numNights>1?'s':''})`,
        user.id, newBal, bookRef])

    // Generate ticket
    const ticketData = buildTicketData('hotel', { hotel_name, hotel_address, check_in_date, check_out_date, room_type, num_nights:numNights, vendor }, user, tr, amount)

    const { rows: ticketRows } = await client.query(`
      INSERT INTO tickets (
        booking_id, user_id, request_id,
        pnr_number, booking_ref, ticket_type,
        passenger_name, hotel_name, check_in_date, check_out_date,
        room_type, vendor, amount, ticket_data
      ) VALUES ($1,$2,$3,$4,$5,'hotel',$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [booking.id, user.id, request_id,
        pnr, bookRef, user.name,
        hotel_name||vendor||null, check_in_date, check_out_date,
        room_type||'Standard', vendor||null, amount,
        JSON.stringify(ticketData)])

    await client.query("UPDATE travel_requests SET booking_status='booked' WHERE id=$1", [request_id])
    await client.query('COMMIT')

    res.status(201).json({
      success:     true,
      message:     `Hotel booked! Booking ID: ${bookRef}`,
      data: {
        booking:     booking,
        ticket:      ticketRows[0],
        transaction: txnRows[0],
        new_balance: newBal,
        pnr,
        booking_ref: bookRef,
        num_nights:  numNights,
      }
    })
  } catch(e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

// ── GET /api/self-booking/tickets ─────────────────────────────
router.get('/tickets', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, tr.from_location AS req_from, tr.to_location AS req_to,
             tr.start_date, tr.end_date, tr.purpose
      FROM tickets t
      JOIN travel_requests tr ON tr.id = t.request_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
    `, [req.user.id])
    res.json({ success:true, count:rows.length, data:rows })
  } catch(e) { next(e) }
})

// ── GET /api/self-booking/ticket/:ticketId ────────────────────
router.get('/ticket/:ticketId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, tr.from_location AS req_from, tr.to_location AS req_to,
             tr.start_date, tr.end_date, tr.purpose, tr.distance_type,
             u.name AS user_name, u.emp_id, u.email
      FROM tickets t
      JOIN travel_requests tr ON tr.id = t.request_id
      JOIN users u ON u.id = t.user_id
      WHERE t.id = $1 AND t.user_id = $2
    `, [req.params.ticketId, req.user.id])
    if (!rows.length) return res.status(404).json({ success:false, message:'Ticket not found' })
    res.json({ success:true, data:rows[0] })
  } catch(e) { next(e) }
})

// ── DELETE /api/self-booking/booking/:bookingId/cancel ────────
router.delete('/booking/:bookingId/cancel', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: bookRows } = await client.query(
      "SELECT * FROM bookings WHERE id=$1 AND booked_for_id=$2 AND status!='cancelled' FOR UPDATE",
      [req.params.bookingId, req.user.id]
    )
    if (!bookRows.length) return res.status(404).json({ success:false, message:'Booking not found or already cancelled' })
    const b = bookRows[0]

    // Refund to wallet
    const { rows: w } = await client.query('SELECT id, balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.user.id])
    const newBal = Number(w[0].balance) + Number(b.amount)

    await client.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [b.id])
    await client.query("UPDATE tickets SET status='cancelled' WHERE booking_id=$1", [b.id])
    await client.query(`
      INSERT INTO wallet_transactions
        (wallet_id, user_id, request_id, booking_id, txn_type, category, amount, description, performed_by, balance_after, reference)
      VALUES ($1,$2,$3,$4,'credit',$5,$6,$7,$8,$9,$10)
    `, [w[0].id, req.user.id, b.request_id, b.id, b.category,
        b.amount, `Refund: cancelled ${b.category} booking`, req.user.id, newBal, `CANCEL-${b.id.slice(0,8)}`])

    await client.query('COMMIT')
    res.json({ success:true, message:'Booking cancelled and amount refunded to wallet', data:{ refunded_amount:b.amount, new_balance:newBal } })
  } catch(e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

module.exports = router
