const { v4: uuidv4 } = require('uuid')

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

module.exports = { fetchPpiBalance }
