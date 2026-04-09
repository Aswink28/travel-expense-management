/**
 * AirApi provider — single entry point that the FlightService delegates to.
 *
 * Each method:
 *   1. validates and forwards to the underlying service module
 *   2. normalises the response into the internal data model
 *   3. lets AirApiError propagate so the route layer can format messages
 */
const search    = require('./services/searchService')
const pricing   = require('./services/pricingService')
const booking   = require('./services/bookingService')
const ancillary = require('./services/ancillaryService')
const trade     = require('./services/tradeService')
const N         = require('./normalizer')
const { isConfigured } = require('./config')

const provider = {
  name: 'airapi',
  isConfigured,

  // ── Search ────────────────────────────────────────────────────
  async sectorAvailability () {
    const r = await search.sectorAvailability()
    return { raw: r.data, requestId: r.requestId }
  },

  async search (params) {
    const r = await search.search(params)
    return { flights: N.normalizeSearch(r.data), requestId: r.requestId, raw: r.data }
  },

  async fareRule (params) {
    const r = await search.fareRule(params)
    return { rules: r.data, requestId: r.requestId }
  },

  async lowFare (params) {
    const r = await search.lowFare(params)
    return { fares: r.data, requestId: r.requestId }
  },

  // ── Pricing / ancillary catalogue ────────────────────────────
  async reprice (params) {
    const r = await pricing.reprice(params)
    return { ...N.normalizeReprice(r.data), requestId: r.requestId }
  },

  async getSSR (params) {
    const r = await pricing.getSSR(params)
    return { ssrs: N.normalizeSSR(r.data), requestId: r.requestId }
  },

  async getSeatMap (params) {
    const r = await pricing.getSeatMap(params)
    return { seatMap: N.normalizeSeatMap(r.data), requestId: r.requestId }
  },

  // ── Booking ──────────────────────────────────────────────────
  async tempBooking (params) {
    const r = await booking.tempBooking(params)
    return { ...N.normalizeBooking(r.data), requestId: r.requestId }
  },

  async ticketing (params) {
    const r = await booking.ticketing(params)
    return { ...N.normalizeBooking(r.data), requestId: r.requestId }
  },

  async reprint (params) {
    const r = await booking.reprint(params)
    return { ...N.normalizeBooking(r.data), requestId: r.requestId }
  },

  async history (params) {
    const r = await booking.history(params)
    return { bookings: r.data, requestId: r.requestId }
  },

  async cancel (params) {
    const r = await booking.cancellation(params)
    return { ...N.normalizeBooking(r.data), requestId: r.requestId }
  },

  async releasePnr (params) {
    const r = await booking.releasePnr(params)
    return { ...N.normalizeBooking(r.data), requestId: r.requestId }
  },

  // ── Post-booking ancillaries ─────────────────────────────────
  async getPostSSR (params) {
    const r = await ancillary.getPostSSR(params)
    return { ssrs: N.normalizeSSR(r.data), requestId: r.requestId }
  },

  async initiatePostSSR (params) {
    const r = await ancillary.initiatePostSSR(params)
    return { result: r.data, requestId: r.requestId }
  },

  async confirmPostSSR (params) {
    const r = await ancillary.confirmPostSSR(params)
    return { result: r.data, requestId: r.requestId }
  },

  // ── Trade / wallet ───────────────────────────────────────────
  async getBalance (params) {
    const r = await trade.getBalance(params)
    return { ...N.normalizeBalance(r.data), requestId: r.requestId }
  },

  async addPayment (params) {
    const r = await trade.addPayment(params)
    return { result: r.data, requestId: r.requestId }
  },
}

module.exports = provider
module.exports.AirApiError = require('./httpClient').AirApiError
