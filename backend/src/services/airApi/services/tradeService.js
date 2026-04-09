/**
 * Trade / Wallet methods served by TradeAPIService.
 *  - GetBalance : agency wallet balance
 *  - AddPayment : post a payment for a booking (must precede ticketing & confirmPostSSR)
 */
const { post } = require('../httpClient')
const { tradeUrl } = require('../config')

async function getBalance ({ refNo, ticketingType = 0, productId = '1', eWalletId = '0' }) {
  if (!refNo) throw new Error('refNo is required')
  return post(tradeUrl('GetBalance'), {
    RefNo:          refNo,
    Ticketing_Type: String(ticketingType),
    ProductId:      String(productId),
    EWalletID:      String(eWalletId),
  }, { method: 'GetBalance' })
}

async function addPayment ({ refNo, clientRefNo = '', transactionType = 0, productId = '1' }) {
  if (!refNo) throw new Error('refNo is required')
  return post(tradeUrl('AddPayment'), {
    ClientRefNo:     clientRefNo,
    RefNo:           refNo,
    TransactionType: transactionType,
    ProductId:       String(productId),
  }, { method: 'AddPayment' })
}

module.exports = { getBalance, addPayment }
