/**
 * Transforms raw Air API responses into the internal flight data model used
 * everywhere in TravelDesk (matches the existing FlightService output so the
 * frontend doesn't need provider-aware code).
 *
 * ── Confirmed live response shapes (UAT) ──────────────────────
 *
 * Air_Search returns:
 *   { Response_Header, Search_Key, TripDetails: [{ Flights: [{
 *       Airline_Code, Origin, Destination, Flight_Id, Flight_Key,
 *       Flight_Numbers, TravelDate, IsLCC, IsFareChange, Repriced,
 *       Block_Ticket_Allowed, Segments: [{
 *         Airline_Code, Airline_Name, Flight_Number, Origin, Origin_City,
 *         Origin_Terminal, Destination, Destination_City, Destination_Terminal,
 *         Departure_DateTime ("MM/DD/YYYY HH:mm"),
 *         Arrival_DateTime, Duration ("HH:MM"), Aircraft_Type, Segment_Id
 *       }],
 *       Fares: [{
 *         Fare_Id, FareType, ProductClass, Refundable, Seats_Available,
 *         Food_onboard, GSTMandatory,
 *         FareDetails: [{
 *           Basic_Amount, Total_Amount, AirportTax_Amount, Currency_Code,
 *           PAX_Type, YQ_Amount, Free_Baggage: { Check_In_Baggage, Hand_Baggage },
 *           FareClasses: [{ Class_Code, Class_Desc }]
 *         }]
 *       }]
 *     }] }] }
 */

function safeStr (v, d = '') { return (v === null || v === undefined) ? d : String(v) }
function safeNum (v, d = 0)  { const n = Number(v); return Number.isFinite(n) ? n : d }

/** Convert "MM/DD/YYYY HH:mm" → readable time. */
function fmtTime (raw) {
  if (!raw) return ''
  // The supplier uses "MM/DD/YYYY HH:mm"
  const match = String(raw).match(/(\d{2}:\d{2})/)
  return match ? match[1] : safeStr(raw)
}

/** Convert supplier duration "HH:MM" → display "Xh Ym". */
function fmtDuration (raw) {
  if (!raw) return ''
  const parts = String(raw).split(':')
  if (parts.length === 2) {
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (!isNaN(h) && !isNaN(m)) return `${h}h ${m}m`
  }
  // Fallback: if minutes-based from other deployments
  const mins = safeNum(raw)
  if (mins > 0) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return safeStr(raw)
}

/**
 * Normalise an Air_Search response into an array of internal flight objects.
 */
function normalizeSearch (raw) {
  if (!raw) return []
  const trips = raw.TripDetails || raw.Trips || []
  const searchKey = safeStr(raw.Search_Key)
  const out = []

  for (const trip of trips) {
    const flights = trip.Flights || trip.Journey || []
    for (const f of flights) {
      const segs = f.Segments || []
      if (!segs.length) continue

      const first = segs[0]
      const last  = segs[segs.length - 1]

      // Build fare options from Fares[]
      const fares = f.Fares || []
      const primaryFare = fares[0]
      const primaryDetail = primaryFare?.FareDetails?.[0]
      const baseTotalAmount = safeNum(primaryDetail?.Total_Amount)

      out.push({
        flightId:          safeStr(f.Flight_Id),
        searchKey,
        flightKey:         safeStr(f.Flight_Key),
        airline:           safeStr(first.Airline_Name),
        airlineCode:       safeStr(f.Airline_Code || first.Airline_Code),
        flightNumber:      `${safeStr(f.Airline_Code || first.Airline_Code)}-${safeStr(first.Flight_Number)}`,
        departureTime:     fmtTime(first.Departure_DateTime),
        arrivalTime:       fmtTime(last.Arrival_DateTime),
        departureDate:     safeStr(first.Departure_DateTime),
        arrivalDate:       safeStr(last.Arrival_DateTime),
        origin:            safeStr(f.Origin || first.Origin),
        originCity:        safeStr(first.Origin_City),
        destination:       safeStr(f.Destination || first.Destination),
        destinationCity:   safeStr(last.Destination_City),
        duration:          fmtDuration(first.Duration),
        stops:             Math.max(0, segs.length - 1),
        stopsLabel:        segs.length === 1 ? 'Non-Stop' : `${segs.length - 1}-Stop`,
        departureTerminal: safeStr(first.Origin_Terminal, 'T1'),
        arrivalTerminal:   safeStr(last.Destination_Terminal, 'T'),
        aircraftType:      safeStr(first.Aircraft_Type),
        seatsAvailable:    safeNum(primaryFare?.Seats_Available),
        baggage:           safeStr(primaryDetail?.Free_Baggage?.Check_In_Baggage),
        cabinBaggage:      safeStr(primaryDetail?.Free_Baggage?.Hand_Baggage),
        refundable:        Boolean(primaryFare?.Refundable),
        isLCC:             Boolean(f.IsLCC),
        blockTicketAllowed: Boolean(f.Block_Ticket_Allowed),
        price:             baseTotalAmount,
        currency:          safeStr(primaryDetail?.Currency_Code, 'INR'),
        travelDate:        safeStr(f.TravelDate),
        fareOptions:       fares.map(fare => {
          const det = fare.FareDetails?.[0]
          const classInfo = det?.FareClasses?.[0]
          return {
            fareId:          safeStr(fare.Fare_Id),
            type:            safeStr(classInfo?.Class_Desc || fare.ProductClass || 'Saver'),
            productClass:    safeStr(fare.ProductClass),
            price:           safeNum(det?.Total_Amount),
            basicAmount:     safeNum(det?.Basic_Amount),
            taxAmount:       safeNum(det?.AirportTax_Amount),
            seatsAvailable:  safeNum(fare.Seats_Available),
            refundable:      Boolean(fare.Refundable),
            foodOnboard:     safeStr(fare.Food_onboard),
            baggage:         safeStr(det?.Free_Baggage?.Check_In_Baggage),
            cabinBaggage:    safeStr(det?.Free_Baggage?.Hand_Baggage),
          }
        }),
        segments: segs.map(s => ({
          segmentId:     safeNum(s.Segment_Id),
          from:          safeStr(s.Origin),
          fromCity:      safeStr(s.Origin_City),
          fromTerminal:  safeStr(s.Origin_Terminal),
          to:            safeStr(s.Destination),
          toCity:        safeStr(s.Destination_City),
          toTerminal:    safeStr(s.Destination_Terminal),
          airlineCode:   safeStr(s.Airline_Code),
          airlineName:   safeStr(s.Airline_Name),
          flightNumber:  `${safeStr(s.Airline_Code)}-${safeStr(s.Flight_Number)}`,
          departureTime: fmtTime(s.Departure_DateTime),
          arrivalTime:   fmtTime(s.Arrival_DateTime),
          duration:      fmtDuration(s.Duration),
          aircraftType:  safeStr(s.Aircraft_Type),
        })),
        _raw: { flightKey: f.Flight_Key, searchKey, flightId: f.Flight_Id },
      })
    }
  }
  return out
}

