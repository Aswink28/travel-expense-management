const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const { fetchPpiBalance, loadPpiWallet, fetchPpiTransactions } = require('../services/ppiWallet')
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

// ── GET /api/wallet/ppi-balance — fetch live PPI wallet balance ─
router.get('/ppi-balance', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT ppi_wallet_id FROM users WHERE id=$1', [req.user.id])
    if (!rows.length || !rows[0].ppi_wallet_id) {
      return res.status(404).json({ success: false, message: 'No PPI wallet linked to your account' })
    }

    const ppiData = await fetchPpiBalance(rows[0].ppi_wallet_id)
    if (!ppiData) {
      return res.status(502).json({ success: false, message: 'Unable to fetch wallet balance from PPI service' })
    }

    res.json({ success: true, data: ppiData })
  } catch (e) { next(e) }
})

// ── GET /api/wallet/balance/:userId — admin ───────────────────
router.get('/balance/:userId', authorise('Booking Admin','Super Admin','Finance','Request Approver'), async (req, res, next) => {
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
router.get('/transactions/:userId', authorise('Booking Admin','Super Admin','Finance','Request Approver'), async (req, res, next) => {
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

    // Check PPI wallet status — block if suspended or closed
    const { rows: userStatus } = await client.query('SELECT ppi_wallet_status FROM users WHERE id=$1', [req.user.id])
    const walletStatus = (userStatus[0]?.ppi_wallet_status || 'ACTIVE').toUpperCase()
    if (walletStatus === 'SUSPENDED') {
      await client.query('ROLLBACK')
      return res.status(403).json({ success:false, message:'Your wallet is suspended. Transactions are not allowed. Please contact your administrator.' })
    }
    if (walletStatus === 'CLOSED') {
      await client.query('ROLLBACK')
      return res.status(403).json({ success:false, message:'Your wallet has been permanently closed. No transactions are possible.' })
    }

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

// ── GET /api/wallet/ppi-transactions — Fetch PPI transaction history ──
// Backend securely calls PPI API with partner headers — frontend never sees credentials
router.get('/ppi-transactions', async (req, res, next) => {
  try {
    // Role-based: users can only view their own transactions
    const { rows } = await pool.query('SELECT ppi_wallet_id FROM users WHERE id=$1', [req.user.id])
    if (!rows.length || !rows[0].ppi_wallet_id) {
      return res.json({ success: true, data: [], count: 0, message: 'No PPI wallet linked to your account' })
    }

    const result = await fetchPpiTransactions(rows[0].ppi_wallet_id)

    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error || 'Unable to fetch transactions from PPI service', data: [] })
    }

    res.json({
      success: true,
      data: result.data,
      count: result.count,
      traceId: result.traceId,
    })
  } catch (e) { next(e) }
})

// ── GET /api/wallet/ppi-transactions/:userId — Admin fetch PPI transactions for a user ──
router.get('/ppi-transactions/:userId', authorise('Finance', 'Super Admin', 'Request Approver'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT ppi_wallet_id, name FROM users WHERE id=$1', [req.params.userId])
    if (!rows.length || !rows[0].ppi_wallet_id) {
      return res.json({ success: true, data: [], count: 0, message: 'No PPI wallet linked to this user' })
    }

    const result = await fetchPpiTransactions(rows[0].ppi_wallet_id)

    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error || 'Unable to fetch transactions from PPI service', data: [] })
    }

    res.json({
      success: true,
      data: result.data,
      count: result.count,
      userName: rows[0].name,
      traceId: result.traceId,
    })
  } catch (e) { next(e) }
})

