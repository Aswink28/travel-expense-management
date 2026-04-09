/**
 * Pricing-side Air API methods.
 *  - Air_Reprice    : reprice the selected fare against the supplier
 *  - Air_GetSSR     : ancillary catalogue (pre-booking)
 *  - Air_GetSeatMap : seatmap for selected segments
 */
const { post } = require('../httpClient')
const { airUrl } = require('../config')

async function reprice ({ searchKey, flights }) {
  if (!searchKey || !Array.isArray(flights) || !flights.length) {
    throw new Error('searchKey and flights[] are required')
  }
  return post(airUrl('Air_Reprice'), {
    Search_Key:         searchKey,
    AirRepriceRequests: flights.map(f => ({ Flight_Key: f.flightKey, Fare_Id: f.fareId || null })),
  }, { method: 'Air_Reprice' })
}

async function getSSR ({ searchKey, flightKeys }) {
  if (!searchKey || !Array.isArray(flightKeys) || !flightKeys.length) {
    throw new Error('searchKey and flightKeys[] are required')
  }
  return post(airUrl('Air_GetSSR'), {
    Search_Key:           searchKey,
    AirSSRRequestDetails: flightKeys.map(k => ({ Flight_Key: k })),
  }, { method: 'Air_GetSSR' })
}

async function getSeatMap ({ searchKey, flightKeys }) {
  if (!searchKey || !Array.isArray(flightKeys) || !flightKeys.length) {
    throw new Error('searchKey and flightKeys[] are required')
  }
  return post(airUrl('Air_GetSeatMap'), {
    Search_Key:  searchKey,
    Flight_Keys: flightKeys,
  }, { method: 'Air_GetSeatMap' })
}

module.exports = { reprice, getSSR, getSeatMap }
