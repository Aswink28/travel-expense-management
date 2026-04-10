/**
 * Air API booking lifecycle routes — exposes the full flight booking flow as
 * clean RESTful endpoints under /api/flights/air.
 *
 *   POST /sectors                – Air_SectorAvailabilityPI
 *   POST /search                 – Air_Search (returns normalised flights)
 *   POST /fare-rule              – Air_FareRule
 *   POST /low-fare               – Air_LowFare
 *   POST /reprice                – Air_Reprice
 *   POST /ssr                    – Air_GetSSR
 *   POST /seat-map               – Air_GetSeatMap
 *   POST /temp-booking           – Air_TempBooking
 *   POST /ticket                 – orchestrated AddPayment + Air_Ticketing
 *   POST /ticket/raw             – Air_Ticketing only
 *   POST /reprint                – Air_Reprint
 *   POST /history                – Air_History
 *   POST /cancel                 – Air_TicketCancellation
 *   POST /release-pnr            – Air_ReleasePNR
 *   POST /post-ssr               – Air_GetPostSSR
 *   POST /post-ssr/initiate      – Air_InitiatePostSSR
 *   POST /post-ssr/confirm       – Air_ConfirmPostSSR
 *   GET  /balance                – GetBalance (agency wallet)
 *   POST /payment                – AddPayment
 *
 *   POST /book                   – orchestrated end-to-end:
 *                                  reprice → tempBooking → addPayment → ticketing
 *
 * All routes require authentication and the Booking Admin / Super Admin role.
 */
const express = require('express')
const { authenticate, authorise } = require('../middleware')
const airApi = require('../services/airApi')
const { AirApiError } = require('../services/airApi/httpClient')
const { toAirApiDate } = require('../services/FlightService')
const { resolveAirportCode } = require('../services/airApi/airportCodes')
const logger = require('../config/logger').child({ module: 'airFlights' })

const router = express.Router()
router.use(authenticate)
router.use(authorise('Booking Admin', 'Super Admin'))

// ── Validation helpers ────────────────────────────────────────
function require_ (body, fields) {
  const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '')
  if (missing.length) {
    const e = new Error(`Missing required field(s): ${missing.join(', ')}`)
    e.status = 400
    throw e
  }
}

/** Standardised success/error envelope. */
function send (res, fn) {
  return Promise.resolve()
    .then(fn)
    .then(data => res.json({ success: true, data }))
    .catch(err => {
      const level = (err.status >= 500 || err instanceof AirApiError) ? 'error' : 'warn'
      logger[level]('air api route error', {
        message: err.message, code: err.code, status: err.status,
        requestId: err.requestId, correlationId: res.req?.correlationId,
      })
      if (err instanceof AirApiError) {
        return res.status(err.status || 502).json({
          success: false,
          message: err.message,
          code:    err.code,
          requestId: err.requestId,
        })
      }
      return res.status(err.status || 400).json({ success: false, message: err.message || 'Request failed' })
    })
}

// ── Search ────────────────────────────────────────────────────

router.post('/sectors', (req, res) => send(res, () => airApi.sectorAvailability()))

router.post('/search', (req, res) => send(res, () => {
  require_(req.body, ['origin', 'destination', 'travelDate'])
  const {
    origin, destination, travelDate, returnDate,
    adults = 1, children = 0, infants = 0,
    travelClass = 0, travelType = 0,
    srCitizen, studentFare, defenceFare, airlines,
  } = req.body

  const tripInfo = [{
    Origin: resolveAirportCode(origin),
    Destination: resolveAirportCode(destination),
    TravelDate: toAirApiDate(travelDate),
    Trip_Id: 0,
  }]
  if (travelType === 1 && returnDate) {
    tripInfo.push({
      Origin: String(destination).toUpperCase(),
      Destination: String(origin).toUpperCase(),
      TravelDate: toAirApiDate(returnDate),
      Trip_Id: 1,
    })
  }

  return airApi.search({
    tripInfo, travelType,
    adultCount: adults, childCount: children, infantCount: infants,
    classOfTravel: travelClass,
    srCitizen, studentFare, defenceFare,
    airlines,
  })
}))

router.post('/fare-rule', (req, res) => send(res, () => {
  require_(req.body, ['searchKey', 'flightKey', 'fareId'])
  return airApi.fareRule(req.body)
}))

router.post('/low-fare', (req, res) => send(res, () => {
  require_(req.body, ['origin', 'destination', 'month', 'year'])
  return airApi.lowFare({
    ...req.body,
    origin: resolveAirportCode(req.body.origin),
    destination: resolveAirportCode(req.body.destination),
  })
}))

// ── Pricing ───────────────────────────────────────────────────

router.post('/reprice', (req, res) => send(res, () => {
  require_(req.body, ['searchKey', 'flights'])
  return airApi.reprice(req.body)
}))

router.post('/ssr', (req, res) => send(res, () => {
  require_(req.body, ['searchKey', 'flightKeys'])
  return airApi.getSSR(req.body)
}))

