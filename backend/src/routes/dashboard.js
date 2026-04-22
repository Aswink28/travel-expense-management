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

    // ── Tier-based visibility scope ──
    // A caller sees their own data plus data from users whose tier sits BELOW theirs
    // (rank number greater than theirs; lower authority). Super Admin sees everything.
    // Finance is treated as a parallel lane with company-wide budget visibility.
    // Booking Admin only sees approved company bookings (their operational scope).
    // Resolve caller's tier rank with a fallback chain:
    //   1. users.tier_id → tiers.rank
    //   2. designation_tiers[LOWER(role.name)] → tiers.rank (covers users with no
    //      explicit tier_id but whose role maps to a default tier)
    const { rows: myRankRow } = await pool.query(`
      SELECT COALESCE(
        (SELECT t.rank FROM tiers t WHERE t.id = u.tier_id),
        (SELECT t.rank FROM designation_tiers dt
           JOIN tiers t ON t.id = dt.tier_id
           WHERE LOWER(dt.designation) = LOWER(u.role::text) LIMIT 1)
      ) AS rank
      FROM users u WHERE u.id = $1
    `, [uid])
    const myRank = myRankRow[0]?.rank ?? null

    let statsWhere, statsParams
    if (role === 'Super Admin' || role === 'Finance') {
      statsWhere  = 'TRUE'
      statsParams = []
    } else if (role === 'Booking Admin') {
      statsWhere  = `status='approved' AND booking_type='company'`
      statsParams = []
    } else if (myRank !== null) {
      // Own data + anyone whose effective tier rank is strictly greater than mine.
      // Effective rank resolution mirrors the caller's chain (tier_id → designation).
      statsWhere = `(user_id = $1 OR user_id IN (
        SELECT u2.id FROM users u2
        WHERE COALESCE(
          (SELECT t.rank FROM tiers t WHERE t.id = u2.tier_id),
          (SELECT t.rank FROM designation_tiers dt
             JOIN tiers t ON t.id = dt.tier_id
             WHERE LOWER(dt.designation) = LOWER(u2.role::text) LIMIT 1)
        ) > $2
      ))`
      statsParams = [uid, myRank]
    } else {
      // No tier configured for this user → show only their own data
      statsWhere  = 'user_id=$1'
      statsParams = [uid]
    }

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

    // Pending approvals waiting for this user — use the same tier visibility scope,
    // scoped to pending hierarchy work (or finance lane for Finance).
    let pendingForMe = 0
    if (role === 'Employee' || role === 'Booking Admin') {
      pendingForMe = 0
    } else if (role === 'Super Admin') {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int c FROM travel_requests WHERE status='pending' AND user_id != $1`,
        [uid]
      )
      pendingForMe = rows[0].c
    } else if (role === 'Finance') {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int c FROM travel_requests tr
         WHERE tr.status IN ('pending','pending_finance')
           AND tr.finance_approved=FALSE AND tr.user_id != $1
           AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)`,
        [uid]
      )
      pendingForMe = rows[0].c
    } else if (myRank !== null) {
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int c FROM travel_requests tr
        LEFT JOIN users ru ON ru.id = tr.user_id
        WHERE tr.status='pending' AND tr.hierarchy_approved=FALSE
          AND tr.user_id != $1
          AND COALESCE(
            (SELECT t.rank FROM tiers t WHERE t.id = ru.tier_id),
            (SELECT t.rank FROM designation_tiers dt
               JOIN tiers t ON t.id = dt.tier_id
               WHERE LOWER(dt.designation) = LOWER(ru.role::text) LIMIT 1)
          ) > $2
          AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)
      `, [uid, myRank])
      pendingForMe = rows[0].c
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
