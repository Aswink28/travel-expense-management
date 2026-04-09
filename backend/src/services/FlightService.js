/**
 * FlightService — unified facade over multiple flight providers.
 *
 * Providers are pluggable: airapi (Client 2.0 Air JSON service), amadeus
 * (Amadeus self-service), and mock (deterministic local data). The active
 * provider is selected via FLIGHT_PROVIDER env var, with automatic fallback
 * to mock if the selected provider is not configured.
 *
 * The legacy `searchFlights(source, destination, date, ...)` signature is
 * preserved so existing routes (routes/flights.js) keep working unchanged.
 * New consumers should use the explicit `provider.<method>(params)` API
 * exposed via `getProvider()`.
 */
const Amadeus  = require('amadeus')
const airApi   = require('./airApi')
const { resolveAirportCode } = require('./airApi/airportCodes')
require('dotenv').config()

class FlightService {
  constructor () {
    const requested = (process.env.FLIGHT_PROVIDER || '').toLowerCase()

    if (requested === 'airapi' && airApi.isConfigured()) {
      this.provider     = airApi
      this.providerName = 'airapi'
    } else if (requested === 'amadeus' && process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET) {
      this.amadeus = new Amadeus({
        clientId:     process.env.AMADEUS_CLIENT_ID,
        clientSecret: process.env.AMADEUS_CLIENT_SECRET,
      })
      this.providerName = 'amadeus'
    } else if (airApi.isConfigured()) {
      // auto-promote Air API when credentials are present and nothing was requested
      this.provider     = airApi
      this.providerName = 'airapi'
    } else if (process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET) {
      this.amadeus = new Amadeus({
        clientId:     process.env.AMADEUS_CLIENT_ID,
        clientSecret: process.env.AMADEUS_CLIENT_SECRET,
      })
      this.providerName = 'amadeus'
    } else {
      this.providerName = 'mock'
    }

    console.log(`[FlightService] active provider: ${this.providerName}`)
  }

  /** Expose the underlying Air API provider for the new lifecycle routes. */
  getProvider () { return this.provider }

  /**
   * Legacy unified search used by routes/flights.js.
   * Uses the active provider; falls back to mock on any failure.
   */
  async searchFlights (source, destination, date, passengers, travelClass) {
    try {
      if (this.providerName === 'airapi') {
        const { flights } = await this.provider.search({
          tripInfo: [{
            Origin:      resolveAirportCode(source),
            Destination: resolveAirportCode(destination),
            TravelDate:  toAirApiDate(date),
            Trip_Id:     0,
          }],
          adultCount:    passengers || 1,
          classOfTravel: travelClass === 'Business' ? 2 : 0,
        })
        if (flights && flights.length) return flights
        return this._getMockFlights(source, destination, date, travelClass)
      }
      if (this.providerName === 'amadeus') {
        const response = await this.amadeus.shopping.flightOffersSearch.get({
          originLocationCode:      resolveAirportCode(source),
          destinationLocationCode: resolveAirportCode(destination),
          departureDate: date,
          adults: passengers || 1,
          nonStop: true,
          max: 5,
        })
        return this._normalizeAmadeusResponse(response.data)
      }
      return this._getMockFlights(source, destination, date, travelClass)
    } catch (e) {
      console.error(`[FlightService:${this.providerName}] search failed:`, e.message)
      return this._getMockFlights(source, destination, date, travelClass)
    }
  }

  _normalizeAmadeusResponse (offers) {
    return offers.map(offer => {
      const itinerary = offer.itineraries[0]
      const segment   = itinerary.segments[0]
      const basePrice = parseFloat(offer.price.total)
      const stops     = itinerary.segments.length - 1
      return {
        flightId:          offer.id,
        airline:           segment.carrierCode + ' Airlines',
        flightNumber:      `${segment.carrierCode}-${segment.number}`,
        departureTime:     new Date(segment.departure.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        arrivalTime:       new Date(segment.arrival.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration:          segment.duration.replace('PT', '').replace('H', 'h ').replace('M', 'm').trim(),
        stops,
        departureTerminal: segment.departure.terminal || 'T1',
        arrivalTerminal:   segment.arrival.terminal   || 'T',
        seatsAvailable:    offer.numberOfBookableSeats || null,
        baggage:           '15 KG / 7 KG',
        price: basePrice,
        fareOptions: [
          { type: 'Saver',   price: basePrice },
          { type: 'Flexi',   price: Math.round(basePrice * 1.25) },
          { type: 'Premium', price: Math.round(basePrice * 1.8)  },
        ],
      }
    })
  }

  _getMockFlights (source, destination, date, travelClass) {
    const airlines    = ['IndiGo', 'Air India', 'Vistara', 'Akasa Air']
    const codeMap     = { 'IndiGo': '6E', 'Air India': 'AI', 'Vistara': 'UK', 'Akasa Air': 'QP' }
    const terminalMap = { 'IndiGo': 'T1', 'Air India': 'T2', 'Vistara': 'T2', 'Akasa Air': 'T1' }
    const seatsList   = [142, 84, 56, 120]

    const val       = source.length + destination.length
    const basePrice = 4000 + (val * 150) + (travelClass === 'Business' ? 6000 : 0)

    const flights = [
      { id: 'FL-1', offsetH: 2,  offsetM: 15, dh: 1, dm: 35, stops: 0, multiplier: 1.0  },
      { id: 'FL-2', offsetH: 5,  offsetM: 45, dh: 4, dm: 15, stops: 1, multiplier: 0.85 },
      { id: 'FL-3', offsetH: 9,  offsetM: 10, dh: 1, dm: 55, stops: 0, multiplier: 1.2  },
      { id: 'FL-4', offsetH: 14, offsetM: 30, dh: 2, dm:  5, stops: 0, multiplier: 0.95 },
    ]

    const generateTime = (base, addH, addM) => {
      const d = new Date(base)
      d.setHours(d.getHours() + addH, d.getMinutes() + addM, 0, 0)
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }

    const travelDate = new Date(date)
    travelDate.setHours(6, 0, 0, 0)

    return flights.map((f, i) => {
      const price       = Math.round((basePrice * f.multiplier) / 100) * 100
      const airlineName = airlines[i % airlines.length]
      const code        = codeMap[airlineName] || 'XX'
      const flightNum   = `${code}-${1000 + (i * 317 + val * 7) % 9000}`
      const durationStr = `${f.dh}h ${f.dm}m`
      const stopsLabel  = f.stops === 0 ? 'Non-Stop' : `${f.stops}-Change`

      return {
        flightId:          `${f.id}-${Date.now().toString().slice(-4)}`,
        airline:           airlineName,
        flightNumber:      flightNum,
        departureTime:     generateTime(travelDate, f.offsetH, f.offsetM),
        arrivalTime:       generateTime(travelDate, f.offsetH + f.dh, f.offsetM + f.dm),
        duration:          durationStr,
        stops:             f.stops,
        stopsLabel,
        departureTerminal: terminalMap[airlineName] || 'T1',
        arrivalTerminal:   'T',
        seatsAvailable:    seatsList[i],
        baggage:           '15 KG / 7 KG',
        price,
        fareOptions: [
          { type: 'Saver',   price },
          { type: 'Flexi',   price: Math.round(price * 1.25) },
          { type: 'Premium', price: Math.round(price * 1.8)  },
        ],
      }
    })
  }
}

/** Air API expects MM/DD/YYYY. */
function toAirApiDate (input) {
  if (!input) return ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) return input
  const d = new Date(input)
  if (isNaN(d.getTime())) return input
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

module.exports = new FlightService()
module.exports.toAirApiDate = toAirApiDate
