const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

// ── GET /api/dashboard ────────────────────────────────────────
// Returns wallet info, recent activity, tier config, and expense breakdown.
// Stat-card counts (total requests, approved, pending) are no longer computed
// here — the frontend derives those from the same list endpoints the pages
// use (GET /api/requests, GET /api/requests/queue, GET /api/bookings/pending)
// so the dashboard numbers always match what the user sees on click-through.
router.get('/', async (req, res, next) => {
  try {
    const { role, id: uid } = req.user

    // Wallet
    const { rows: wallet } = await pool.query('SELECT * FROM wallets WHERE user_id=$1', [uid])

    // Recent transactions for current user
    const { rows: recentTxns } = await pool.query(`
      SELECT txn_type, category, amount, description, balance_after, created_at, reference
      FROM wallet_transactions WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 8
    `, [uid])

    // Recent requests by this user with documents/bookings
    const { rows: recentRequests } = await pool.query(`
      SELECT tr.id, tr.from_location, tr.to_location, tr.travel_mode, tr.booking_type,
             tr.start_date, tr.end_date, tr.status, tr.booking_status,
             tr.approved_total, tr.wallet_credited, tr.wallet_credit_amount,
             COALESCE((SELECT COUNT(*) FROM documents d WHERE d.request_id=tr.id),0) doc_count,
             COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.request_id=tr.id),0) booking_count
      FROM travel_requests tr
      WHERE tr.user_id=$1
      ORDER BY tr.submitted_at DESC LIMIT 5
    `, [uid])

    // Tier config
    const { rows: tier } = await pool.query('SELECT * FROM tier_config WHERE role=$1', [role])

    // Expense breakdown for this user from wallet
    const { rows: breakdown } = await pool.query(`
      SELECT category, COALESCE(SUM(amount) FILTER (WHERE txn_type='debit'),0) spent,
             COALESCE(SUM(amount) FILTER (WHERE txn_type='credit'),0) credited
      FROM wallet_transactions WHERE user_id=$1
      GROUP BY category
    `, [uid])

    res.json({
      success: true,
      data: {
        wallet: wallet[0] || { balance:0, travel_balance:0, hotel_balance:0, allowance_balance:0, total_credited:0, total_debited:0 },
        recentTxns,
        recentRequests,
        tier: tier[0] || null,
        breakdown,
      }
    })
  } catch(e) { next(e) }
})

// ── GET /api/dashboard/tier ───────────────────────────────────
router.get('/tier', async (req, res, next) => {
  try {
    const { rows: tier }   = await pool.query('SELECT * FROM tier_config WHERE role=$1', [req.user.role])
    const { rows: limits } = await pool.query('SELECT * FROM expense_limits WHERE role=$1', [req.user.role])
    res.json({ success:true, data:{ tier:tier[0], limits } })
  } catch(e) { next(e) }
})

// ── GET /api/dashboard/tiers — all tiers (admin/manager) ─────
router.get('/tiers', authorise('Super Admin','Request Approver','Finance'), async (req, res, next) => {
  try {
    const { rows: tiers }  = await pool.query('SELECT * FROM tier_config ORDER BY id')
    const { rows: limits } = await pool.query('SELECT * FROM expense_limits ORDER BY role,category')
    res.json({ success:true, data:{ tiers, limits } })
  } catch(e) { next(e) }
})

module.exports = router
