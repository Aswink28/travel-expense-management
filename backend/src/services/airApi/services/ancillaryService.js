/**
 * Post-booking ancillary methods.
 *  - Air_GetPostSSR     : list ancillaries available against a confirmed PNR
 *  - Air_InitiatePostSSR: select ancillaries per passenger
 *  - Air_ConfirmPostSSR : confirm post payment (call AddPayment first)
 */
const { post } = require('../httpClient')
const { airUrl } = require('../config')

async function getPostSSR ({ bookingRefNo, airlinePnr = '' }) {
  if (!bookingRefNo) throw new Error('bookingRefNo is required')
  return post(airUrl('Air_GetPostSSR'), {
    Booking_RefNo: bookingRefNo, Airline_PNR: airlinePnr,
  }, { method: 'Air_GetPostSSR' })
}

function mapBookingSSR (selections = []) {
  return selections.map(s => ({ Pax_Id: s.paxId, SSR_Key: s.ssrKey }))
}

async function initiatePostSSR ({ bookingRefNo, airlinePnr = '', selections }) {
  if (!bookingRefNo || !Array.isArray(selections) || !selections.length) {
    throw new Error('bookingRefNo and selections[] are required')
  }
  return post(airUrl('Air_InitiatePostSSR'), {
    Airline_PNR:       airlinePnr,
    BookingSSRDetails: mapBookingSSR(selections),
    Booking_RefNo:     bookingRefNo,
  }, { method: 'Air_InitiatePostSSR' })
}

async function confirmPostSSR ({ bookingRefNo, airlinePnr = '', selections }) {
  if (!bookingRefNo || !Array.isArray(selections) || !selections.length) {
    throw new Error('bookingRefNo and selections[] are required')
  }
  return post(airUrl('Air_ConfirmPostSSR'), {
    Airline_PNR:       airlinePnr,
    BookingSSRDetails: mapBookingSSR(selections),
    Booking_RefNo:     bookingRefNo,
  }, { method: 'Air_ConfirmPostSSR' })
}

module.exports = { getPostSSR, initiatePostSSR, confirmPostSSR }