function normalizeReprice (raw) {
  if (!raw) return null
  // Reprice response uses the same TripDetails shape
  const flights = normalizeSearch(raw)
  return {
    repriced:    Boolean(raw.Repriced ?? true),
    fareChanged: Boolean(raw.IsFareChange),
    flights,
    raw,
  }
}

function normalizeBooking (raw) {
  if (!raw) return null
  return {
    bookingRefNo:   safeStr(raw.Booking_RefNo || raw.BookingRefNo || raw.RefNo),
    airlinePnr:     safeStr(raw.Airline_PNR || raw.AirlinePNR),
    status:         safeStr(raw.Response_Header?.Error_Desc || raw.Status || raw.Booking_Status, 'Pending'),
    statusId:       safeNum(raw.Response_Header?.Status_Id || raw.Status_Id),
    blockedExpiry:  safeStr(raw.Blocked_Expiry_Date || raw.BlockExpiry),
    totalAmount:    safeNum(raw.Total_Amount || raw.TotalAmount),
    raw,
  }
}

function normalizeBalance (raw) {
  if (!raw) return null
  return {
    balance:    safeNum(raw.Balance || raw.AvailableBalance),
    cashLimit:  safeNum(raw.CashLimit),
    creditUsed: safeNum(raw.CreditUsed),
    currency:   safeStr(raw.Currency, 'INR'),
    raw,
  }
}

function normalizeSSR (raw) {
  if (!raw) return []
  const list = raw.AirSSRResponseDetails || raw.SSRDetails || raw.SSR || []
  return list.flatMap(group => (group.SSR_Items || group.Items || []).map(it => ({
    ssrKey:    safeStr(it.SSR_Key || it.Key),
    code:      safeStr(it.SSR_Code || it.Code),
    type:      safeStr(it.SSR_Type || it.Type),
    desc:      safeStr(it.Description),
    price:     safeNum(it.Amount || it.Price),
    flightKey: safeStr(group.Flight_Key),
  })))
}

function normalizeSeatMap (raw) {
  if (!raw) return []
  const segs = raw.SeatMapResponseDetails || raw.SeatMap || []
  return segs.map(seg => ({
    flightKey: safeStr(seg.Flight_Key),
    rows: (seg.Rows || []).map(r => ({
      rowNumber: safeNum(r.RowNumber),
      seats: (r.Seats || []).map(s => ({
        seatNumber: safeStr(s.SeatNumber || s.Seat_Number),
        available:  Boolean(s.Available ?? !s.IsBooked),
        price:      safeNum(s.Amount || s.Price),
        type:       safeStr(s.SeatType),
      })),
    })),
  }))
}

module.exports = {
  normalizeSearch,
  normalizeReprice,
  normalizeBooking,
  normalizeBalance,
  normalizeSSR,
  normalizeSeatMap,
}
