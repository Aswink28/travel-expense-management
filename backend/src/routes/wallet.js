const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

// ── GET /api/wallet/balance ───────────────────────────────────
router.get('/balance', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM wallets WHERE user_id=$1', [req.user.id])
    if (!rows.length) return res.status(404).json({ success:false, message:'Wallet not found' })
    res.json({ success:true, data:rows[0] })
  } catch(e) { next(e) }
})

// ── GET /api/wallet/balance/:userId — admin ───────────────────
router.get('/balance/:userId', authorise('Booking Admin','Super Admin','Finance','Manager'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT w.*,u.name,u.role,u.email FROM wallets w JOIN users u ON u.id=w.user_id WHERE w.user_id=$1',
      [req.params.userId]
    )
    if (!rows.length) return res.status(404).json({ success:false, message:'Wallet not found' })
    res.json({ success:true, data:rows[0] })
  } catch(e) { next(e) }
})

// ── GET /api/wallet/transactions ──────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT wt.*, u2.name AS performed_by_name, tr.from_location, tr.to_location
      FROM wallet_transactions wt
      LEFT JOIN users u2 ON u2.id=wt.performed_by
      LEFT JOIN travel_requests tr ON tr.id=wt.request_id
      WHERE wt.user_id=$1
      ORDER BY wt.created_at DESC LIMIT 100
    `, [req.user.id])
    res.json({ success:true, count:rows.length, data:rows })
  } catch(e) { next(e) }
})

// ── GET /api/wallet/transactions/:userId — admin ──────────────
router.get('/transactions/:userId', authorise('Booking Admin','Super Admin','Finance','Manager'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT wt.*, u2.name AS performed_by_name, tr.from_location, tr.to_location
      FROM wallet_transactions wt
      LEFT JOIN users u2 ON u2.id=wt.performed_by
      LEFT JOIN travel_requests tr ON tr.id=wt.request_id
      WHERE wt.user_id=$1
      ORDER BY wt.created_at DESC
    `, [req.params.userId])
    res.json({ success:true, count:rows.length, data:rows })
  } catch(e) { next(e) }
})

// ── POST /api/wallet/debit — self expense (allowance spend) ──
router.post('/debit', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { request_id, amount, category, description, reference } = req.body
    if (!request_id||!amount||!category||!description) {
      return res.status(400).json({ success:false, message:'request_id, amount, category, description required' })
    }

    const validCategories = ['travel','hotel','allowance','other']
    if (!validCategories.includes(category)) return res.status(400).json({ success:false, message:`Invalid category. Use: ${validCategories.join(', ')}` })

    // Validate request
    const { rows:req_ } = await client.query(
      "SELECT * FROM travel_requests WHERE id=$1 AND user_id=$2 AND status='approved'",
      [request_id, req.user.id]
    )
    if (!req_.length) return res.status(400).json({ success:false, message:'Approved request not found for your account' })
    if (req_[0].booking_type==='company') return res.status(403).json({ success:false, message:'Company booking requests are handled by Booking Admin' })

    // Check wallet
    const { rows:wallet } = await client.query('SELECT id,balance FROM wallets WHERE user_id=$1 FOR UPDATE',[req.user.id])
    if (!wallet.length || Number(wallet[0].balance) < Number(amount)) {
      return res.status(400).json({ success:false, message:`Insufficient balance. Available: ₹${wallet[0]?.balance||0}` })
    }

    const newBal = Number(wallet[0].balance) - Number(amount)
    const { rows:txn } = await client.query(
      `INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference)
       VALUES ($1,$2,$3,'debit',$4,$5,$6,$7,$8,$9) RETURNING *`,
      [wallet[0].id,req.user.id,request_id,category,amount,description,req.user.id,newBal,reference||null]
    )
    await client.query('COMMIT')
    res.json({ success:true, message:'Expense recorded', data:{ transaction:txn[0], new_balance:newBal } })
  } catch(e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

module.exports = router