// ── GET /api/wallet/load-status/:requestId — PPI load status for a request ──
// Safe for frontend: returns status without exposing PPI credentials or API details
router.get('/load-status/:requestId', async (req, res, next) => {
  try {
    const { requestId } = req.params
    const { rows: reqRows } = await pool.query(
      'SELECT id, user_id, approved_total, wallet_credited, wallet_credit_amount, ppi_load_status, ppi_load_error, wallet_credited_at FROM travel_requests WHERE id=$1',
      [requestId]
    )
    if (!reqRows.length) return res.status(404).json({ success: false, message: 'Request not found' })

    const tr = reqRows[0]
    // Only allow the request owner, Finance, or Super Admin to view
    if (tr.user_id !== req.user.id && !['Finance', 'Super Admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    // Fetch PPI transaction details for this request (no credentials exposed)
    const { rows: txns } = await pool.query(
      `SELECT category, amount, ppi_txn_ref, ppi_status, ppi_new_balance, created_at
       FROM wallet_transactions WHERE request_id=$1 AND txn_type='credit'
       ORDER BY created_at`,
      [requestId]
    )

    res.json({
      success: true,
      data: {
        request_id:    tr.id,
        approved_total: tr.approved_total,
        wallet_credited: tr.wallet_credited,
        credit_amount:  tr.wallet_credit_amount,
        ppi_load_status: tr.ppi_load_status,
        ppi_load_error:  tr.ppi_load_error,
        credited_at:    tr.wallet_credited_at,
        transactions:   txns,
      }
    })
  } catch (e) { next(e) }
})

// ── POST /api/wallet/retry-load/:requestId — Retry failed PPI loads ──
// Only Finance or Super Admin can trigger a retry
router.post('/retry-load/:requestId', authorise('Finance', 'Super Admin'), async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { requestId } = req.params

    const { rows: reqRows } = await client.query(
      "SELECT * FROM travel_requests WHERE id=$1 AND ppi_load_status='failed' FOR UPDATE",
      [requestId]
    )
    if (!reqRows.length) return res.status(400).json({ success: false, message: 'No failed PPI load found for this request' })

    const tr = reqRows[0]

    // Get user's PPI walletId
    const { rows: userRow } = await client.query('SELECT ppi_wallet_id FROM users WHERE id=$1', [tr.user_id])
    const ppiWalletId = userRow[0]?.ppi_wallet_id
    if (!ppiWalletId) return res.status(400).json({ success: false, message: 'User has no PPI wallet linked' })

    // Find failed transactions for this request
    const { rows: failedTxns } = await client.query(
      `SELECT id, category, amount, reference FROM wallet_transactions
       WHERE request_id=$1 AND txn_type='credit' AND ppi_status='FAILED'`,
      [requestId]
    )
    if (!failedTxns.length) return res.status(400).json({ success: false, message: 'No failed transactions to retry' })

    await client.query("UPDATE travel_requests SET ppi_load_status='loading' WHERE id=$1", [requestId])

    let allSuccess = true
    let lastError = null
    const results = []

    for (const txn of failedTxns) {
      // Same referenceId = idempotent retry (PPI won't double-charge)
      const ppiResult = await loadPpiWallet(ppiWalletId, txn.amount, txn.reference, 'Bank')

      if (ppiResult.success) {
        await client.query(
          `UPDATE wallet_transactions SET ppi_txn_ref=$1, ppi_status='SUCCESS', ppi_new_balance=$2, ppi_trace_id=$3 WHERE id=$4`,
          [ppiResult.txn_ref_number, ppiResult.new_balance, ppiResult.traceId, txn.id]
        )
        results.push({ ref: txn.reference, category: txn.category, status: 'SUCCESS', txn_ref: ppiResult.txn_ref_number })
      } else {
        allSuccess = false
        lastError = ppiResult.error
        await client.query(
          `UPDATE wallet_transactions SET ppi_trace_id=$1 WHERE id=$2`,
          [ppiResult.traceId, txn.id]
        )
        results.push({ ref: txn.reference, category: txn.category, status: 'FAILED', error: ppiResult.error })
      }
    }

    if (allSuccess) {
      await client.query("UPDATE travel_requests SET ppi_load_status='loaded', ppi_load_error=NULL WHERE id=$1", [requestId])
    } else {
      await client.query("UPDATE travel_requests SET ppi_load_status='failed', ppi_load_error=$1 WHERE id=$2", [lastError, requestId])
    }

    await client.query('COMMIT')
    res.json({
      success: true,
      message: allSuccess ? 'All PPI loads retried successfully' : 'Some PPI loads still failed',
      data: { ppi_load_status: allSuccess ? 'loaded' : 'failed', results }
    })
  } catch (e) { await client.query('ROLLBACK'); next(e) } finally { client.release() }
})

module.exports = router
