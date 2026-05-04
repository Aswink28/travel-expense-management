const express = require('express')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const pool    = require('../config/db')
const { authenticate } = require('../middleware')
const { fetchPpiBalance } = require('../services/ppiWallet')
const router  = express.Router()

// Build a tier_policy object for the user's tier — used by the New Request form to
// gate which travel modes/classes/types the user is allowed to select. Empty array
// for any of {flight_classes, train_classes, bus_types, hotel_types} means that
// mode is BLOCKED for this tier.
async function fetchTierPolicy(tierId) {
  if (!tierId) return null
  const { rows } = await pool.query(
    `SELECT id, name, rank, flight_classes, train_classes, bus_types, hotel_types,
            budget_limit, intl_budget_limit, max_hotel_per_night, meal_daily_limit,
            cab_daily_limit, advance_booking_days, intl_flight_class_upgrade,
            approval_flow, approval_type
       FROM tiers WHERE id = $1`,
    [tierId]
  )
  if (!rows.length) return null
  const t = rows[0]
  const arr = (a) => Array.isArray(a) ? a : []
  return {
    tier_id: t.id,
    tier_name: t.name,
    tier_rank: t.rank,
    flight_classes: arr(t.flight_classes),
    train_classes: arr(t.train_classes),
    bus_types: arr(t.bus_types),
    hotel_types: arr(t.hotel_types),
    allowed_modes: {
      Flight: arr(t.flight_classes).length > 0,
      Train:  arr(t.train_classes).length > 0,
      Bus:    arr(t.bus_types).length > 0,
      Hotel:  arr(t.hotel_types).length > 0,
    },
    budget_limit: t.budget_limit, intl_budget_limit: t.intl_budget_limit,
    max_hotel_per_night: t.max_hotel_per_night, meal_daily_limit: t.meal_daily_limit,
    cab_daily_limit: t.cab_daily_limit, advance_booking_days: t.advance_booking_days,
    intl_flight_class_upgrade: t.intl_flight_class_upgrade,
    // Approval flow + condition belong to the tier — frontend uses these to
    // describe how the user's request will be processed (sequential vs.
    // parallel, any-one vs. all).
    approval_flow: t.approval_flow || 'SEQUENTIAL',
    approval_type: t.approval_type || 'ALL',
  }
}

// Resolve the effective approval flow + condition for a user. Mirrors the
// resolver in routes/requests.js — user-level value wins, tier-level fills
// the gap, hard defaults if neither exists. Frontend uses these values to
// label the approval section in the New Request form, so they MUST match
// what the backend will actually use at action time.
function effectiveApprovalConfig(userRow, tierPolicy) {
  return {
    effective_approval_flow:
      userRow.approval_flow || tierPolicy?.approval_flow || 'SEQUENTIAL',
    effective_approval_type:
      userRow.approval_type || tierPolicy?.approval_type || 'ALL',
  }
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ success:false, message:'Email and password required' })
    const { rows } = await pool.query(
      'SELECT id,emp_id,name,email,password_hash,role,department,avatar,color,reporting_to,is_active,ppi_wallet_id,approver_roles,approval_type,approval_flow,designation,tier_id FROM users WHERE email=$1',
      [email.toLowerCase().trim()]
    )
    if (!rows.length || !rows[0].is_active) return res.status(401).json({ success:false, message:'Invalid credentials' })
    if (!await bcrypt.compare(password, rows[0].password_hash)) return res.status(401).json({ success:false, message:'Invalid credentials' })
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [rows[0].id])
    const token = jwt.sign({ userId:rows[0].id, role:rows[0].role }, process.env.JWT_SECRET, { expiresIn:process.env.JWT_EXPIRES_IN||'8h' })
    const { rows: w } = await pool.query('SELECT balance,travel_balance,hotel_balance,allowance_balance FROM wallets WHERE user_id=$1', [rows[0].id])
    let pages = []
    try {
      const { rows: pageRows } = await pool.query(
        `SELECT page_id, page_label, page_icon, sort_order,
                can_view, can_create, can_edit, can_delete
           FROM role_pages
          WHERE role_name = $1 AND can_view = TRUE
          ORDER BY sort_order`,
        [rows[0].role]
      )
      pages = pageRows
    } catch (_) { /* role_pages table may not exist yet */ }
    // Fetch live PPI wallet balance (non-blocking — don't fail login if PPI is down)
    const ppiWallet = await fetchPpiBalance(rows[0].ppi_wallet_id)
    const tierPolicy = await fetchTierPolicy(rows[0].tier_id)
    const eff = effectiveApprovalConfig(rows[0], tierPolicy)
    res.json({ success:true, token, user: {
      id:rows[0].id, empId:rows[0].emp_id, name:rows[0].name, email:rows[0].email,
      role:rows[0].role, dept:rows[0].department, avatar:rows[0].avatar, color:rows[0].color,
      reportingTo:rows[0].reporting_to, walletId:rows[0].ppi_wallet_id || null,
      wallet: w[0] || { balance:0, travel_balance:0, hotel_balance:0, allowance_balance:0 },
      ppiWallet: ppiWallet || null,
      pages: pages.map(p => ({
        id: p.page_id, label: p.page_label, icon: p.page_icon,
        can_view: p.can_view, can_create: p.can_create,
        can_edit: p.can_edit, can_delete: p.can_delete,
      })),
      approver_roles: rows[0].approver_roles || [],
      approval_type: rows[0].approval_type || 'ALL',
      approval_flow: rows[0].approval_flow || null,
      effective_approval_flow: eff.effective_approval_flow,
      effective_approval_type: eff.effective_approval_type,
      designation: rows[0].designation || null,
      tier_id: rows[0].tier_id || null,
      tier_policy: tierPolicy,
    }})
  } catch(e) { next(e) }
})

