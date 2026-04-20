/**
 * Held Flights — persistence layer for temp-booked PNRs awaiting payment.
 *
 *   GET    /api/held-flights          — list for current admin
 *   POST   /api/held-flights          — save a newly held flight
 *   PATCH  /api/held-flights/:refNo   — update status (Ticketed / Released)
 *   DELETE /api/held-flights/:refNo   — delete (after release or clear-all)
 */
const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const logger  = require('../config/logger').child({ module: 'heldFlights' })

const router = express.Router()
router.use(authenticate)
router.use(authorise('Booking Admin', 'Super Admin'))

// ── List held flights for the current user ───────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM held_flights WHERE held_by_id = $1 ORDER BY held_at DESC`,
      [req.user.id]
    )
    res.json({ success: true, data: rows.map(mapRowToHeld) })
  } catch (e) { next(e) }
})

// ── Create a held flight ─────────────────────────────────────
router.post('/', async (req, res, next) => {
  const h = req.body || {}
  if (!h.bookingRefNo) return res.status(400).json({ success: false, message: 'bookingRefNo is required' })

  try {
    const { rows } = await pool.query(
      `INSERT INTO held_flights (
        booking_ref_no, airline_pnr, status, airline, airline_code, flight_number,
        origin, destination, departure_time, arrival_time, duration,
        fare_type, fare_price, total_amount, blocked_expiry,
        employee_name, employee_id, request_id, held_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (booking_ref_no) DO UPDATE SET
        status = EXCLUDED.status,
        airline_pnr = EXCLUDED.airline_pnr,
        held_at = NOW()
      RETURNING *`,
      [
        h.bookingRefNo,
        h.airlinePnr || null,
        h.status || 'Held',
        h.flight?.airline || null,
        h.flight?.airlineCode || null,
        h.flight?.flightNumber || null,
        h.flight?.origin || null,
        h.flight?.destination || null,
        h.flight?.departureTime || null,
        h.flight?.arrivalTime || null,
        h.flight?.duration || null,
        h.fare?.type || null,
        h.fare?.price || 0,
        h.totalAmount || 0,
        h.blockedExpiry || null,
        h.employeeName || null,
        h.employeeId || null,
        h.requestId || null,
        req.user.id,
      ]
    )
    logger.info('held flight saved', { bookingRefNo: h.bookingRefNo, user: req.user.name })
    res.json({ success: true, data: mapRowToHeld(rows[0]) })
  } catch (e) { next(e) }
})

// ── Update status (Ticketed / Released) ───────────────────────
router.patch('/:refNo', async (req, res, next) => {
  const { refNo } = req.params
  const { status, ticketResult, airlinePnr } = req.body

  try {
    const updates = ['status = $1']
    const params  = [status]
    let i = 2
    if (ticketResult !== undefined) { updates.push(`ticket_result = $${i++}`); params.push(JSON.stringify(ticketResult)) }
    if (airlinePnr !== undefined)   { updates.push(`airline_pnr = $${i++}`);   params.push(airlinePnr) }
    if (status === 'Ticketed')      { updates.push(`ticketed_at = NOW()`) }
    if (status === 'Released')      { updates.push(`released_at = NOW()`) }
    params.push(refNo, req.user.id)

    const { rows } = await pool.query(
      `UPDATE held_flights SET ${updates.join(', ')}
       WHERE booking_ref_no = $${i} AND held_by_id = $${i+1}
       RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Held flight not found' })
    res.json({ success: true, data: mapRowToHeld(rows[0]) })
  } catch (e) { next(e) }
})

// ── Delete (local clear, doesn't release PNR at supplier) ────
router.delete('/:refNo', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM held_flights WHERE booking_ref_no = $1 AND held_by_id = $2`,
      [req.params.refNo, req.user.id]
    )
    res.json({ success: true })
  } catch (e) { next(e) }
})

// ── Clear all for current user ───────────────────────────────
router.delete('/', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM held_flights WHERE held_by_id = $1`,
      [req.user.id]
    )
    res.json({ success: true, deleted: rowCount })
  } catch (e) { next(e) }
})

// Map DB row → frontend-friendly format (matches the existing held object shape)
function mapRowToHeld (r) {
  return {
    bookingRefNo:  r.booking_ref_no,
    airlinePnr:    r.airline_pnr || '',
    status:        r.status,
    totalAmount:   Number(r.total_amount || 0),
    blockedExpiry: r.blocked_expiry || '',
    flight: {
      airline:       r.airline,
      airlineCode:   r.airline_code,
      flightNumber:  r.flight_number,
      origin:        r.origin,
      destination:   r.destination,
      departureTime: r.departure_time,
      arrivalTime:   r.arrival_time,
      duration:      r.duration,
    },
    fare: {
      type:  r.fare_type,
      price: Number(r.fare_price || 0),
    },
    employeeName:  r.employee_name,
    requestId:     r.request_id,
    ticketResult:  r.ticket_result,
    heldAt:        r.held_at,
    ticketedAt:    r.ticketed_at,
    releasedAt:    r.released_at,
  }
}

module.exports = router
