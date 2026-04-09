# Flight API Integration - Comprehensive Documentation

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [End-to-End Flow Diagram](#2-end-to-end-flow-diagram)
3. [All 18 Integrated APIs](#3-all-18-integrated-apis)
4. [UI Flow - Booking Panel (Admin)](#4-ui-flow---booking-panel-admin)
5. [UI Flow - Self Booking (Employee)](#5-ui-flow---self-booking-employee)
6. [API-to-UI Mapping Table](#6-api-to-ui-mapping-table)
7. [Orchestrated Flows](#7-orchestrated-flows)
8. [Error Handling](#8-error-handling)
9. [Configuration](#9-configuration)

---

## 1. Architecture Overview

```
+------------------+       +--------------------+       +-----------------------------+
|    FRONTEND      |       |     BACKEND        |       |   EXTERNAL SUPPLIER         |
|                  |       |                    |       |   (Air API - Client 2.0)    |
|  BookingPanel    |  -->  |  /api/flights/     |  -->  |                             |
|  SelfBooking     |       |    search          |       |  AirAPIService.svc/         |
|  MyTicketsPage   |       |    book-ticket     |       |    JSONService/             |
|  TicketCard      |       |                    |       |      Air_Search             |
|                  |       |  /api/flights/air/ |       |      Air_Reprice            |
|                  |       |    sectors         |       |      Air_TempBooking        |
|                  |       |    search          |       |      Air_Ticketing          |
|                  |       |    reprice         |       |      ...18 endpoints        |
|                  |       |    temp-booking    |       |                             |
|                  |       |    ticket          |       |  TradeAPIService.svc/       |
|                  |       |    book (full)     |       |    JSONService/             |
|                  |       |    ...             |       |      GetBalance             |
|                  |       |                    |       |      AddPayment             |
+------------------+       +--------------------+       +-----------------------------+
                                    |
                           +--------+--------+
                           |                 |
                    +------+------+   +------+------+
                    | FlightService|   |   airApi/   |
                    | (facade)     |   |  Provider   |
                    | - provider   |   | - config    |
                    |   selection  |   | - httpClient|
                    | - city->IATA |   | - normalizer|
                    | - legacy API |   | - logger    |
                    +--------------+   +------+------+
                                              |
                                    +---------+---------+
                                    |    Service Modules |
                                    | - searchService    |
                                    | - pricingService   |
                                    | - bookingService   |
                                    | - ancillaryService |
                                    | - tradeService     |
                                    +--------------------+
```

### Backend File Structure

```
backend/src/
  services/
    FlightService.js              --> Unified facade (airapi / amadeus / mock)
    airApi/
      config.js                   --> Env loader, Auth_Header builder
      httpClient.js               --> Retry, timeout, error detection, logging
      normalizer.js               --> Supplier response -> internal model
      logger.js                   --> Redacted JSON-line audit logger
      airportCodes.js             --> City name -> IATA code resolver
      index.js                    --> Provider facade (18 methods)
      services/
        searchService.js          --> Air_SectorAvailabilityPI, Air_Search, Air_FareRule, Air_LowFare
        pricingService.js         --> Air_Reprice, Air_GetSSR, Air_GetSeatMap
        bookingService.js         --> Air_TempBooking, Air_Ticketing, Air_Reprint, Air_History, Air_Cancellation, Air_ReleasePNR
        ancillaryService.js       --> Air_GetPostSSR, Air_InitiatePostSSR, Air_ConfirmPostSSR
        tradeService.js           --> GetBalance, AddPayment
  routes/
    flights.js                    --> Legacy: POST /api/flights/search, /book-ticket
    airFlights.js                 --> New: POST /api/flights/air/* (all 18 + orchestrated)
```

---

## 2. End-to-End Flow Diagram

### Complete Booking Lifecycle

```
 PHASE 1: AVAILABILITY                PHASE 2: SEARCH & PRICE              PHASE 3: BOOK & PAY                PHASE 4: POST-BOOKING
 ========================             ========================              ========================            ========================

 +---------------------+             +---------------------+              +---------------------+             +---------------------+
 | Air_SectorAvail-    |             | Air_Search          |              | Air_TempBooking     |             | Air_Reprint         |
 | abilityPI           |             |                     |              |                     |             |                     |
 | Returns cached      |   ------->  | Returns flights     |  ------->   | Creates PNR hold    |  ------->   | Get booking details |
 | sectors & dates     |             | with fares, seats,  |              | with passenger info |             | by RefNo or PNR     |
 | (Series fares only) |             | baggage, refund     |              | GST, SSR, seats     |             |                     |
 +---------------------+             +-----+--------+------+              +----------+----------+             +---------------------+
                                           |        |                                |
                                           v        v                                v                        +---------------------+
                                    +------+--+  +--+--------+              +---------+---------+             | Air_History         |
                                    |Air_Fare |  |Air_Reprice|              | AddPayment        |             | List bookings by    |
                                    |Rule     |  |           |              | Post agency        |             | date range          |
                                    |Get fare |  |Validate & |              | payment for the    |             +---------------------+
                                    |rules for|  |reprice the|              | booking reference  |
                                    |a flight |  |selected   |              +---------+---------+             +---------------------+
                                    +---------+  |fare       |                        |                       | Air_Cancellation    |
                                                 +-----+-----+                        v                       | Send ticket to      |
                                                       |                     +---------+---------+             | cancellation queue  |
                                           +-----------+-----------+         | Air_Ticketing     |             +---------------------+
                                           |                       |         | Commits booking   |
                                    +------+------+         +------+------+  | with the airline  |             +---------------------+
                                    | Air_GetSSR  |         | Air_GetSeat|  | Generates PNR     |             | Air_ReleasePNR      |
                                    | Meals,      |         | Map        |  +---------+---------+             | Release a blocked   |
                                    | baggage,    |         | Available  |            |                       | (held) PNR          |
                                    | priority    |         | seats per  |            v                       +---------------------+
                                    | boarding    |         | segment    |   Booking Complete!
                                    +-------------+         +------------+                                    +---------------------+
                                                                                                              | Air_GetPostSSR      |
                                                                          POST-BOOKING ANCILLARIES:           | List SSRs for       |
                                                                          ================================    | confirmed booking   |
                                                                                                              +----------+----------+
                                                                          +---------------------+                        |
                                                                          | Air_LowFare         |                        v
                                                                          | Monthly low fare    |             +----------+----------+
                                                                          | calendar for a      |             | Air_InitiatePostSSR |
                                                                          | route               |             | Select ancillaries  |
                                                                          +---------------------+             | per passenger       |
                                                                                                              +----------+----------+
                                                                          +---------------------+                        |
                                                                          | GetBalance          |                        v
                                                                          | Agency wallet       |             +----------+----------+
                                                                          | balance check       |             | AddPayment (again)  |
                                                                          +---------------------+             +----------+----------+
                                                                                                                         |
                                                                                                                         v
                                                                                                              +----------+----------+
                                                                                                              | Air_ConfirmPostSSR  |
                                                                                                              | Confirm ancillaries |
                                                                                                              | against PNR         |
                                                                                                              +---------------------+
```

### UI-Driven Booking Flow (What Happens When User Clicks)

```
  USER ACTION                    FRONTEND                        BACKEND                         SUPPLIER API
  ===========                    ========                        =======                         ============

  1. Admin opens               BookingPanel                    GET /api/bookings/pending        Database query
     Booking Panel              loads approved requests         Returns approved requests        (travel_requests
                                with wallet balances            with wallet info                  + wallets join)
                                     |
                                     v
  2. Selects request           Auto-fills form:
     from dropdown             origin="Chennai"
                               destination="Mumbai"
                               date="2026-04-14"
                                     |
                                     v
  3. Clicks "Search"           POST /api/flights/search  --->  FlightService.searchFlights()
                                                                     |
                                                               resolveAirportCode("Chennai")="MAA"
                                                               resolveAirportCode("Mumbai")="BOM"
                                                                     |
                                                               airApi.search({                  --->  Air_Search
                                                                 Origin:"MAA",                        (live supplier)
                                                                 Destination:"BOM",
                                                                 TravelDate:"04/14/2026"
                                                               })
                                                                     |
                                                               normalizer.normalizeSearch()
                                                                     |
                               <--- 200 flights returned  <---  Normalized flight objects
                               with live prices,
                               airlines, baggage,
                               refund policy
                                     |
                                     v
  4. Applies filters           Local state filtering:
     (airline, stops,          filterAirlines, filterStops,
     price, time,              filterMaxPrice, filterTimes,
     refundable)               filterRefund
                                     |
                                     v
  5. Clicks "View Fares"      Expands fare cards:
     on a flight               Shows per-fare details:
                               - Price breakdown
                               - Refundable / Non-Refundable
                               - Cancellation: Allowed / Not
                               - Date Change: Allowed / Not
                               - Check-in Baggage (from API)
                               - Cabin Baggage (from API)
                               - Meal info (from API)
                                     |
                                     v
  6. Clicks                    Opens Wallet Confirmation
     "Select & Book"          Modal showing:
                               - Flight: airline, times
                               - Fare type + price
                               - Employee wallet balance
                               - Balance after booking
                               - Sufficient/Insufficient
                                     |
                                     v
  7. Clicks                    POST /api/flights/         --->  Validates request status
     "Confirm & Book"         book-ticket                      Checks wallet balance
                               {requestId,                      Generates PNR
                                selectedFlight,                  Deducts wallet
                                fareType,                        Creates booking + ticket
                                price}                           Sends email to employee
                                     |
                               <--- {booking, ticket,     <---  Transaction committed
                                     new_balance}
                                     |
                                     v
  8. Success!                  Shows TicketCard with:
                               - PNR number
                               - Route & dates
                               - Fare & vendor
                               - Print/Download option
```

---

## 3. All 18 Integrated APIs

### Search APIs (AirAPIService)

#### API 1: Air_SectorAvailabilityPI

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_SectorAvailabilityPI` |
| **Backend Route** | `POST /api/flights/air/sectors` |
| **Service Method** | `airApi.sectorAvailability()` |
| **Purpose** | Returns cached sector availability. Required only for Series fares — restrict `Air_Search` to sectors/dates from this response. Not required for FD/Regular fares. |
| **Request Body** | `Auth_Header` only (no additional params) |
| **Key Response** | `SectorsPIs[{ Origin, Destination, AvailableDates, MaxTravelDate }]` |
| **UI Role** | Called before search to validate which routes have Series fare inventory. Prevents unnecessary search requests to the supplier. |

#### API 2: Air_Search

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_Search` |
| **Backend Route** | `POST /api/flights/air/search` (direct) and `POST /api/flights/search` (legacy) |
| **Service Method** | `airApi.search(params)` |
| **Purpose** | Returns available flights for a given route and date. The primary search API. |
| **Request Params** | `origin`, `destination`, `travelDate`, `adults`, `children`, `infants`, `travelClass` (0=Economy, 1=PE, 2=Business), `travelType` (0=OneWay, 1=RoundTrip), `srCitizen`, `studentFare`, `defenceFare`, `airlines[]` |
| **Key Response** | `Search_Key` (used in all subsequent calls), `TripDetails[].Flights[]` with `Segments[]`, `Fares[]`, `Flight_Key`, baggage, refund, seats |
| **Normalised Output** | `{ flightId, airline, airlineCode, flightNumber, departureTime, arrivalTime, duration, stops, price, fareOptions[{ fareId, type, price, baggage, cabinBaggage, refundable, foodOnboard }], segments[] }` |
| **UI Role** | **Core search** — triggered when user clicks "Search" in BookingPanel or SelfBookingPanel. City names (Chennai, Mumbai) are auto-resolved to IATA codes (MAA, BOM). Results populate the flight list with filters (airline, stops, price, time, refundable). |

#### API 3: Air_FareRule

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_FareRule` |
| **Backend Route** | `POST /api/flights/air/fare-rule` |
| **Service Method** | `airApi.fareRule({ searchKey, flightKey })` |
| **Purpose** | Returns detailed fare rules (cancellation charges, date change fees, baggage policy, no-show penalties) for a specific flight+fare. |
| **Request Params** | `searchKey` (from Air_Search), `flightKey` (from Air_Search) |
| **UI Role** | Can be called when user taps "View fare rules" on a specific flight — provides the detailed policy text including exact cancellation/date-change charges per time window. |

#### API 4: Air_LowFare

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /AirlineHost/AirAPIService.svc/JSONService/Air_LowFare` |
| **Backend Route** | `POST /api/flights/air/low-fare` |
| **Service Method** | `airApi.lowFare({ origin, destination, month, year })` |
| **Purpose** | Returns the lowest available fare for each day in a given month for a route. |
| **Request Params** | `origin`, `destination`, `month`, `year` |
| **UI Role** | Powers a "fare calendar" view — shows cheapest fare per day so admin/employee can pick the most cost-effective travel date. |

---

### Pricing & Ancillary APIs (AirAPIService)

#### API 5: Air_Reprice

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_Reprice` |
| **Backend Route** | `POST /api/flights/air/reprice` |
| **Service Method** | `airApi.reprice({ searchKey, flights[{ flightKey, fareId }] })` |
| **Purpose** | Re-validates the selected fare against the supplier in real-time. Returns `IsFareChange: true` if the price changed since the search. Must be called before booking. |
| **Validation Between Search & Reprice** | Origin/Destination, Travel Date, Pax Count, Class must match. |
| **UI Role** | Called automatically in the orchestrated `/book` flow. If `fareChanged=true`, the user is shown the updated price and asked to confirm before proceeding. Prevents booking at stale prices. |

#### API 6: Air_GetSSR

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_GetSSR` |
| **Backend Route** | `POST /api/flights/air/ssr` |
| **Service Method** | `airApi.getSSR({ searchKey, flightKeys[] })` |
| **Purpose** | Returns available pre-booking SSRs (Special Service Requests): meals, extra baggage, priority boarding, insurance, etc. |
| **Request Params** | `searchKey`, `flightKeys[]` (from Air_Reprice response) |
| **Key Response** | `AirSSRResponseDetails[{ Flight_Key, SSR_Items[{ SSR_Key, SSR_Code, Description, Amount }] }]` |
| **UI Role** | Shown after fare selection — allows user to add meals, extra baggage, or other ancillary services before booking. Each SSR has a price that adds to the total fare. |

#### API 7: Air_GetSeatMap

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_GetSeatMap` |
| **Backend Route** | `POST /api/flights/air/seat-map` |
| **Service Method** | `airApi.getSeatMap({ searchKey, flightKeys[] })` |
| **Purpose** | Returns the seat layout for selected flight segments with availability and pricing per seat. |
| **Request Params** | `searchKey`, `flightKeys[]` (from Air_Reprice response) |
| **Key Response** | `SeatMapResponseDetails[{ Flight_Key, Rows[{ RowNumber, Seats[{ SeatNumber, Available, Amount, SeatType }] }] }]` |
| **UI Role** | Rendered as an aircraft seat map. Available seats are clickable with price shown. Selected seat is included in the temp-booking payload. |

---

### Booking APIs (AirAPIService)

#### API 8: Air_TempBooking

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_TempBooking` |
| **Backend Route** | `POST /api/flights/air/temp-booking` |
| **Service Method** | `airApi.tempBooking(params)` |
| **Purpose** | Creates a temporary PNR hold using passenger details. Returns `Booking_RefNo` which is required for all subsequent operations (payment, ticketing, reprint). |
| **Request Params** | `searchKey`, `flightKey`, `passengerEmail`, `passengerMobile`, `passengers[{ id, type, title, firstName, lastName, gender, dob, passportNumber, panCardNumber }]`, `gst`, `gstNumber`, `ssrDetails[]`, `seatDetails[]` |
| **Key Response** | `Booking_RefNo`, `Airline_PNR`, `Blocked_Expiry_Date`, `Total_Amount` |
| **UI Role** | Triggered after the user confirms passenger details and fare. The returned `Booking_RefNo` is stored and used as the primary reference for all follow-up actions. The `Blocked_Expiry_Date` indicates how long the PNR hold is valid before auto-release. |

#### API 9: Air_Ticketing

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_Ticketing` |
| **Backend Route** | `POST /api/flights/air/ticket/raw` (direct) and `POST /api/flights/air/ticket` (orchestrated with payment) |
| **Service Method** | `airApi.ticketing({ bookingRefNo, ticketingType })` |
| **Purpose** | Commits the booking with the airline and generates the final Airline PNR. This is the irreversible step — real money is charged. |
| **Request Params** | `bookingRefNo` (from Air_TempBooking), `ticketingType` (1=normal) |
| **IMPORTANT** | If response = `22-Failed`, immediately check status via `Air_Reprint` using the booking reference. The ticket may have been issued despite the error response. |
| **UI Role** | Called after `AddPayment` succeeds. On success, the booking is confirmed and the PNR + ticket details are displayed to the user. On error, the system automatically checks `Air_Reprint` to verify the actual ticket status. |

#### API 10: Air_Reprint

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_Reprint` |
| **Backend Route** | `POST /api/flights/air/reprint` |
| **Service Method** | `airApi.reprint({ bookingRefNo, airlinePnr })` |
| **Purpose** | Retrieves full booking details by `Booking_RefNo` or `Airline_PNR`. Returns ticket status, passenger details, segment info, blocked expiry date, and client reference number. |
| **Request Params** | `bookingRefNo` and/or `airlinePnr` (at least one required) |
| **UI Role** | Used to: (a) verify ticket status after a failed `Air_Ticketing` call, (b) display booking details on a "View Booking" page, (c) check if a blocked PNR is still valid. |

#### API 11: Air_History

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_History` |
| **Backend Route** | `POST /api/flights/air/history` |
| **Service Method** | `airApi.history({ fromDate, toDate, month, year, type })` |
| **Purpose** | Lists all bookings within a date range. Used for reconciliation, reporting, and booking management. |
| **Request Params** | `fromDate` (MM/DD/YYYY), `toDate` (MM/DD/YYYY), `month`, `year`, `type` (0=all) |
| **UI Role** | Powers the booking history / report pages. Admins can search bookings by date range for reconciliation against internal records. |

#### API 12: Air_TicketCancellation

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /AirlineHost/AirAPIService.svc/JSONService/Air_TicketCancellation` |
| **Backend Route** | `POST /api/flights/air/cancel` |
| **Service Method** | `airApi.cancel(params)` |
| **Purpose** | Sends a ticket to the cancellation queue. Supports full and partial cancellation (per passenger, per segment). |
| **Request Params** | `bookingRefNo`, `airlinePnr`, `cancelDetails[{ flightId, passengerId, segmentId }]`, `cancelCode`, `remarks`, `cancellationType` (0=full, 1=partial) |
| **UI Role** | Triggered from a "Cancel Booking" action. The `cancellationType` determines whether the entire booking or specific passengers/segments are cancelled. Refund amount depends on the fare rules. |

#### API 13: Air_ReleasePNR

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_ReleasePNR` |
| **Backend Route** | `POST /api/flights/air/release-pnr` |
| **Service Method** | `airApi.releasePnr({ bookingRefNo, airlinePnr })` |
| **Purpose** | Releases a blocked/held PNR before it auto-expires. Used when the user decides not to proceed with payment after creating a temp booking. |
| **Request Params** | `bookingRefNo`, `airlinePnr` |
| **UI Role** | Called when user abandons a booking that was already held (temp-booked but not yet ticketed). Frees the held inventory back to the airline. Can also be a cleanup action if the payment step fails. |

---

### Post-Booking Ancillary APIs (AirAPIService)

#### API 14: Air_GetPostSSR

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_GetPostSSR` |
| **Backend Route** | `POST /api/flights/air/post-ssr` |
| **Service Method** | `airApi.getPostSSR({ bookingRefNo, airlinePnr })` |
| **Purpose** | Lists available SSRs for an already confirmed booking — seat selection, extra baggage, meals, lounge access, priority boarding. |
| **Request Params** | `bookingRefNo`, `airlinePnr` (optional) |
| **UI Role** | Shown on the booking details page after ticketing is complete. Lets users add ancillary services post-booking (e.g., "Add extra baggage to my confirmed flight"). |

#### API 15: Air_InitiatePostSSR

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_InitiatePostSSR` |
| **Backend Route** | `POST /api/flights/air/post-ssr/initiate` |
| **Service Method** | `airApi.initiatePostSSR({ bookingRefNo, airlinePnr, selections[{ paxId, ssrKey }] })` |
| **Purpose** | Selects the ancillary services per passenger. This is the "add to cart" step before payment. |
| **Request Params** | `bookingRefNo`, `airlinePnr`, `selections[{ paxId, ssrKey }]` |
| **UI Role** | Called when user selects specific SSR items for specific passengers and clicks "Add". The response shows the total additional cost that needs to be paid. |

#### API 16: Air_ConfirmPostSSR

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /airlinehost/AirAPIService.svc/JSONService/Air_ConfirmPostSSR` |
| **Backend Route** | `POST /api/flights/air/post-ssr/confirm` |
| **Service Method** | `airApi.confirmPostSSR(params)` |
| **Purpose** | Confirms the selected ancillaries against the PNR after payment. **AddPayment must be called first.** |
| **Request Params** | `bookingRefNo`, `airlinePnr`, `selections[{ paxId, ssrKey }]` |
| **UI Role** | The backend route automatically calls `AddPayment` before `Air_ConfirmPostSSR` (orchestrated). On success, the ancillary services are confirmed and reflected in the ticket. |

---

### Trade / Wallet APIs (TradeAPIService)

#### API 17: GetBalance

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /tradehost/TradeAPIService.svc/JSONService/GetBalance` |
| **Backend Route** | `GET /api/flights/air/balance?refNo=` |
| **Service Method** | `airApi.getBalance({ refNo, ticketingType, productId, eWalletId })` |
| **Purpose** | Returns the agency's wallet balance with the supplier. Used to verify sufficient agency funds before initiating payment. |
| **Request Params** | `refNo`, `ticketingType` (0=default), `productId` (1=flights), `eWalletId` |
| **UI Role** | Can be checked before ticketing to ensure the agency account has sufficient balance. Prevents payment failures due to agency-level insufficient funds. |

#### API 18: AddPayment

| Field | Value |
|-------|-------|
| **Supplier URL** | `POST /tradehost/TradeAPIService.svc/JSONService/AddPayment` |
| **Backend Route** | `POST /api/flights/air/payment` |
| **Service Method** | `airApi.addPayment({ refNo, clientRefNo, transactionType, productId })` |
| **Purpose** | Posts an agency payment for a booking. **Must be called before Air_Ticketing and before Air_ConfirmPostSSR.** Sets the ticket status. |
| **Request Params** | `refNo` (bookingRefNo from TempBooking), `clientRefNo` (your internal reference), `transactionType` (0=default), `productId` (1=flights) |
| **UI Role** | Not directly visible in the UI — called automatically by the backend during the orchestrated booking flow (before `Air_Ticketing`) and during post-SSR confirmation (before `Air_ConfirmPostSSR`). |

---

## 4. UI Flow - Booking Panel (Admin)

### Screen: Booking Panel (Booking Admin / Super Admin role)

```
+============================================================================+
|  Booking Admin Portal                                                       |
|  Book travel for your team, effortlessly.                                  |
+============================================================================+
|                                                                             |
|  [Flights] [Hotels] [Trains] [Buses] [Cabs] [Visa]    <-- Mode tabs        |
|                                                                             |
|  +-- Search Card -------------------------------------------------------+  |
|  |  Booking for: [ TR-DEMO2: Chennai->Mumbai (Flight) v ]               |  |
|  |  [One Way] [Round Trip]                                              |  |
|  |                                                                      |  |
|  |  From: [Chennai]  To: [Mumbai]  Date: [2026-04-14]                  |  |
|  |  Passengers: [1]  Class: [Economy v]                                 |  |
|  |                                                                      |  |
|  |                          [ Search Flights ]                          |  |
|  +----------------------------------------------------------------------+  |
|                                                                             |
|  What happens when user clicks "Search Flights":                           |
|  1. Frontend sends POST /api/flights/search                                |
|     { source: "Chennai", destination: "Mumbai", date: "2026-04-14" }       |
|  2. Backend resolves: Chennai -> MAA, Mumbai -> BOM                        |
|  3. Backend calls Air_Search with IATA codes                               |
|  4. Returns ~200 normalized flights with live prices                       |
+============================================================================+
```

### After Search - Results View

```
+============================================================================+
| Filters (Left Panel)            | Flight Results (Right Panel)              |
| +--------------------------+    | +--------------------------------------+ |
| | Airlines                 |    | | IX AI Express  IX-1282               | |
| | [x] AI Express (24)     |    | | 06:05 --- 2h 20m ---> 08:25         | |
| | [x] IndiGo (45)         |    | | MAA T2    Non-Stop     DEL T1       | |
| | [x] SpiceJet (18)       |    | | Refundable          FROM INR 2,417  | |
| | [x] Air India (30)      |    | | 9 seats  15 Kg + 7 Kg               | |
| | [x] Vistara (22)        |    | |                    [View Fares ->]   | |
| | ...more from API         |    | +--------------------------------------+ |
| +--------------------------+    |                                          |
| | Price Range              |    | +--------------------------------------+ |
| | INR 2,417 ----o--- 14,362|   | | 6E IndiGo  6E-5093                  | |
| +--------------------------+    | | 08:00 --- 2h 10m ---> 10:10         | |
| | Stops                    |    | | MAA T1    Non-Stop     BOM T2       | |
| | [x] Non-Stop (156)      |    | | Non-Refundable      FROM INR 3,200  | |
| | [x] 1 Stop (38)         |    | | 5 seats  –                          | |
| | [x] 2+ Stops (6)        |    | |                    [View Fares ->]   | |
| +--------------------------+    | +--------------------------------------+ |
| | Departure Time           |    |                                          |
| | [x] Early 00-06         |    |  All data from API:                      |
| | [x] Morning 06-12       |    |  - Airline name & code: API              |
| | [x] Afternoon 12-18     |    |  - Flight number: API                    |
| | [x] Evening 18-24       |    |  - Times & duration: API                 |
| +--------------------------+    |  - Stops: API (segments count)           |
| | Refundable Only          |    |  - Terminal: API                         |
| | [x] Toggle               |    |  - Refundable: API (per fare)           |
| +--------------------------+    |  - Price: API (Total_Amount)             |
|                                 |  - Seats: API (Seats_Available)          |
|                                 |  - Baggage: API (Free_Baggage)           |
+============================================================================+
```

### After Clicking "View Fares" - Expanded Fare Cards

```
+============================================================================+
| IX AI Express IX-1282    06:05 -> 08:25    2h 20m    Non-Stop    [Collapse]|
+----------------------------------------------------------------------------+
|                                                                             |
|  +-- PUBLISHED --+     +-- LITE ----------+     +-- FLEX ----------+       |
|  | * BEST VALUE  |     |                  |     |                  |       |
|  |               |     |                  |     |                  |       |
|  | PUBLISHED     |     | LITE             |     | FLEX             |       |
|  | * Refundable  |     | * Refundable     |     | * Refundable     |       |
|  |               |     |                  |     |                  |       |
|  | INR 2,417     |     | INR 6,608        |     | INR 6,739        |       |
|  |               |     |                  |     |                  |       |
|  | Date change:  |     | Date change:     |     | Date change:     |       |
|  |   Allowed     |     |   Allowed        |     |   Allowed        |       |
|  | Cancellation: |     | Cancellation:    |     | Cancellation:    |       |
|  |   Allowed     |     |   Allowed        |     |   Allowed        |       |
|  | Check-in:     |     | Check-in:        |     | Check-in:        |       |
|  |   Not Included|     |   Not Included   |     |   Not Included   |       |
|  | Cabin:        |     | Cabin:           |     | Cabin:           |       |
|  |   7 Kg        |     |   7 Kg           |     |   7 Kg           |       |
|  | Meal:         |     | Meal:            |     | Meal:            |       |
|  |   Paid Meal   |     |   Paid Meal      |     |   Paid Meal      |       |
|  |               |     |                  |     |                  |       |
|  | [Select&Book] |     | [Select & Book]  |     | [Select & Book]  |       |
|  +---------------+     +------------------+     +------------------+       |
|                                                                             |
|  ALL DATA IS DYNAMIC FROM API:                                             |
|  - Fare type names: fare.type (from FareClasses[].Class_Desc)              |
|  - Refundable: fare.refundable (from Fares[].Refundable)                   |
|  - Price: fare.price (from FareDetails[].Total_Amount)                     |
|  - Date change: fare.refundable ? "Allowed" : "Not Allowed"               |
|  - Cancellation: fare.refundable ? "Allowed" : "Not Allowed"              |
|  - Check-in baggage: fare.baggage (from Free_Baggage.Check_In_Baggage)    |
|  - Cabin baggage: fare.cabinBaggage (from Free_Baggage.Hand_Baggage)      |
|  - Meal: fare.foodOnboard (from Fares[].Food_onboard)                      |
+============================================================================+
```

### After Clicking "Select & Book" - Wallet Confirmation Modal

```
+============================================================================+
|                    BOOKING CONFIRMATION                                     |
|                    Book flight for Rahul Kumar                              |
|                                                                             |
|  +-- Flight Details ----------------------------------------------------+  |
|  |  AI Express * IX-1282                                                |  |
|  |  06:05 -> 08:25 * 2h 20m                          [Non-Stop]        |  |
|  |  Fare Type: PUBLISHED                                                |  |
|  +----------------------------------------------------------------------+  |
|                                                                             |
|  +-- Wallet Breakdown -------------------------------------------------+   |
|  |  Employee Wallet Balance                           INR 73,500       |   |
|  |  Flight Fare (PUBLISHED)                         - INR  2,417       |   |
|  |  Balance After Booking                             INR 71,083       |   |
|  +----------------------------------------------------------------------+  |
|                                                                             |
|  What happens when user clicks "Confirm & Book":                           |
|  1. POST /api/flights/book-ticket                                          |
|  2. Backend validates request + checks wallet                              |
|  3. Generates PNR-XXXXXX                                                   |
|  4. Deducts INR 2,417 from employee wallet                                |
|  5. Creates booking + ticket records                                       |
|  6. Sends email to employee with ticket                                    |
|  7. Returns ticket to frontend -> shows TicketCard                         |
|                                                                             |
|          [ Cancel ]                    [ Confirm & Book ]                   |
+============================================================================+
```

---

## 5. UI Flow - Self Booking (Employee)

### Screen: Self Booking Panel (Employee role)

```
+============================================================================+
|  My Approved Requests: [ TR-DEMO2: Chennai -> Mumbai (Flight) v ]          |
|  Wallet Balance: INR 73,500                                                |
+============================================================================+
|  [Flight] [Hotel] [Bus] [Visa] [Cab] [Train]        <-- Mode tabs          |
|  [One Way] [Round Trip]                              <-- Trip type          |
|                                                                             |
|  From: [Chennai]   To: [Mumbai]   Date: [2026-04-14]                      |
|  Passengers: [1, Economy]   Airline: [All v]                               |
|                                                                             |
|                          [ Search ]                                        |
+============================================================================+
| Results:                                                                    |
|  Airline    | Flight | Depart | Arrive | Duration | Stops  | Price         |
|  -----------+--------+--------+--------+----------+--------+-------------- |
|  SpiceJet   | SG-647 | 08:05  | 10:00  | 1h 55m   | Direct | INR 4,263    |
|  IndiGo     | 6E-5093| 08:00  | 10:10  | 2h 10m   | Direct | INR 3,200    |
|  ...                                                        [View fares]   |
|                                                                             |
|  Expanded Fare Card:                                                        |
|  +-- PUBLISHED Fare ---+  +-- LITE Fare -------+  +-- FLEX Fare -------+  |
|  | Refundable          |  | Non-Refundable     |  | Refundable          | |
|  | Cancel: Allowed     |  | Cancel: Not Allowed|  | Cancel: Allowed     | |
|  | Change: Allowed     |  | Change: Not Allowed|  | Change: Allowed     | |
|  | Cabin: 7 Kg         |  | Cabin: 7 Kg        |  | Cabin: 7 Kg         | |
|  | Check-in: 15 Kg     |  | Check-in: –        |  | Check-in: 15 Kg     | |
|  | Meal: Paid Meal     |  | Meal: Paid Meal    |  | Meal: Paid Meal     | |
|  | INR 4,263           |  | INR 6,608          |  | INR 6,739           | |
|  | [Select]            |  | [Select]           |  | [Select]            | |
|  +---------------------+  +--------------------+  +---------------------+ |
+============================================================================+
```

---

## 6. API-to-UI Mapping Table

| # | Supplier API | Backend Route | Service Method | UI Trigger | Current UI Status |
|---|---|---|---|---|---|
| 1 | Air_SectorAvailabilityPI | `POST /air/sectors` | `sectorAvailability()` | Pre-search check for Series fares | Backend ready, UI can call |
| 2 | Air_Search | `POST /air/search` + `POST /flights/search` | `search()` | User clicks "Search" | **Active in UI** |
| 3 | Air_FareRule | `POST /air/fare-rule` | `fareRule()` | User clicks "View fare rules" | Backend ready |
| 4 | Air_LowFare | `POST /air/low-fare` | `lowFare()` | Fare calendar view | Backend ready |
| 5 | Air_Reprice | `POST /air/reprice` | `reprice()` | Auto in `/book` orchestration | Backend ready |
| 6 | Air_GetSSR | `POST /air/ssr` | `getSSR()` | SSR selection before booking | Backend ready |
| 7 | Air_GetSeatMap | `POST /air/seat-map` | `getSeatMap()` | Seat map display | Backend ready |
| 8 | Air_TempBooking | `POST /air/temp-booking` | `tempBooking()` | Auto in `/book` orchestration | Backend ready |
| 9 | Air_Ticketing | `POST /air/ticket` | `ticketing()` | Auto in `/book` orchestration | Backend ready |
| 10 | Air_Reprint | `POST /air/reprint` | `reprint()` | View booking / verify ticket | Backend ready |
| 11 | Air_TicketCancellation | `POST /air/cancel` | `cancel()` | Cancel booking action | Backend ready |
| 12 | Air_History | `POST /air/history` | `history()` | Booking history page | Backend ready |
| 13 | Air_ReleasePNR | `POST /air/release-pnr` | `releasePnr()` | Abandon held booking | Backend ready |
| 14 | Air_GetPostSSR | `POST /air/post-ssr` | `getPostSSR()` | Post-booking add-ons | Backend ready |
| 15 | Air_InitiatePostSSR | `POST /air/post-ssr/initiate` | `initiatePostSSR()` | Select post-booking SSR | Backend ready |
| 16 | Air_ConfirmPostSSR | `POST /air/post-ssr/confirm` | `confirmPostSSR()` | Confirm post-booking SSR | Backend ready |
| 17 | GetBalance | `GET /air/balance` | `getBalance()` | Agency balance check | Backend ready |
| 18 | AddPayment | `POST /air/payment` | `addPayment()` | Auto before ticketing/SSR | Backend ready |

---

## 7. Orchestrated Flows

### Flow A: Full End-to-End Booking (`POST /api/flights/air/book`)

```
  Request: { searchKey, flightKey, fareId, passengers[], passengerEmail,
             passengerMobile, gst, ssrDetails, seatDetails }

  Step 1: Air_Reprice
  ├── Validates fare hasn't changed since search
  ├── If fareChanged=true → HTTP 409 with new price (user must confirm)
  └── If fareChanged=false → proceed

  Step 2: Air_TempBooking
  ├── Creates PNR hold with passenger details
  ├── Returns Booking_RefNo
  └── If no RefNo → HTTP 502 (booking failed)

  Step 3: AddPayment
  ├── Posts agency payment for the booking
  └── Must succeed before ticketing

  Step 4: Air_Ticketing
  ├── Commits the booking with the airline
  ├── Generates final Airline PNR
  └── Returns confirmed ticket details

  Response: { reprice, tempBooking, payment, ticket }
```

### Flow B: Orchestrated Ticketing (`POST /api/flights/air/ticket`)

```
  Request: { bookingRefNo, ticketingType, clientRefNo, productId }

  Step 1: AddPayment(refNo=bookingRefNo)
  Step 2: Air_Ticketing(bookingRefNo)

  Response: { payment, ticket }
```

### Flow C: Post-Booking SSR Confirmation (`POST /api/flights/air/post-ssr/confirm`)

```
  Request: { bookingRefNo, airlinePnr, selections[{paxId, ssrKey}] }

  Step 1: AddPayment(refNo=bookingRefNo)   <-- Spec requires payment first
  Step 2: Air_ConfirmPostSSR(bookingRefNo, selections)

  Response: { payment, result }
```

---

## 8. Error Handling

### Supplier Error Detection

The Air API returns errors inside HTTP 200 responses. The `httpClient.js` detects three patterns:

| Pattern | Example | Detection |
|---------|---------|-----------|
| Response_Header (primary) | `{ Response_Header: { Error_Code: "0003", Error_Desc: "No flights" } }` | `Error_Code` not in `["0", "0000", "00"]` |
| Error object (legacy) | `{ Error: { ErrorCode: "ERR01", Description: "..." } }` | `Error.ErrorCode` present |
| Status flag | `{ Status: "Failed", Status_Id: 22 }` | `Status === "Failed"` or `Status_Id === 22` |

### Error Response Format (to Frontend)

```json
{
  "success": false,
  "message": "Human-readable error from supplier",
  "code": "AIRAPI_BUSINESS_0003",
  "requestId": "1775716900249337391"
}
```

### Retry Logic

- Network errors (ETIMEDOUT, ECONNRESET, ECONNREFUSED) → retry up to `AIRAPI_MAX_RETRIES` (default: 2)
- HTTP 5xx responses → retry with linear backoff
- HTTP 4xx / business errors → no retry (immediate fail)
- Each request has `AIRAPI_TIMEOUT_MS` (default: 30s) via AbortController

### Wallet Insufficient Balance (HTTP 402)

```json
{
  "success": false,
  "message": "Insufficient wallet balance",
  "data": {
    "currentBalance": 5000,
    "required": 7500,
    "shortfall": 2500,
    "employeeName": "Rahul Kumar"
  }
}
```

---

## 9. Configuration

### Environment Variables (backend/.env)

```bash
# Provider selection: airapi | amadeus | mock
FLIGHT_PROVIDER=airapi

# Air API connection
AIRAPI_BASE_URL=http://uat1.easestay.com
AIRAPI_AIR_PATH=/airlinehost/AirAPIService.svc/JSONService
AIRAPI_TRADE_PATH=/tradehost/TradeAPIService.svc/JSONService

# Credentials (shared via email by supplier)
AIRAPI_USER_ID=uateasestaybot
AIRAPI_PASSWORD=6E47168865E6A79C7FE36B7D9E0D471F11B32112
AIRAPI_IP_ADDRESS=192.168.21.167
AIRAPI_IMEI_NUMBER=000000000000000

# Reliability
AIRAPI_TIMEOUT_MS=30000      # Per-request timeout
AIRAPI_MAX_RETRIES=2         # Retry on network/5xx
AIRAPI_RETRY_DELAY_MS=600    # Backoff between retries
```

### Security

- Credentials loaded exclusively from `.env` — never hardcoded
- `Auth_Header` built fresh per request with unique `Request_Id`
- Logger redacts `Password` and `Auth_Header` fields before writing to `airapi.log`
- `.env` is in `.gitignore` — never committed to version control

### City-to-IATA Auto-Resolution

The system automatically converts Indian city names to IATA airport codes:

```
Chennai    → MAA     Mumbai     → BOM     Delhi      → DEL
Bangalore  → BLR     Hyderabad  → HYD     Kolkata    → CCU
Pune       → PNQ     Goa        → GOI     Jaipur     → JAI
Lucknow    → LKO     Ahmedabad  → AMD     Kochi      → COK
... and 70+ more cities
```

If the input is already a 3-letter code (e.g., "BOM"), it passes through unchanged.
