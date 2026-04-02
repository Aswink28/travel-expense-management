const { v4: uuidv4 } = require('uuid')

// ── Create PPI wallet for a new employee ─────────────────────
async function createPpiWallet(employeeData) {
  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  const body = {
    customerMobile: employeeData.mobile_number,
    customerName:   employeeData.name,
    customerEmail:  employeeData.email,
    aadhaarNumber:  employeeData.aadhaar_number,
    panNumber:      employeeData.pan_number,
    dateOfBirth:    employeeData.date_of_birth,
    gender:         employeeData.gender?.toUpperCase(),
    productId:      employeeData.productId,
  }

  console.log(`[PPI] Creating wallet — requestId: ${requestId}, mobile: ${employeeData.mobile_number}`)

  let res, data
  try {
    res = await fetch(process.env.PPI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Partner-Key':    process.env.PPI_PARTNER_KEY,
        'X-Partner-Secret': process.env.PPI_PARTNER_SECRET,
        'X-Request-Id':     requestId,
        'X-Timestamp':      timestamp,
      },
      body: JSON.stringify(body),
    })
    data = await res.json()
  } catch (networkErr) {
    console.error(`[PPI] Network error — requestId: ${requestId}`, networkErr.message)
    const err = new Error('Unable to connect to wallet service. Please try again later.')
    err.requestId = requestId
    throw err
  }

  if (!res.ok || !data.success || !data.data?.walletId) {
    console.error(`[PPI] Wallet creation failed — requestId: ${requestId}, status: ${res.status}, response:`, JSON.stringify(data))
    const errMsg = data.message || data.error || `Wallet service returned status ${res.status}`
    const err = new Error(errMsg)
    err.ppiResponse = data
    err.requestId = data.traceId || requestId
    throw err
  }

  const wallet = data.data
  console.log(`[PPI] Wallet created — requestId: ${requestId}, walletId: ${wallet.walletId}, walletNumber: ${wallet.walletNumber}`)

  return {
    walletId:     wallet.walletId,
    walletNumber: wallet.walletNumber || null,
    customerId:   wallet.customerId || null,
    walletStatus: wallet.walletStatus || null,
    kycStatus:    wallet.kycStatus || null,
    traceId:      data.traceId || requestId,
  }
}

// ── Fetch PPI wallet balance ─────────────────────────────────
async function fetchPpiBalance(walletId) {
  if (!walletId) return null

  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  let res, data
  try {
    res = await fetch(`${process.env.PPI_API_URL}/${walletId}`, {
      method: 'GET',
      headers: {
        'Content-Type':     'application/json',
        'X-Partner-Key':    process.env.PPI_PARTNER_KEY,
        'X-Partner-Secret': process.env.PPI_PARTNER_SECRET,
        'X-Request-Id':     requestId,
        'X-Timestamp':      timestamp,
      },
    })
    data = await res.json()
  } catch (networkErr) {
    console.error(`[PPI] Balance fetch network error — requestId: ${requestId}`, networkErr.message)
    return null
  }

  if (!res.ok || !data.success || !data.data) {
    console.error(`[PPI] Balance fetch failed — requestId: ${requestId}, status: ${res.status}`)
    return null
  }

  const w = data.data
  return {
    walletId:        w.id,
    walletNumber:    w.walletNumber,
    balance:         w.balance,
    currency:        w.currency || 'INR',
    walletStatus:    w.walletStatus,
    kycStatus:       w.kycStatus,
    maxBalanceLimit: w.maxBalanceLimit,
    dailyTxnLimit:   w.dailyTxnLimit,
    monthlyTxnLimit: w.monthlyTxnLimit,
    customerName:    w.customerName,
    customerMobile:  w.customerMobile,
    activatedAt:     w.activatedAt,
    expiryDate:      w.expiryDate,
  }
}

// ── Load money into PPI wallet ──────────────────────────────
// POST /api/external/wallet/:walletId/load
// Body: { amount, source, referenceId }
// Response: { success, data: { txn_ref_number, amount, new_balance, transaction_status }, message, traceId }
async function loadPpiWallet(walletId, amount, referenceId, source = 'Bank') {
  if (!walletId) throw new Error('walletId is required for PPI load')
  if (!amount || amount <= 0) throw new Error('amount must be a positive number')
  if (!referenceId) throw new Error('referenceId is required for idempotency')

  const PPI_BASE = process.env.PPI_API_URL  // e.g. http://192.168.21.120:5100/api/external/wallet
  const url = `${PPI_BASE}/${walletId}/load`
  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  const body = { amount: Number(amount), source, referenceId }

  console.log(`[PPI-LOAD] Loading ₹${amount} → wallet ${walletId} | ref: ${referenceId} | requestId: ${requestId}`)

  let res, data
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Partner-Key':    process.env.PPI_PARTNER_KEY,
        'X-Partner-Secret': process.env.PPI_PARTNER_SECRET,
        'X-Request-Id':     requestId,
        'X-Timestamp':      timestamp,
      },
      body: JSON.stringify(body),
    })
    data = await res.json()
  } catch (networkErr) {
    console.error(`[PPI-LOAD] Network error — ref: ${referenceId}, requestId: ${requestId}`, networkErr.message)
    return {
      success: false,
      error: `PPI network error: ${networkErr.message}`,
      referenceId,
      traceId: requestId,
      retryable: true,
    }
  }

  if (!res.ok || !data.success) {
    console.error(`[PPI-LOAD] Failed — ref: ${referenceId}, status: ${res.status}, response:`, JSON.stringify(data))
    return {
      success: false,
      error: data.message || `PPI returned status ${res.status}`,
      referenceId,
      traceId: data.traceId || requestId,
      retryable: res.status >= 500,  // 5xx = retryable, 4xx = not
    }
  }

  const txn = data.data
  console.log(`[PPI-LOAD] Success — ref: ${referenceId}, txnRef: ${txn.txn_ref_number}, newBalance: ${txn.new_balance}`)

  return {
    success: true,
    txn_ref_number:     txn.txn_ref_number,
    amount:             txn.amount,
    new_balance:        txn.new_balance,
    transaction_status: txn.transaction_status,
    traceId:            data.traceId || requestId,
    referenceId,
  }
}

module.exports = { createPpiWallet, fetchPpiBalance, loadPpiWallet }