// ── OAuth 2.0 Password Grant ─────────────────────────────────
router.post('/oauth/token', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const { grant_type, username, password } = req.body
    if (grant_type !== 'password') return res.status(400).json({ error: 'unsupported_grant_type' })
    if (!username || !password) return res.status(400).json({ error: 'invalid_request', error_description: 'username and password required' })

    const { rows } = await pool.query(
      'SELECT id,emp_id,name,email,password_hash,role,department,avatar,color,reporting_to,is_active,ppi_wallet_id,approver_roles,approval_type,approval_flow,designation,tier_id FROM users WHERE email=$1',
      [username.toLowerCase().trim()]
    )
    if (!rows.length || !rows[0].is_active) return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid credentials' })
    if (!await bcrypt.compare(password, rows[0].password_hash)) return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid credentials' })

    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [rows[0].id])
    const token = jwt.sign({ userId: rows[0].id, role: rows[0].role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' })

    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 28800,
      scope: rows[0].role,
    })
  } catch (e) { next(e) }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows: w } = await pool.query('SELECT * FROM wallets WHERE user_id=$1', [req.user.id])
    let pages = []
    try {
      const { rows: pageRows } = await pool.query(
        `SELECT page_id, page_label, page_icon, sort_order,
                can_view, can_create, can_edit, can_delete
           FROM role_pages
          WHERE role_name = $1 AND can_view = TRUE
          ORDER BY sort_order`,
        [req.user.role]
      )
      pages = pageRows
    } catch (_) { /* role_pages table may not exist yet */ }
    const u = req.user
    const ppiWallet = await fetchPpiBalance(u.ppi_wallet_id)
    const tierPolicy = await fetchTierPolicy(u.tier_id)
    const eff = effectiveApprovalConfig(u, tierPolicy)
    res.json({ success:true, user: {
      id:u.id, empId:u.emp_id, name:u.name, email:u.email, role:u.role,
      dept:u.department, avatar:u.avatar, color:u.color, reportingTo:u.reporting_to,
      walletId:u.ppi_wallet_id || null,
      wallet: w[0] || { balance:0, travel_balance:0, hotel_balance:0, allowance_balance:0 },
      ppiWallet: ppiWallet || null,
      pages: pages.map(p => ({
        id: p.page_id, label: p.page_label, icon: p.page_icon,
        can_view: p.can_view, can_create: p.can_create,
        can_edit: p.can_edit, can_delete: p.can_delete,
      })),
      approver_roles: u.approver_roles || [],
      approval_type: u.approval_type || 'ALL',
      approval_flow: u.approval_flow || null,
      effective_approval_flow: eff.effective_approval_flow,
      effective_approval_type: eff.effective_approval_type,
      designation: u.designation || null,
      tier_id: u.tier_id || null,
      tier_policy: tierPolicy,
    }})
  } catch(e) { next(e) }
})

module.exports = router
