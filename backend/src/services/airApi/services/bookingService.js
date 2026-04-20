/**
 * Booking-side Air API methods.
 *  - Air_TempBooking  : creates a temporary PNR (hold)
 *  - Air_Ticketing    : commits the booking with the airline
 *  - Air_Reprint      : retrieves a stored booking
 *  - Air_History      : lists bookings within a date range
 *  - Air_TicketCancellation
 *  - Air_ReleasePNR   : releases a held / blocked PNR
 */
const { post } = require('../httpClient')
const { airUrl } = require('../config')

/**
 * Build a normalised PAX_Details payload from a simpler internal model.
 * Internal model:
 *   { id, type:'ADT'|'CHD'|'INF', title, firstName, lastName, gender:'M'|'F',
 *     age, dob, passportNumber, passportIssuingCountry, passportExpiry,
 *     nationality, panCardNumber, frequentFlyer }
 */
function mapPaxDetails (pax = []) {
  const typeMap   = { ADT: 0, CHD: 1, INF: 2 }
  const genderMap = { M: 0, F: 1, MALE: 0, FEMALE: 1 }
  return pax.map((p, i) => ({
    Pax_Id:                   p.id ?? (i + 1),
    Pax_type:                 typeMap[(p.type || 'ADT').toUpperCase()] ?? 0,
    Title:                    p.title      || 'Mr',
    First_Name:               p.firstName  || '',
    Last_Name:                p.lastName   || '',
    Gender:                   genderMap[String(p.gender || 'M').toUpperCase()] ?? 0,
    Age:                      p.age        ?? null,
    DOB:                      p.dob        || '01/01/1990',
    Passport_Number:          p.passportNumber          ?? null,
    Passport_Issuing_Country: p.passportIssuingCountry  ?? null,
    Passport_Expiry:          p.passportExpiry          ?? null,
    Nationality:              p.nationality             ?? null,
    Pancard_Number:           p.panCardNumber           ?? null,
    FrequentFlyerDetails:     p.frequentFlyer           ?? null,
  }))
}

async function tempBooking (p) {
  const required = ['searchKey', 'flightKey', 'passengerEmail', 'passengerMobile', 'passengers']
  for (const k of required) if (!p[k]) throw new Error(`${k} is required`)

  return post(airUrl('Air_TempBooking'), {
    Customer_Mobile:  p.customerMobile  || p.passengerMobile,
    Passenger_Mobile: p.passengerMobile,
    WhatsAPP_Mobile:  p.whatsappMobile  || null,
    Passenger_Email:  p.passengerEmail,
    PAX_Details:      mapPaxDetails(p.passengers),
    GST:              !!p.gst,
    GST_Number:       p.gstNumber     || '',
    GST_HolderName:   p.gstHolderName || 'GST Holder Name',
    GST_Address:      p.gstAddress    || 'GST Address',
    BookingFlightDetails: [{
      Search_Key:        p.searchKey,
      Flight_Key:        p.flightKey,
      BookingSSRDetails: p.ssrDetails || [],
    }],
    CostCenterId:         p.costCenterId ?? 0,
    ProjectId:            p.projectId ?? 0,
    BookingRemark:        p.bookingRemark || 'Booking via TravelDesk',
    CorporateStatus:      p.corporateStatus ?? 0,
    CorporatePaymentMode: p.corporatePaymentMode ?? 0,
    MissedSavingReason:   p.missedSavingReason ?? null,
    CorpTripType:         p.corpTripType ?? null,
    CorpTripSubType:      p.corpTripSubType ?? null,
    TripRequestId:        p.tripRequestId ?? null,
    BookingAlertIds:      p.bookingAlertIds ?? null,
  }, { method: 'Air_TempBooking' })
}

async function ticketing ({ bookingRefNo, ticketingType = 1 }) {
  if (!bookingRefNo) throw new Error('bookingRefNo is required')
  return post(airUrl('Air_Ticketing'), {
    Booking_RefNo:  bookingRefNo,
    Ticketing_Type: String(ticketingType),
  }, { method: 'Air_Ticketing' })
}

async function reprint ({ bookingRefNo, airlinePnr = '' }) {
  if (!bookingRefNo && !airlinePnr) throw new Error('bookingRefNo or airlinePnr is required')
  return post(airUrl('Air_Reprint'), {
    Booking_RefNo: bookingRefNo || '',
    Airline_PNR:   airlinePnr   || '',
  }, { method: 'Air_Reprint' })
}

async function history ({ fromDate, toDate, month, year, type = 0 }) {
  if (!fromDate || !toDate) throw new Error('fromDate and toDate are required (MM/DD/YYYY)')
  return post(airUrl('Air_History'), {
    Fromdate: fromDate,
    Todate:   toDate,
    Month:    month ? String(month) : '',
    Year:     year  ? String(year)  : '',
    Type:     String(type),
  }, { method: 'Air_History' })
}

async function cancellation (p) {
  if (!p.bookingRefNo || !p.airlinePnr) throw new Error('bookingRefNo and airlinePnr are required')
  return post(airUrl('Air_TicketCancellation'), {
    AirTicketCancelDetails: (p.cancelDetails || []).map(d => ({
      FlightId:    d.flightId,
      PassengerId: String(d.passengerId),
      SegmentId:   String(d.segmentId ?? 0),
    })),
    Airline_PNR:      p.airlinePnr,
    RefNo:            p.bookingRefNo,
    CancelCode:       p.cancelCode  || '005',
    ReqRemarks:       p.remarks     || 'Cancelled via TravelDesk',
    CancellationType: p.cancellationType ?? 0,
  }, { method: 'Air_TicketCancellation' })
}

async function releasePnr ({ bookingRefNo, airlinePnr }) {
  if (!bookingRefNo || !airlinePnr) throw new Error('bookingRefNo and airlinePnr are required')
  return post(airUrl('Air_ReleasePNR'), {
    Airline_PNR:   airlinePnr,
    Booking_RefNo: bookingRefNo,
  }, { method: 'Air_ReleasePNR' })
}

module.exports = {
  tempBooking, ticketing, reprint, history, cancellation, releasePnr, mapPaxDetails,
}
