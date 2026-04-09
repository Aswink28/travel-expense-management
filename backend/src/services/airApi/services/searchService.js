/**
 * Search-side Air API methods.
 *  - Air_SectorAvailabilityPI : cached sectors (Series fares only)
 *  - Air_Search               : flights for a sector + date
 *  - Air_FareRule             : fare rules for a flight key
 *  - Air_LowFare              : monthly low fare matrix
 */
const { post } = require('../httpClient')
const { airUrl } = require('../config')

async function sectorAvailability () {
  return post(airUrl('Air_SectorAvailabilityPI'), {}, { method: 'Air_SectorAvailabilityPI' })
}

/**
 * @param {object} p
 * @param {Array<{Origin:string,Destination:string,TravelDate:string,Trip_Id?:number}>} p.tripInfo
 * @param {number} p.adultCount
 * @param {number} [p.childCount=0]
 * @param {number} [p.infantCount=0]
 * @param {number} [p.classOfTravel=0]   // 0 Economy, 1 PE, 2 Business, 3 First
 * @param {number} [p.travelType=0]      // 0 OneWay, 1 RoundTrip, 2 MultiCity
 * @param {number} [p.bookingType=0]
 * @param {number} [p.inventoryType=0]
 * @param {number} [p.sourceType=0]
 * @param {boolean}[p.srCitizen=false]
 * @param {boolean}[p.studentFare=false]
 * @param {boolean}[p.defenceFare=false]
 * @param {string[]}[p.airlines=[]]
 */
async function search (p) {
  if (!Array.isArray(p.tripInfo) || !p.tripInfo.length) {
    throw new Error('tripInfo[] is required')
  }
  return post(airUrl('Air_Search'), {
    Travel_Type:        p.travelType  ?? 0,
    Booking_Type:       p.bookingType ?? 0,
    TripInfo:           p.tripInfo,
    Adult_Count:        String(p.adultCount  ?? 1),
    Child_Count:        String(p.childCount  ?? 0),
    Infant_Count:       String(p.infantCount ?? 0),
    Class_Of_Travel:    String(p.classOfTravel ?? 0),
    InventoryType:      p.inventoryType ?? 0,
    Source_Type:        p.sourceType    ?? 0,
    SrCitizen_Search:   !!p.srCitizen,
    StudentFare_Search: !!p.studentFare,
    DefenceFare_Search: !!p.defenceFare,
    Filtered_Airline:   (p.airlines && p.airlines.length)
                          ? p.airlines.map(c => ({ Airline_Code: c }))
                          : [{ Airline_Code: '' }],   // empty string = all airlines
  }, { method: 'Air_Search' })
}

async function fareRule ({ searchKey, flightKey, fareId }) {
  if (!searchKey || !flightKey || !fareId) throw new Error('searchKey, flightKey and fareId are required')
  return post(airUrl('Air_FareRule'), { Search_Key: searchKey, Flight_Key: flightKey, Fare_Id: fareId }, { method: 'Air_FareRule' })
}

async function lowFare ({ origin, destination, month, year }) {
  if (!origin || !destination || !month || !year) {
    throw new Error('origin, destination, month and year are required')
  }
  return post(airUrl('Air_LowFare'), {
    Origin: origin, Destination: destination, Month: String(month), Year: Number(year),
  }, { method: 'Air_LowFare' })
}

module.exports = { sectorAvailability, search, fareRule, lowFare }
