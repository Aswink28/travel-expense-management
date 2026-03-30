const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const { generateHotels } = require('../services/HotelService')

const router = express.Router()
router.use(authenticate)
router.use(authorise('Booking Admin', 'Super Admin'))

// ── POST /api/hotels/search ─────────────────────────────────────────
router.post('/search', async (req, res, next) => {
  try {
    const { city, checkIn, checkOut, rooms = 1, guests = 1 } = req.body
    if (!city || !checkIn || !checkOut)
      return res.status(400).json({ success: false, message: 'city, checkIn, checkOut are required' })
    const hotels = generateHotels(city, checkIn, checkOut, rooms, guests)
    res.json({ success: true, data: hotels })
  } catch (e) { next(e) }
})

// ── POST /api/hotels/book-hotel ─────────────────────────────────────
router.post('/book-hotel', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { requestId, hotel, checkIn, checkOut, rooms, totalPrice } = req.body
    const adminId = req.user.id

    if (!requestId || !hotel || !checkIn || !checkOut || !totalPrice)
      return res.status(400).json({ success: false, message: 'Missing booking details' })

    // 1. Validate request
    const { rows: requests } = await client.query(
      'SELECT * FROM travel_requests WHERE id = $1 FOR UPDATE', [requestId]
    )
    if (!requests.length)
      return res.status(404).json({ success: false, message: 'Request not found' })

    const tr = requests[0]
    if (!['approved', 'booking_in_progress'].includes(tr.status))
      return res.status(400).json({ success: false, message: `Cannot book. Request status: ${tr.status}` })

    // 2. Wallet check
    const { rows: wallet } = await client.query(
      `SELECT w.id, w.balance, u.name AS user_name, u.email AS user_email
       FROM wallets w JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1 FOR UPDATE`,
      [tr.user_id]
    )
    if (!wallet.length) throw new Error('User wallet not found')

    const currentBalance = Number(wallet[0].balance)
    const amount = Number(totalPrice)
    if (currentBalance < amount) {
      await client.query("UPDATE travel_requests SET status = 'approved' WHERE id = $1", [requestId])
      await client.query('COMMIT')
      return res.status(402).json({
        success: false,
        message: 'Insufficient wallet balance',
        data: { currentBalance, required: amount, shortfall: amount - currentBalance, employeeName: wallet[0].user_name }
      })
    }

    // 3. PNR + debit wallet
    const pnr_number = 'HTL-' + Math.random().toString(36).substring(2, 8).toUpperCase()
    const newBal = currentBalance - amount

    const { rows: txnRow } = await client.query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, request_id, txn_type, category, amount, description, performed_by, balance_after)
       VALUES ($1, $2, $3, 'debit', 'hotel', $4, $5, $6, $7) RETURNING *`,
      [wallet[0].id, tr.user_id, requestId, amount,
       `Hotel booking — ${hotel.name} (${hotel.location})`, adminId, newBal]
    )

    // 4. Booking
    const { rows: booking } = await client.query(
      `INSERT INTO bookings (request_id, wallet_id, booked_by_id, booked_for_id, booking_type, category, travel_mode, vendor, from_location, to_location, travel_date, check_in_date, check_out_date, amount, pnr_number, booking_ref, notes, txn_id)
       VALUES ($1, $2, $3, $4, 'company', 'hotel', 'Hotel', $5, $6, $6, $7, $7, $8, $9, $10, $10, $11, $12) RETURNING *`,
      [requestId, wallet[0].id, adminId, tr.user_id,
       hotel.name, hotel.city, checkIn, checkOut, amount, pnr_number,
       `${hotel.name} — ${hotel.location}`, txnRow[0].id]
    )

    // 5. Ticket
    const { rows: ticket } = await client.query(
      `INSERT INTO tickets (booking_id, user_id, request_id, pnr_number, booking_ref, ticket_type, travel_mode, passenger_name, from_location, to_location, travel_date, vendor, amount, status, ticket_data)
       VALUES ($1, $2, $3, $4, $4, 'hotel', 'Hotel', $5, $6, $6, $7, $8, $9, 'confirmed', $10) RETURNING *`,
      [booking[0].id, tr.user_id, requestId, pnr_number,
       tr.user_name, hotel.city, checkIn, hotel.name, amount,
       JSON.stringify({ hotelId: hotel.hotelId, hotelName: hotel.name, stars: hotel.stars, location: hotel.location, address: hotel.address, checkIn, checkOut, nights: hotel.nights, rooms, pricePerNight: hotel.pricePerNight, amenities: hotel.amenities })]
    )

    // 6. Mark completed
    await client.query("UPDATE travel_requests SET booking_status = 'completed' WHERE id = $1", [requestId])
    await client.query('COMMIT')

    res.json({
      success: true,
      message: 'Hotel booked successfully',
      data: { booking: booking[0], ticket: ticket[0], new_balance: newBal }
    })
  } catch (e) {
    await client.query('ROLLBACK')
    res.status(400).json({ success: false, message: e.message || 'Booking failed' })
  } finally {
    client.release()
  }
})

module.exports = router
