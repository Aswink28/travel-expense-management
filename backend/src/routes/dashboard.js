const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

// ── GET /api/dashboard ────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { role, id: uid } = req.user

    // Wallet
    const { rows: wallet } = await pool.query('SELECT * FROM wallets WHERE user_id=$1', [uid])

    // Request stats
    let statsWhere = 'TRUE'
    let statsParams = []
    if (role === 'Employee') { statsWhere = 'user_id=$1'; statsParams = [uid] }
    else if (role === 'Tech Lead') statsWhere = `user_role='Employee'`
    else if (role === 'Manager')   statsWhere = `user_role IN ('Employee','Tech Lead')`
    else if (role === 'Finance')   statsWhere = 'TRUE'
    else if (role === 'Booking Admin') statsWhere = `status='approved' AND booking_type='company'`

    const { rows: stats } = await pool.query(`
      SELECT
        COUNT(*) total,
        COUNT(*) FILTER (WHERE status='pending')          pending,
        COUNT(*) FILTER (WHERE status='pending_finance')  pending_finance,
        COUNT(*) FILTER (WHERE status='approved')         approved,
        COUNT(*) FILTER (WHERE status='rejected')         rejected,
        COALESCE(SUM(approved_total) FILTER (WHERE status='approved'),0)  total_approved,
        COALESCE(SUM(wallet_credit_amount) FILTER (WHERE wallet_credited=TRUE),0) total_wallet_loaded,
        COUNT(*) FILTER (WHERE booking_status='booked')   booked_count,
        COUNT(*) FILTER (WHERE booking_status='pending' AND status='approved') pending_booking
      FROM travel_requests WHERE ${statsWhere}
    `, statsParams)

    // Pending approvals for this user
    let pendingForMe = 0
    if (!['Employee','Booking Admin'].includes(role)) {
      let pWhere = '', pParams = [uid]
      if (role === 'Finance')   pWhere = `WHERE tr.status IN ('pending','pending_finance') AND tr.finance_approved=FALSE AND tr.user_id!=$1 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)`
      else if (role === 'Tech Lead') pWhere = `WHERE tr.status='pending' AND tr.hierarchy_approved=FALSE AND tr.user_role='Employee' AND tr.user_id!=$1 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)`
      else if (role === 'Manager')   pWhere = `WHERE tr.status='pending' AND tr.hierarchy_approved=FALSE AND tr.user_role IN ('Employee','Tech Lead') AND tr.user_id!=$1 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)`
      else if (role === 'Super Admin') pWhere = `WHERE tr.status='pending' AND tr.user_id!=$1`
      if (pWhere) {
        const { rows: pend } = await pool.query(`SELECT COUNT(*) c FROM travel_requests tr ${pWhere}`, pParams)
        pendingForMe = Number(pend[0].c)
      }
    }

    // Recent transactions for current user
    const { rows: recentTxns } = await pool.query(`
      SELECT txn_type, category, amount, description, balance_after, created_at, reference
      FROM wallet_transactions WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 8
    `, [uid])

    // Recent approved requests with documents/bookings
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
        stats: stats[0],
        pendingForMe,
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
router.get('/tiers', authorise('Super Admin','Manager','Finance'), async (req, res, next) => {
  try {
    const { rows: tiers }  = await pool.query('SELECT * FROM tier_config ORDER BY id')
    const { rows: limits } = await pool.query('SELECT * FROM expense_limits ORDER BY role,category')
    res.json({ success:true, data:{ tiers, limits } })
  } catch(e) { next(e) }
})

module.exports = router