router.post('/seat-map', (req, res) => send(res, () => {
  require_(req.body, ['searchKey', 'flightKeys'])
  return airApi.getSeatMap(req.body)
}))

// ── Booking ───────────────────────────────────────────────────

router.post('/temp-booking', (req, res) => send(res, () => {
  require_(req.body, ['searchKey', 'flightKey', 'passengerEmail', 'passengerMobile', 'passengers'])
  return airApi.tempBooking(req.body)
}))

router.post('/ticket/raw', (req, res) => send(res, () => {
  require_(req.body, ['bookingRefNo'])
  return airApi.ticketing(req.body)
}))

router.post('/ticket', (req, res) => send(res, async () => {
  // Orchestrated AddPayment → Ticketing — the supplier requires payment first.
  require_(req.body, ['bookingRefNo'])
  const { bookingRefNo, ticketingType = 1, clientRefNo = '', productId = '1' } = req.body

  const payment = await airApi.addPayment({ refNo: bookingRefNo, clientRefNo, productId })
  const ticket  = await airApi.ticketing({ bookingRefNo, ticketingType })
  return { payment, ticket }
}))

router.post('/reprint', (req, res) => send(res, () => airApi.reprint(req.body)))
router.post('/history', (req, res) => send(res, () => airApi.history(req.body)))
router.post('/cancel',  (req, res) => send(res, () => {
  require_(req.body, ['bookingRefNo', 'airlinePnr'])
  return airApi.cancel(req.body)
}))
router.post('/release-pnr', (req, res) => send(res, () => {
  require_(req.body, ['bookingRefNo', 'airlinePnr'])
  return airApi.releasePnr(req.body)
}))

// ── Post-booking ancillaries ──────────────────────────────────

router.post('/post-ssr',          (req, res) => send(res, () => airApi.getPostSSR(req.body)))
router.post('/post-ssr/initiate', (req, res) => send(res, () => airApi.initiatePostSSR(req.body)))
router.post('/post-ssr/confirm',  (req, res) => send(res, async () => {
  require_(req.body, ['bookingRefNo', 'selections'])
  // Spec: AddPayment must be invoked before ConfirmPostSSR.
  const payment = await airApi.addPayment({
    refNo: req.body.bookingRefNo,
    clientRefNo: req.body.clientRefNo || '',
    productId: req.body.productId || '1',
  })
  const result = await airApi.confirmPostSSR(req.body)
  return { payment, result }
}))

// ── Trade / wallet ────────────────────────────────────────────

router.get('/balance', (req, res) => send(res, () => {
  const refNo = req.query.refNo || ''
  if (!refNo) { const e = new Error('refNo query param is required'); e.status = 400; throw e }
  return airApi.getBalance({ refNo })
}))

router.post('/payment', (req, res) => send(res, () => {
  require_(req.body, ['refNo'])
  return airApi.addPayment(req.body)
}))

// ── End-to-end orchestration: reprice → temp-booking → pay → ticket ──

router.post('/book', (req, res) => send(res, async () => {
  require_(req.body, ['searchKey', 'flightKey', 'passengers', 'passengerEmail', 'passengerMobile'])

  // 1. Reprice — guards against fare changes between search and booking
  const reprice = await airApi.reprice({
    searchKey: req.body.searchKey,
    flights:   [{ flightKey: req.body.flightKey, fareId: req.body.fareId }],
  })
  if (reprice.fareChanged) {
    const e = new Error('Fare changed during repricing — please confirm new price')
    e.status = 409
    throw Object.assign(e, { repriced: reprice })
  }

  // 2. Temp booking — generates supplier reference
  const tempBooking = await airApi.tempBooking({
    searchKey:       req.body.searchKey,
    flightKey:       req.body.flightKey,
    passengers:      req.body.passengers,
    passengerEmail:  req.body.passengerEmail,
    passengerMobile: req.body.passengerMobile,
    customerMobile:  req.body.customerMobile,
    whatsappMobile:  req.body.whatsappMobile,
    gst:             req.body.gst,
    gstNumber:       req.body.gstNumber,
    gstHolderName:   req.body.gstHolderName,
    gstAddress:      req.body.gstAddress,
    ssrDetails:      req.body.ssrDetails,
    seatDetails:     req.body.seatDetails,
  })
  if (!tempBooking.bookingRefNo) {
    throw Object.assign(new Error('Temporary booking failed — no reference returned'), { status: 502 })
  }

  // 3. Add payment — must succeed before ticketing
  const payment = await airApi.addPayment({
    refNo:       tempBooking.bookingRefNo,
    clientRefNo: req.body.clientRefNo || '',
    productId:   '1',
  })

  // 4. Ticket — commits the airline PNR
  const ticket = await airApi.ticketing({
    bookingRefNo:  tempBooking.bookingRefNo,
    ticketingType: 1,
  })

  return { reprice, tempBooking, payment, ticket }
}))

module.exports = router
