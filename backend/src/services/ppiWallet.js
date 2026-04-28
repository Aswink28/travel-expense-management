const { v4: uuidv4 } = require('uuid')

// ── Create PPI wallet for a new employee ─────────────────────
// PPI requires `productIds` (array) — the singular `productId` alone is rejected.
// Defaults are picked up from env so we never hard-code issuer UUIDs:
//   PPI_PRODUCT_IDS  — comma-separated list (e.g. "917e8079-7e5a-4ebd-a1f1-4be637daf0a5")
//   PPI_PROGRAM_ID   — optional program UUID
//   PPI_PRODUCT_ID   — optional primary product UUID (kept for back-compat)
async function createPpiWallet(employeeData) {
  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  const envProductIds = (process.env.PPI_PRODUCT_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const productIds =
    Array.isArray(employeeData.productIds) && employeeData.productIds.length
      ? employeeData.productIds
      : envProductIds

  if (!productIds.length) {
    throw new Error('PPI productIds not configured — set PPI_PRODUCT_IDS in env (comma-separated UUIDs)')
  }

  const body = {
    customerMobile: employeeData.mobile_number,
    customerName:   employeeData.name,
    customerEmail:  employeeData.email,
    aadhaarNumber:  employeeData.aadhaar_number,
    panNumber:      employeeData.pan_number,
    dateOfBirth:    employeeData.date_of_birth,
    gender:         employeeData.gender?.toUpperCase(),
    productId:      employeeData.productId  || process.env.PPI_PRODUCT_ID  || productIds[0],
    productIds,
    programId:      employeeData.programId  || process.env.PPI_PROGRAM_ID || undefined,
  }

  console.log(`[PPI] Creating wallet — requestId: ${requestId}, mobile: ${employeeData.mobile_number}, url: ${process.env.PPI_API_URL}`)
  console.log(`[PPI] Request body:`, JSON.stringify(body))

  let res, data, rawText
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
    rawText = await res.text()
    try { data = JSON.parse(rawText) } catch { data = null }
  } catch (networkErr) {
    console.error(`[PPI] Network error — requestId: ${requestId}, url: ${process.env.PPI_API_URL}`, networkErr.message)
    const err = new Error(`Unable to connect to wallet service (${networkErr.message})`)
    err.requestId = requestId
    throw err
  }

  if (!res.ok || !data || !data.success || !data.data?.walletId) {
    console.error(`[PPI] Wallet creation failed — requestId: ${requestId}, status: ${res.status} ${res.statusText}`)
    console.error(`[PPI] Raw response:`, rawText)
    const errMsg =
      (data && (data.message || data.error)) ||
      (rawText && rawText.length < 500 ? rawText : null) ||
      `Wallet service returned ${res.status} ${res.statusText}`
    const err = new Error(errMsg)
    err.ppiResponse = data || rawText
    err.ppiStatus   = res.status
    err.requestId   = (data && data.traceId) || requestId
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
    maxBalanceLimit:  w.maxBalanceLimit,
    monthlyLoadLimit: w.monthlyLoadLimit,
    dailyTxnLimit:    w.dailyTxnLimit,
    monthlyTxnLimit:  w.monthlyTxnLimit,
    customerName:     w.customerName,
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

// ── Fetch PPI wallet transaction history ────────────────────
// GET /api/external/wallet/:walletId/transactions
// Response: { success, data: [...transactions], message, traceId }
async function fetchPpiTransactions(walletId) {
  if (!walletId) return { success: false, error: 'No walletId provided', data: [] }

  const PPI_BASE = process.env.PPI_API_URL
  const url = `${PPI_BASE}/${walletId}/transactions`
  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  console.log(`[PPI-TXN] Fetching transactions — wallet: ${walletId}, requestId: ${requestId}`)

  let res, data
  try {
    res = await fetch(url, {
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
    console.error(`[PPI-TXN] Network error — requestId: ${requestId}`, networkErr.message)
    return { success: false, error: `PPI network error: ${networkErr.message}`, data: [], traceId: requestId }
  }

  if (!res.ok || !data.success) {
    console.error(`[PPI-TXN] Failed — requestId: ${requestId}, status: ${res.status}`)
    return {
      success: false,
      error: data.message || `PPI returned status ${res.status}`,
      data: [],
      traceId: data.traceId || requestId,
    }
  }

  // PPI response: { success, data: { transactions: [...], total, page, pageSize } }
  const txnData = data.data || {}
  const transactions = Array.isArray(txnData.transactions) ? txnData.transactions : (Array.isArray(txnData) ? txnData : [])
  console.log(`[PPI-TXN] Fetched ${transactions.length} transactions — wallet: ${walletId}`)

  return {
    success: true,
    data: transactions,
    count: txnData.total || transactions.length,
    page: txnData.page || 1,
    pageSize: txnData.pageSize || 20,
    traceId: data.traceId || requestId,
  }
}

// ── Suspend PPI wallet (temporary freeze) ───────────────────
// POST /api/external/wallet/:walletId/suspend
// Body: { reason }
async function suspendPpiWallet(walletId, reason) {
  if (!walletId) throw new Error('walletId is required')
  if (!reason || !reason.trim()) throw new Error('Reason is required for suspension')

  const PPI_BASE = process.env.PPI_API_URL
  const url = `${PPI_BASE}/${walletId}/suspend`
  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  console.log(`[PPI-SUSPEND] Suspending wallet ${walletId} | reason: ${reason} | requestId: ${requestId}`)

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
      body: JSON.stringify({ reason: reason.trim() }),
    })
    data = await res.json()
  } catch (networkErr) {
    console.error(`[PPI-SUSPEND] Network error — requestId: ${requestId}`, networkErr.message)
    return { success: false, error: `PPI network error: ${networkErr.message}`, traceId: requestId }
  }

  if (!res.ok || !data.success) {
    console.error(`[PPI-SUSPEND] Failed — requestId: ${requestId}, status: ${res.status}, response:`, JSON.stringify(data))
    return { success: false, error: data.message || `PPI returned status ${res.status}`, traceId: data.traceId || requestId }
  }

  console.log(`[PPI-SUSPEND] Success — wallet ${walletId} suspended`)
  return {
    success: true,
    wallet_id: data.data?.wallet_id,
    wallet_status: data.data?.wallet_status,
    suspended_at: data.data?.suspended_at,
    traceId: data.traceId || requestId,
  }
}

// ── Close PPI wallet (permanent) ────────────────────────────
// POST /api/external/wallet/:walletId/close
// Body: { reason }
async function closePpiWallet(walletId, reason) {
  if (!walletId) throw new Error('walletId is required')
  if (!reason || !reason.trim()) throw new Error('Reason is required for closure')

  const PPI_BASE = process.env.PPI_API_URL
  const url = `${PPI_BASE}/${walletId}/close`
  const requestId = uuidv4()
  const timestamp = new Date().toISOString()

  console.log(`[PPI-CLOSE] Closing wallet ${walletId} | reason: ${reason} | requestId: ${requestId}`)

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
      body: JSON.stringify({ reason: reason.trim() }),
    })
    data = await res.json()
  } catch (networkErr) {
    console.error(`[PPI-CLOSE] Network error — requestId: ${requestId}`, networkErr.message)
    return { success: false, error: `PPI network error: ${networkErr.message}`, traceId: requestId }
  }

  if (!res.ok || !data.success) {
    console.error(`[PPI-CLOSE] Failed — requestId: ${requestId}, status: ${res.status}, response:`, JSON.stringify(data))
    return { success: false, error: data.message || `PPI returned status ${res.status}`, traceId: data.traceId || requestId }
  }

  console.log(`[PPI-CLOSE] Success — wallet ${walletId} closed`)
  return {
    success: true,
    wallet_id: data.data?.wallet_id,
    wallet_status: data.data?.wallet_status,
    closed_at: data.data?.closed_at,
    traceId: data.traceId || requestId,
  }
}

module.exports = { createPpiWallet, fetchPpiBalance, loadPpiWallet, fetchPpiTransactions, suspendPpiWallet, closePpiWallet }
