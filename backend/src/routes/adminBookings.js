const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router  = express.Router()

router.use(authenticate)
// Require 'Super Admin' or 'Booking Admin' for all admin routes
router.use(authorise('Booking Admin', 'Super Admin'))

// ── GET /api/admin/users ──────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.emp_id, u.name, u.email, u.role, u.department, w.balance AS wallet_balance
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      ORDER BY u.name
    `)
    res.json({ success: true, count: rows.length, data: rows })
  } catch(e) { next(e) }
})

// ── GET /api/admin/user/wallet/:id ────────────────────────────
// Fetch user's wallet balance
router.get('/user/wallet/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM wallets WHERE user_id=$1', [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Wallet not found' })
    res.json({ success: true, data: rows[0] })
  } catch(e) { next(e) }
})

// ── POST /api/admin/wallet/deduct ─────────────────────────────
// Manually deduct from a user's wallet
router.post('/wallet/deduct', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { user_id, amount, category = 'other', description = 'Admin manual deduction' } = req.body
    if (!user_id || !amount) {
      return res.status(400).json({ success: false, message: 'user_id and amount required' })
    }

    // Check wallet
    const { rows: wallet } = await client.query('SELECT id, balance FROM wallets WHERE user_id=$1 FOR UPDATE', [user_id])
    if (!wallet.length) throw new Error('Wallet not found')
    
    if (Number(wallet[0].balance) < Number(amount)) {
      return res.status(400).json({ success: false, message: `Insufficient balance. Available: ₹${wallet[0].balance}` })
    }

    const newBal = Number(wallet[0].balance) - Number(amount)
    
    // Create transaction
    const { rows: txn } = await client.query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, txn_type, category, amount, description, performed_by, balance_after)
       VALUES ($1, $2, 'debit', $3, $4, $5, $6, $7) RETURNING *`,
      [wallet[0].id, user_id, category, amount, description, req.user.id, newBal]
    )

    await client.query('COMMIT')
    res.json({ success: true, message: `₹${amount} deducted successfully`, data: { transaction: txn[0], new_balance: newBal } })
  } catch(e) { 
    await client.query('ROLLBACK')
    next(e)
  } finally { 
    client.release()
  }
})

// ── POST /api/admin/book-ticket ───────────────────────────────
// Book a ticket on behalf of any user
router.post('/book-ticket', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    const {
      user_id,
      travel_type,            // Train, Flight, Bus
      source,
      destination,
      travel_date,
      passenger_details,
      ticket_cost
    } = req.body

    if (!user_id || !travel_type || !source || !destination || !travel_date || !passenger_details || !ticket_cost) {
      return res.status(400).json({ success: false, message: 'Missing required fields' })
    }

    // 1. Check User & Wallet
    const { rows: users } = await client.query('SELECT name, role, department FROM users WHERE id=$1', [user_id])
    if (!users.length) return res.status(404).json({ success: false, message: 'User not found' })
    const user = users[0]

    const { rows: wallet } = await client.query('SELECT id, balance FROM wallets WHERE user_id=$1 FOR UPDATE', [user_id])
    if (!wallet.length) return res.status(404).json({ success: false, message: 'Wallet not found' })

    const cost = Number(ticket_cost)
    if (Number(wallet[0].balance) < cost) {
      return res.status(400).json({ success: false, message: 'Insufficient Balance' })
    }

    // 2. Create Dummy Travel Request (to satisfy DB foreign key constraint on bookings)
    const mockReqId = 'AH-' + Math.random().toString(36).substring(2, 8).toUpperCase()
    await client.query(
      `INSERT INTO travel_requests (
        id, user_id, user_name, user_role, department,
        from_location, to_location, travel_mode, booking_type,
        start_date, end_date, purpose,
        estimated_travel_cost, estimated_total, approved_total, status, booking_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'company', $9, $9, 'Ad-Hoc Admin Booking', $10, $10, $10, 'approved', 'booked')`,
      [mockReqId, user_id, user.name, user.role, user.department, source, destination, travel_type, travel_date, cost]
    )

    // 3. Deduct Wallet & create transaction
    const newBal = Number(wallet[0].balance) - cost
    const { rows: txnRow } = await client.query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, request_id, txn_type, category, amount, description, performed_by, balance_after)
       VALUES ($1, $2, $3, 'debit', 'travel', $4, $5, $6, $7) RETURNING *`,
      [wallet[0].id, user_id, mockReqId, cost, `Ad-Hoc ${travel_type} booking from ${source} to ${destination}`, req.user.id, newBal]
    )

    // 4. Create Booking
    const pnr_number = 'PNR-' + Math.random().toString(36).substring(2, 8).toUpperCase()
    
    const { rows: booking } = await client.query(
      `INSERT INTO bookings (request_id, wallet_id, booked_by_id, booked_for_id, booking_type, category, travel_mode, from_location, to_location, travel_date, amount, pnr_number, txn_id)
       VALUES ($1, $2, $3, $4, 'company', 'travel', $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [mockReqId, wallet[0].id, req.user.id, user_id, travel_type, source, destination, travel_date, cost, pnr_number, txnRow[0].id]
    )

    // 5. Generate Ticket Record
    const { rows: ticket } = await client.query(
      `INSERT INTO tickets (booking_id, user_id, request_id, pnr_number, booking_ref, ticket_type, travel_mode, passenger_name, from_location, to_location, travel_date, amount, ticket_data)
      VALUES ($1, $2, $3, $4, $5, 'transport', $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [booking[0].id, user_id, mockReqId, pnr_number, booking[0].id, travel_type, passenger_details, source, destination, travel_date, cost, JSON.stringify({ passenger: passenger_details, delivered_via: ['email', 'sms', 'in-app'] })]
    )

    await client.query('COMMIT')
    
    res.json({
      success: true,
      message: `Ticket booked successfully. ₹${cost} deducted.`,
      data: {
        booking: booking[0],
        ticket: ticket[0],
        new_balance: newBal
      }
    })
  } catch(e) {
    await client.query('ROLLBACK')
    next(e)
  } finally {
    client.release()
  }
})

// ── GET /api/admin/bookings ───────────────────────────────────
// Admin track all bookings
router.get('/bookings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, t.pnr_number, t.passenger_name, t.ticket_data, u.name AS booked_for_name, tr.purpose
      FROM bookings b
      LEFT JOIN tickets t ON t.booking_id = b.id
      JOIN users u ON u.id = b.booked_for_id
      LEFT JOIN travel_requests tr ON tr.id = b.request_id
      ORDER BY b.created_at DESC
    `)
    res.json({ success: true, count: rows.length, data: rows })
  } catch(e) { next(e) }
})

// ── GET /api/admin/booking/:id ────────────────────────────────
// GET specific booking details
router.get('/booking/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, t.pnr_number, t.passenger_name, t.ticket_data, u.name AS booked_for_name
      FROM bookings b
      LEFT JOIN tickets t ON t.booking_id = b.id
      JOIN users u ON u.id = b.booked_for_id
      WHERE b.id = $1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found' })
    res.json({ success: true, data: rows[0] })
  } catch(e) { next(e) }
})

module.exports = router
