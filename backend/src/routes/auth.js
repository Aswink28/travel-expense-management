const express = require('express')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const pool    = require('../config/db')
const { authenticate } = require('../middleware')
const router  = express.Router()

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ success:false, message:'Email and password required' })
    const { rows } = await pool.query(
      'SELECT id,emp_id,name,email,password_hash,role,department,avatar,color,reporting_to,is_active FROM users WHERE email=$1',
      [email.toLowerCase().trim()]
    )
    if (!rows.length || !rows[0].is_active) return res.status(401).json({ success:false, message:'Invalid credentials' })
    if (!await bcrypt.compare(password, rows[0].password_hash)) return res.status(401).json({ success:false, message:'Invalid credentials' })
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [rows[0].id])
    const token = jwt.sign({ userId:rows[0].id, role:rows[0].role }, process.env.JWT_SECRET, { expiresIn:process.env.JWT_EXPIRES_IN||'8h' })
    const { rows: w } = await pool.query('SELECT balance,travel_balance,hotel_balance,allowance_balance FROM wallets WHERE user_id=$1', [rows[0].id])
    res.json({ success:true, token, user: {
      id:rows[0].id, empId:rows[0].emp_id, name:rows[0].name, email:rows[0].email,
      role:rows[0].role, dept:rows[0].department, avatar:rows[0].avatar, color:rows[0].color,
      reportingTo:rows[0].reporting_to,
      wallet: w[0] || { balance:0, travel_balance:0, hotel_balance:0, allowance_balance:0 }
    }})
  } catch(e) { next(e) }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows: w } = await pool.query('SELECT * FROM wallets WHERE user_id=$1', [req.user.id])
    const u = req.user
    res.json({ success:true, user: {
      id:u.id, empId:u.emp_id, name:u.name, email:u.email, role:u.role,
      dept:u.department, avatar:u.avatar, color:u.color, reportingTo:u.reporting_to,
      wallet: w[0] || { balance:0, travel_balance:0, hotel_balance:0, allowance_balance:0 }
    }})
  } catch(e) { next(e) }
})

module.exports = router
