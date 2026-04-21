const express = require('express')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const pool    = require('../config/db')
const { authenticate } = require('../middleware')
const { fetchPpiBalance } = require('../services/ppiWallet')
const router  = express.Router()

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ success:false, message:'Email and password required' })
    const { rows } = await pool.query(
      'SELECT id,emp_id,name,email,password_hash,role,department,avatar,color,reporting_to,is_active,ppi_wallet_id,approver_roles,approval_type,designation,tier_id FROM users WHERE email=$1',
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
        'SELECT page_id, page_label, page_icon FROM role_pages WHERE role_name=$1 ORDER BY sort_order',
        [rows[0].role]
      )
      pages = pageRows
    } catch (_) { /* role_pages table may not exist yet */ }
    // Fetch live PPI wallet balance (non-blocking — don't fail login if PPI is down)
    const ppiWallet = await fetchPpiBalance(rows[0].ppi_wallet_id)
    res.json({ success:true, token, user: {
      id:rows[0].id, empId:rows[0].emp_id, name:rows[0].name, email:rows[0].email,
      role:rows[0].role, dept:rows[0].department, avatar:rows[0].avatar, color:rows[0].color,
      reportingTo:rows[0].reporting_to, walletId:rows[0].ppi_wallet_id || null,
      wallet: w[0] || { balance:0, travel_balance:0, hotel_balance:0, allowance_balance:0 },
      ppiWallet: ppiWallet || null,
      pages: pages.map(p => ({ id: p.page_id, label: p.page_label, icon: p.page_icon })),
      approver_roles: rows[0].approver_roles || [],
      approval_type: rows[0].approval_type || 'ALL',
      designation: rows[0].designation || null,
      tier_id: rows[0].tier_id || null,
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
      'SELECT id,emp_id,name,email,password_hash,role,department,avatar,color,reporting_to,is_active,ppi_wallet_id,approver_roles,approval_type,designation,tier_id FROM users WHERE email=$1',
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
        'SELECT page_id, page_label, page_icon, sort_order FROM role_pages WHERE role_name=$1 ORDER BY sort_order',
        [req.user.role]
      )
      pages = pageRows
    } catch (_) { /* role_pages table may not exist yet */ }
    const u = req.user
    const ppiWallet = await fetchPpiBalance(u.ppi_wallet_id)
    res.json({ success:true, user: {
      id:u.id, empId:u.emp_id, name:u.name, email:u.email, role:u.role,
      dept:u.department, avatar:u.avatar, color:u.color, reportingTo:u.reporting_to,
      walletId:u.ppi_wallet_id || null,
      wallet: w[0] || { balance:0, travel_balance:0, hotel_balance:0, allowance_balance:0 },
      ppiWallet: ppiWallet || null,
      pages: pages.map(p => ({ id: p.page_id, label: p.page_label, icon: p.page_icon })),
      approver_roles: u.approver_roles || [],
      approval_type: u.approval_type || 'ALL',
      designation: u.designation || null,
      tier_id: u.tier_id || null,
    }})
  } catch(e) { next(e) }
})

module.exports = router
