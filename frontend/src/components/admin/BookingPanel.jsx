import { useState, useEffect, useCallback, useMemo } from "react";
import {
  bookingsAPI,
  flightsAPI,
  adminBookingsAPI,
  hotelsAPI,
} from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import TicketCard from "../booking/TicketCard";

/* ─── Color tokens ─── */
const C = {
  bg: "#0B0B14",
  card: "#12121E",
  cardBorder: "#1E1E30",
  cardHover: "#171728",
  accent: "#7C6FFF",
  accentGlow: "rgba(124,111,255,0.18)",
  accentSoft: "rgba(124,111,255,0.08)",
  green: "#30D158",
  amber: "#FF9F0A",
  red: "#FF453A",
  text: "#F0F0F6",
  sub: "#9090A8",
  muted: "#454560",
  divider: "#1C1C2E",
};

const MODES = [
  { id: "Flight", icon: "✈️", label: "Flights" },
  { id: "Hotel", icon: "🏨", label: "Hotels" },
  { id: "Train", icon: "🚆", label: "Trains" },
  { id: "Bus", icon: "🚌", label: "Buses" },
  { id: "Cab", icon: "🚕", label: "Cabs" },
  { id: "Visa", icon: "📋", label: "Visa" },
];

const AIRLINE_META = {
  'IndiGo':      { grad: ['#1A1FCC', '#5C60F5'], abbr: '6E' },
  'Air India':   { grad: ['#8B0000', '#CC2929'], abbr: 'AI' },
  'Vistara':     { grad: ['#4B006E', '#9B1FCC'], abbr: 'UK' },
  'Akasa Air':   { grad: ['#BB4100', '#FF6B00'], abbr: 'QP' },
  'SpiceJet':    { grad: ['#CC0000', '#FF4444'], abbr: 'SG' },
  'AI Express':  { grad: ['#D44000', '#FF6B2B'], abbr: 'IX' },
  'Air India Express': { grad: ['#D44000', '#FF6B2B'], abbr: 'IX' },
  'GoFirst':     { grad: ['#006B3C', '#00B864'], abbr: 'G8' },
  'Go First':    { grad: ['#006B3C', '#00B864'], abbr: 'G8' },
  'StarAir':     { grad: ['#1B3A5C', '#2E6BA4'], abbr: 'S5' },
  'Alliance Air': { grad: ['#B85C00', '#E08A30'], abbr: '9I' },
  'FlyBig':      { grad: ['#00506B', '#0088AA'], abbr: 'S9' },
};

/** Generate a deterministic color gradient from airline code for unlisted airlines */
function getAirlineMeta(airline, airlineCode) {
  if (AIRLINE_META[airline]) return AIRLINE_META[airline];
  const code = airlineCode || (airline || '').substring(0, 2).toUpperCase();
  // Generate deterministic hue from airline code
  const hash = (code.charCodeAt(0) || 65) * 7 + (code.charCodeAt(1) || 65) * 13;
  const hue = hash % 360;
  return { grad: [`hsl(${hue},60%,25%)`, `hsl(${hue},60%,40%)`], abbr: code };
}

const DotLoader = () => (
  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: C.accent,
          animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }}
      />
    ))}
  </div>
);

const Tag = ({ children, color = C.accent }) => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.6px",
      padding: "3px 8px",
      borderRadius: 20,
      background: `${color}18`,
      color,
      border: `1px solid ${color}30`,
      textTransform: "uppercase",
    }}
  >
    {children}
  </span>
);

const GlassCard = ({ children, style = {} }) => (
  <div
    style={{
      background: C.card,
      border: `1px solid ${C.cardBorder}`,
      borderRadius: 16,
      ...style,
    }}
  >
    {children}
  </div>
);

const inputSt = {
  background: "transparent",
  border: "none",
  outline: "none",
  color: C.text,
  fontSize: 15,
  fontWeight: 600,
  width: "100%",
  padding: 0,
};

const GLOBAL_CSS = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes dot-pulse{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.1);opacity:1}}
  *{box-sizing:border-box}
  input[type=date]::-webkit-calendar-picker-indicator{ filter:invert(1) opacity(0.4); cursor:pointer }
  input[type=range]{ -webkit-appearance:none; appearance:none; width:100%; height:4px; background:transparent; outline:none }
  input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:${C.accent}; border:2px solid ${C.bg}; box-shadow:0 0 8px ${C.accent}; cursor:pointer }
  input[type=range]::-webkit-slider-runnable-track{ height:4px; border-radius:2px; background:linear-gradient(90deg,${C.accent},#9B6BFF) }
  select option{ background:#12121E; color:#F0F0F6 }
`;

/* ─── Depart time buckets ─── */
const TIME_SLOTS = [
  { id: "00-06", icon: "🌙", label: "Early", from: 0, to: 6 },
  { id: "06-12", icon: "🌅", label: "Morning", from: 6, to: 12 },
  { id: "12-18", icon: "☀️", label: "Afternoon", from: 12, to: 18 },
  { id: "18-24", icon: "🌆", label: "Evening", from: 18, to: 24 },
];

function getHour(timeStr) {
  if (!timeStr) return 0;
  const t = timeStr.match(/(\d+):(\d+)/);
  if (!t) return 0;
  let h = parseInt(t[1]);
  if (timeStr.toLowerCase().includes("pm") && h !== 12) h += 12;
  if (timeStr.toLowerCase().includes("am") && h === 12) h = 0;
  return h;
}

/* ─── IATA code to city name (for Sector Deals display) ─── */
const IATA_CITY = {
  DEL: 'Delhi', BOM: 'Mumbai', MAA: 'Chennai', BLR: 'Bangalore', HYD: 'Hyderabad',
  CCU: 'Kolkata', PNQ: 'Pune', GOI: 'Goa', JAI: 'Jaipur', AMD: 'Ahmedabad',
  COK: 'Kochi', LKO: 'Lucknow', GAU: 'Guwahati', PAT: 'Patna', IXC: 'Chandigarh',
  BBI: 'Bhubaneswar', VNS: 'Varanasi', ATQ: 'Amritsar', IXR: 'Ranchi', NAG: 'Nagpur',
  SXR: 'Srinagar', IXB: 'Bagdogra', TRV: 'Trivandrum', CJB: 'Coimbatore',
  IXM: 'Madurai', VTZ: 'Vizag', IDR: 'Indore', BDQ: 'Vadodara', UDR: 'Udaipur',
  RPR: 'Raipur', DED: 'Dehradun', IXA: 'Agartala', IXE: 'Mangalore',
};
function cityName(code) { return IATA_CITY[code] || code; }

/* ═══════════════════════════════════════════ */
function Toast({ message, type = 'info', onClose }) {
  const colors = { info: C.accent, success: C.green, warn: C.amber, error: C.red }
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' }
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', top: 24, right: 24, zIndex: 9999,
      background: C.card, border: `1px solid ${colors[type]}40`,
      borderRadius: 14, padding: '14px 20px', maxWidth: 420,
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${colors[type]}20`,
      animation: 'fadeUp .25s ease', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icons[type]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.5 }}>{message}</div>
      </div>
      <span onClick={onClose} style={{ fontSize: 16, color: C.muted, cursor: 'pointer', flexShrink: 0, marginLeft: 8 }}>✕</span>
    </div>
  )
}

export default function BookingPanel() {
  const { user } = useAuth();
  const [modeTab, setModeTab] = useState("Flight");
  const [toast, setToast] = useState(null); // { message, type }
  const showToast = useCallback((message, type = 'info') => setToast({ message, type }), []);
  const [tripType, setTripType] = useState("one-way");
  const [form, setForm] = useState({
    requestId: "",
    origin: "",
    destination: "",
    date: "",
    returnDate: "",
    pax: "1",
    cls: "Economy",
  });
  const [allPending, setAllPending] = useState([]); // all approved requests
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [rawResults, setRawResults] = useState(null); // null = search page, [] = results page
  const [expanded, setExpanded] = useState(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(null);
  const [err, setErr] = useState("");
  // Wallet confirmation modal
  const [confirmData, setConfirmData] = useState(null); // { flight, fare, wallet }

  // Fare rule popup
  const [fareRuleData, setFareRuleData] = useState(null); // { rules, flight, fare }
  const [fareRuleLoading, setFareRuleLoading] = useState(null); // null or 'flightId:fareId'

  // Special deals (Series fares from SectorAvailability)
  const [sectorDeals, setSectorDeals] = useState([]);

  // Low fare calendar (API 4)
  const [lowFareData, setLowFareData] = useState(null); // { fares, origin, destination, month, year }
  const [lowFareLoading, setLowFareLoading] = useState(false);

  // SSR selection (API 6)
  const [ssrData, setSsrData] = useState(null); // { ssrs[], flight, fare }
  const [ssrLoading, setSsrLoading] = useState(null); // null or flightId being loaded
  const [selectedSSRs, setSelectedSSRs] = useState([]); // [ssrKey, ...]

  // Seat map (API 7)
  const [seatMapData, setSeatMapData] = useState(null); // { seatMap[], flight }
  const [seatMapLoading, setSeatMapLoading] = useState(null); // null or flightId being loaded
  const [selectedSeat, setSelectedSeat] = useState(null); // seatNumber

  // Air API booking lifecycle (APIs 5,8,9,17,18)
  const [airBookingStep, setAirBookingStep] = useState(null); // null | 'repricing' | 'booking' | 'paying' | 'ticketing' | 'done' | 'error'
  const [airBookingResult, setAirBookingResult] = useState(null);

  // Reprint / History / Cancel (APIs 10-13)
  const [reprintData, setReprintData] = useState(null);
  const [reprintLoading, setReprintLoading] = useState(false);
  const [airHistory, setAirHistory] = useState(null);
  const [airHistoryLoading, setAirHistoryLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);

  // Post-booking SSR (APIs 14-16)
  const [postSSRData, setPostSSRData] = useState(null);
  const [postSSRLoading, setPostSSRLoading] = useState(false);
  const [selectedPostSSRs, setSelectedPostSSRs] = useState([]);

  // Hold & Pay Later
  const [holdLoading, setHoldLoading] = useState(null); // null or 'flightId:fareId' of the card being held
  const [holdResult, setHoldResult] = useState(null); // { bookingRefNo, airlinePnr, blockedExpiry, totalAmount, flight, fare }
  const [heldFlights, setHeldFlights] = useState([]); // list of held PNRs
  const [payingHeld, setPayingHeld] = useState(null); // bookingRefNo being ticketed

  // Active panel for post-booking management
  const [mgmtPanel, setMgmtPanel] = useState(null); // null | 'reprint' | 'history' | 'cancel' | 'postssr' | 'held'

  /* ─── Hotel state ─── */
  const [hotelForm, setHotelForm] = useState({
    requestId: "",
    city: "",
    checkIn: "",
    checkOut: "",
    rooms: "1",
    guests: "1",
  });
  const [hotelResults, setHotelResults] = useState(null); // null = search page
  const [hotelConfirm, setHotelConfirm] = useState(null); // { hotel, req }
  const [hotelBooking, setHotelBooking] = useState(false);
  const [hotelBooked, setHotelBooked] = useState(null);
  // Hotel filters
  const [hFilterName, setHFilterName] = useState("");
  const [hFilterMinPrice, setHFilterMinPrice] = useState("");
  const [hFilterMaxPrice, setHFilterMaxPrice] = useState("");
  const [hFilterStars, setHFilterStars] = useState([]);
  const [hFilterLocations, setHFilterLocations] = useState([]);
  const [hFilterAmenities, setHFilterAmenities] = useState([]);
  const [hSortBy, setHSortBy] = useState("price_asc");
  const [hAmenitySearch, setHAmenitySearch] = useState("");

  /* ─── Filter state ─── */
  const [filterAirlines, setFilterAirlines] = useState([]); // [] = all checked
  const [filterMaxPrice, setFilterMaxPrice] = useState(null);
  const [filterStops, setFilterStops] = useState([]); // [] = all
  const [filterTimes, setFilterTimes] = useState([]); // [] = all
  const [filterRefund, setFilterRefund] = useState(false);

  /* ─── Only show Flight-mode approved requests ─── */
  const flightPending = useMemo(
    () => allPending.filter((r) => r.travel_mode?.toLowerCase() === "flight"),
    [allPending],
  );

  /* ─── Only show Hotel-mode approved requests ─── */
  const hotelPending = useMemo(
    () => allPending.filter((r) => r.travel_mode?.toLowerCase() === "hotel"),
    [allPending],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h, sec] = await Promise.all([
        bookingsAPI.pending(),
        bookingsAPI.history(),
        flightsAPI.sectors().catch(() => ({ data: { raw: { SectorsPIs: [] } } })),
      ]);
      const pr = p.data || [];
      setAllPending(pr);
      setHistory(h.data || []);
      // Parse sector deals
      const sectors = (sec.data?.raw?.SectorsPIs || []).map(s => {
        const dates = (s.AvailableDates || '').split('|').filter(Boolean);
        return {
          origin: s.Origin, destination: s.Destination,
          dates, firstDate: dates[0], lastDate: dates[dates.length - 1],
          maxTravelDate: s.MaxTravelDate,
        };
      });
      setSectorDeals(sectors);
      // Auto-select first flight request
      const firstFlight = pr.find(
        (r) => r.travel_mode?.toLowerCase() === "flight",
      );
      if (firstFlight && !form.requestId) {
        setForm((v) => ({
          ...v,
          requestId: firstFlight.id,
          origin: firstFlight.from_location || "",
          destination: firstFlight.to_location || "",
          date: firstFlight.start_date?.slice(0, 10) || "",
        }));
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ─── Apply filters to raw results ─── */
  const results = useMemo(() => {
    if (!rawResults) return null;
    let list = [...rawResults];

    // Airlines
    if (filterAirlines.length > 0)
      list = list.filter((f) => filterAirlines.includes(f.airline));

    // Max price
    if (filterMaxPrice != null)
      list = list.filter((f) => f.price <= filterMaxPrice);

    // Stops
    if (filterStops.length > 0)
      list = list.filter((f) => filterStops.includes(f.stops));

    // Depart time slots
    if (filterTimes.length > 0)
      list = list.filter((f) => {
        const h = getHour(f.departureTime);
        return filterTimes.some((slotId) => {
          const slot = TIME_SLOTS.find((s) => s.id === slotId);
          return slot && h >= slot.from && h < slot.to;
        });
      });

    // Refundable only
    if (filterRefund) list = list.filter(f => f.refundable === true)

    return list;
  }, [
    rawResults,
    filterAirlines,
    filterMaxPrice,
    filterStops,
    filterTimes,
    filterRefund,
  ]);

  /* ─── Toggle helpers ─── */
  const toggleAirline = (name) =>
    setFilterAirlines((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );

  const toggleStop = (n) =>
    setFilterStops((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );

  const toggleTime = (id) =>
    setFilterTimes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  /* ─── Hotel search ─── */
  const hotelSearch = async () => {
    if (!hotelForm.city || !hotelForm.checkIn || !hotelForm.checkOut)
      return setErr("Fill City, Check-In and Check-Out dates.");
    if (!hotelForm.requestId)
      return setErr(
        'Select an approved hotel request from "Booking for" first.',
      );
    setErr("");
    setSearching(true);
    setHotelResults(null);
    setHotelBooked(null);
    setHFilterName("");
    setHFilterMinPrice("");
    setHFilterMaxPrice("");
    setHFilterStars([]);
    setHFilterLocations([]);
    setHFilterAmenities([]);
    setHSortBy("price_asc");
    try {
      const r = await hotelsAPI.search({
        city: hotelForm.city,
        checkIn: hotelForm.checkIn,
        checkOut: hotelForm.checkOut,
        rooms: hotelForm.rooms,
        guests: hotelForm.guests,
      });
      setHotelResults(r.data || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSearching(false);
    }
  };

  /* ─── Hotel filtered+sorted results ─── */
  const hotelFiltered = useMemo(() => {
    if (!hotelResults) return null;
    let list = [...hotelResults];
    if (hFilterName)
      list = list.filter((h) =>
        h.name.toLowerCase().includes(hFilterName.toLowerCase()),
      );
    if (hFilterMinPrice)
      list = list.filter((h) => h.pricePerNight >= Number(hFilterMinPrice));
    if (hFilterMaxPrice)
      list = list.filter((h) => h.pricePerNight <= Number(hFilterMaxPrice));
    if (hFilterStars.length)
      list = list.filter((h) => hFilterStars.includes(h.stars));
    if (hFilterLocations.length)
      list = list.filter((h) => hFilterLocations.includes(h.location));
    if (hFilterAmenities.length)
      list = list.filter((h) =>
        hFilterAmenities.every((a) => h.amenities.includes(a)),
      );
    if (hSortBy === "price_asc")
      list.sort((a, b) => a.pricePerNight - b.pricePerNight);
    if (hSortBy === "price_desc")
      list.sort((a, b) => b.pricePerNight - a.pricePerNight);
    if (hSortBy === "stars_desc") list.sort((a, b) => b.stars - a.stars);
    if (hSortBy === "stars_asc") list.sort((a, b) => a.stars - b.stars);
    return list;
  }, [
    hotelResults,
    hFilterName,
    hFilterMinPrice,
    hFilterMaxPrice,
    hFilterStars,
    hFilterLocations,
    hFilterAmenities,
    hSortBy,
  ]);

  /* ─── Hotel confirm + book ─── */
  const initiateHotelBook = (hotel) => {
    const req = hotelPending.find((r) => r.id === hotelForm.requestId);
    if (!req) return setErr("Linked hotel request not found.");
    setHotelConfirm({ hotel, req, walletBal: Number(req.wallet_balance ?? 0) });
  };

  const confirmHotelBook = async () => {
    if (!hotelConfirm) return;
    setHotelBooking(true);
    setErr("");
    try {
      const r = await hotelsAPI.bookHotel({
        requestId: hotelConfirm.req.id,
        hotel: hotelConfirm.hotel,
        checkIn: hotelForm.checkIn,
        checkOut: hotelForm.checkOut,
        rooms: hotelForm.rooms,
        totalPrice: hotelConfirm.hotel.totalPrice,
      });
      setHotelBooked(r.data?.ticket);
      setHotelConfirm(null);
      setHotelResults(null);
      load();
    } catch (e) {
      setHotelConfirm(null);
      setErr(e.message || "Hotel booking failed");
    } finally {
      setHotelBooking(false);
    }
  };

  /* ─── Search ─── */
  const search = async () => {
    if (!form.origin || !form.destination || !form.date)
      return setErr("Fill Origin, Destination and Date.");
    if (modeTab !== "Flight")
      return setErr(`${modeTab} search coming soon — try Flights!`);
    setErr("");
    setSearching(true);
    setRawResults(null);
    setExpanded(null);
    setBooked(null);
    // Reset filters
    setFilterAirlines([]);
    setFilterMaxPrice(null);
    setFilterStops([]);
    setFilterTimes([]);
    setFilterRefund(false);
    try {
      const r = await flightsAPI.search({
        source: form.origin,
        destination: form.destination,
        date: form.date,
        passengers: parseInt(form.pax) || 1,
        travelClass: form.cls,
      });
      setRawResults(r.data);
      // init price slider to max
      if (r.data?.length)
        setFilterMaxPrice(Math.max(...r.data.map((f) => f.price)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setSearching(false);
    }
  };

  /* ─── Fare Rule: fetch detailed cancellation/date-change policy ─── */
  const fetchFareRule = async (flight, fare) => {
    if (!flight.searchKey || !flight.flightKey || !fare.fareId) {
      return setErr('Fare rule details not available for this flight.')
    }
    const key = `${flight.flightId}:${fare.fareId}`
    setFareRuleLoading(key)
    setFareRuleData(null)
    try {
      const r = await flightsAPI.fareRule({
        searchKey: flight.searchKey,
        flightKey: flight.flightKey,
        fareId: fare.fareId,
      })
      setFareRuleData({ rules: r.data?.rules, flight, fare })
    } catch (e) {
      setErr(e.message || 'Failed to load fare rules')
    } finally {
      setFareRuleLoading(null)
    }
  }

  /* ─── Low Fare Calendar (API 4) ─── */
  const fetchLowFare = async () => {
    if (!form.origin || !form.destination) return setErr('Fill Origin and Destination first.')
    setLowFareLoading(true); setLowFareData(null); setErr('')
    try {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const year = now.getFullYear()
      const r = await flightsAPI.lowFare({ origin: form.origin, destination: form.destination, month, year })
      setLowFareData({ fares: r.data, origin: form.origin, destination: form.destination, month, year })
    } catch (e) {
      // Low fare is not available on all routes — show a user-friendly message
      const msg = e.message || ''
      if (msg.includes('Oops') || msg.includes('No data found') || msg.includes('no response')) {
        setErr(`Low fare calendar is not available for ${form.origin} → ${form.destination}. Try a different route or use the regular Search.`)
      } else {
        setErr(msg || 'Failed to load low fares')
      }
    }
    finally { setLowFareLoading(false) }
  }

  /* ─── SSR Selection (API 6) ─── */
  const fetchSSR = async (flight, fare) => {
    if (!flight.searchKey || !flight.flightKey) return showToast('SSR not available for this flight.', 'warn')
    setSsrLoading(flight.flightId); setSsrData(null); setSelectedSSRs([])
    try {
      const r = await flightsAPI.getSSR({ searchKey: flight.searchKey, flightKeys: [flight.flightKey] })
      const ssrs = r.data?.ssrs || []
      if (ssrs.length === 0) {
        showToast('No meals or baggage options available for this flight from the airline.', 'warn')
      } else {
        setSsrData({ ssrs, flight, fare })
      }
    } catch (e) {
      const msg = e.message || 'Failed to load SSR'
      if (msg.includes('Not Available') || msg.includes('failed with an error')) {
        showToast('Meals & baggage add-ons are not available for this flight. The airline does not offer ancillary services on this route/fare.', 'warn')
      } else {
        showToast('Failed to load add-ons: ' + msg, 'error')
      }
    }
    finally { setSsrLoading(null) }
  }

  const toggleSSR = (ssrKey) => {
    setSelectedSSRs(prev => prev.includes(ssrKey) ? prev.filter(k => k !== ssrKey) : [...prev, ssrKey])
  }

  /* ─── Seat Map (API 7) ─── */
  const fetchSeatMap = async (flight) => {
    if (!flight.searchKey || !flight.flightKey) return showToast('Seat map not available for this flight.', 'warn')
    setSeatMapLoading(flight.flightId); setSeatMapData(null); setSelectedSeat(null)
    try {
      const r = await flightsAPI.getSeatMap({ searchKey: flight.searchKey, flightKeys: [flight.flightKey] })
      const seatMap = r.data?.seatMap || []
      if (seatMap.length === 0 || !seatMap[0]?.rows?.length) {
        showToast('Seat selection is not available for this flight. The airline does not provide seat maps on this route/fare.', 'warn')
      } else {
        setSeatMapData({ seatMap, flight })
      }
    } catch (e) {
      const msg = e.message || 'Failed to load seat map'
      if (msg.includes('Not Available') || msg.includes('failed with an error')) {
        showToast('Seat selection is not available for this flight. The airline does not provide seat maps on this route/fare.', 'warn')
      } else {
        showToast('Failed to load seat map: ' + msg, 'error')
      }
    }
    finally { setSeatMapLoading(null) }
  }

  /* ─── Full Air API Booking (APIs 5→8→18→9) ─── */
  const executeAirBooking = async (flight, fare, passengers) => {
    setAirBookingStep('repricing'); setAirBookingResult(null); setErr('')
    try {
      const result = await flightsAPI.bookFull({
        searchKey: flight.searchKey,
        flightKey: flight.flightKey,
        fareId: fare.fareId,
        passengers,
        passengerEmail: passengers[0]?.email || 'booking@company.com',
        passengerMobile: passengers[0]?.mobile || '9999999999',
        ssrDetails: selectedSSRs.map(k => ({ SSR_Key: k })),
        seatDetails: selectedSeat ? [{ Seat_Number: selectedSeat }] : [],
      })
      setAirBookingStep('done')
      setAirBookingResult(result.data)
    } catch (e) {
      setAirBookingStep('error')
      setErr(e.message || 'Booking failed')
    }
  }

  /* ─── Reprint (API 10) ─── */
  const fetchReprint = async (bookingRefNo, airlinePnr = '') => {
    if (!bookingRefNo && !airlinePnr) return setErr('Enter Booking Ref or Airline PNR.')
    setReprintLoading(true); setReprintData(null)
    try {
      const r = await flightsAPI.reprint({ bookingRefNo, airlinePnr })
      setReprintData(r.data)
    } catch (e) { setErr(e.message || 'Reprint failed') }
    finally { setReprintLoading(false) }
  }

  /* ─── History (API 11) ─── */
  const fetchAirHistory = async (fromDate, toDate) => {
    if (!fromDate || !toDate) return setErr('Select date range.')
    setAirHistoryLoading(true); setAirHistory(null)
    try {
      const r = await flightsAPI.history({ fromDate, toDate })
      setAirHistory(r.data)
    } catch (e) { setErr(e.message || 'History fetch failed') }
    finally { setAirHistoryLoading(false) }
  }

  /* ─── Cancel (API 12) ─── */
  const executeCancellation = async (bookingRefNo, airlinePnr, cancelDetails = [], remarks = '') => {
    setCancelResult(null); setErr('')
    try {
      const r = await flightsAPI.cancel({ bookingRefNo, airlinePnr, cancelDetails, remarks, cancellationType: 0 })
      setCancelResult(r.data)
    } catch (e) { setErr(e.message || 'Cancellation failed') }
  }

  /* ─── Release PNR (API 13) ─── */
  const executeReleasePnr = async (bookingRefNo, airlinePnr) => {
    setErr('')
    try {
      await flightsAPI.releasePnr({ bookingRefNo, airlinePnr })
      setErr(''); setReprintData(null)
      showToast('PNR released successfully', 'success')
    } catch (e) { setErr(e.message || 'Release failed') }
  }

  /* ─── Post-Booking SSR (APIs 14-16) ─── */
  const fetchPostSSR = async (bookingRefNo, airlinePnr = '') => {
    setPostSSRLoading(true); setPostSSRData(null); setSelectedPostSSRs([])
    try {
      const r = await flightsAPI.getPostSSR({ bookingRefNo, airlinePnr })
      setPostSSRData({ ssrs: r.data?.ssrs || [], bookingRefNo, airlinePnr })
    } catch (e) { setErr(e.message || 'Failed to load post-booking SSR') }
    finally { setPostSSRLoading(false) }
  }

  const confirmPostSSR = async () => {
    if (!postSSRData || !selectedPostSSRs.length) return
    setErr('')
    try {
      await flightsAPI.confirmPostSSR({
        bookingRefNo: postSSRData.bookingRefNo,
        airlinePnr: postSSRData.airlinePnr,
        selections: selectedPostSSRs.map(k => ({ paxId: 1, ssrKey: k })),
      })
      showToast('Ancillary services confirmed!', 'success')
      setPostSSRData(null); setSelectedPostSSRs([])
    } catch (e) { setErr(e.message || 'Post-SSR confirmation failed') }
  }

  /* ─── Agency Balance (API 17) ─── */
  const [agencyBalance, setAgencyBalance] = useState(null)
  const fetchAgencyBalance = async (refNo) => {
    try {
      const r = await flightsAPI.getBalance(refNo)
      setAgencyBalance(r.data)
    } catch (e) { setErr(e.message || 'Balance check failed') }
  }

  /* ─── Hold Flight: TempBooking without payment/ticketing ─── */
  const holdFlight = async (flight, fare) => {
    if (!flight.searchKey || !flight.flightKey) return showToast('Cannot hold this flight — missing booking keys.', 'error')
    const req = flightPending.find(r => r.id === form.requestId)
    if (!req) return showToast('Select an approved flight request first.', 'warn')

    const holdKey = `${flight.flightId}:${fare.fareId}`
    setHoldLoading(holdKey); setHoldResult(null); setErr('')
    try {
      // Step 1: Reprice to validate fare
      const rp = await flightsAPI.reprice({
        searchKey: flight.searchKey,
        flights: [{ flightKey: flight.flightKey, fareId: fare.fareId }],
      })
      if (rp.data?.fareChanged) {
        showToast('Fare has changed since search. Please search again.', 'warn')
        setHoldLoading(null)
        return
      }

      // Step 2: TempBooking — creates PNR hold without payment
      const r = await flightsAPI.tempBooking({
        searchKey: flight.searchKey,
        flightKey: flight.flightKey,
        passengerEmail: req.user_email || 'booking@company.com',
        passengerMobile: req.user_mobile || '9999999999',
        passengers: [{
          id: 1, type: 'ADT', title: 'Mr',
          firstName: (req.user_name || 'Guest').split(' ')[0],
          lastName: (req.user_name || 'Guest').split(' ').slice(1).join(' ') || 'User',
          gender: 'M',
        }],
      })

      const held = {
        bookingRefNo: r.data?.bookingRefNo || '',
        airlinePnr:   r.data?.airlinePnr || '',
        blockedExpiry: r.data?.blockedExpiry || '',
        totalAmount:   r.data?.totalAmount || fare.price,
        status:        r.data?.status || 'Held',
        flight: { airline: flight.airline, flightNumber: flight.flightNumber, departureTime: flight.departureTime, arrivalTime: flight.arrivalTime, duration: flight.duration, origin: flight.origin || form.origin, destination: flight.destination || form.destination },
        fare: { type: fare.type, price: fare.price },
        heldAt: new Date().toISOString(),
        employeeName: req.user_name,
        requestId: form.requestId,
      }

      setHoldResult(held)
      setHeldFlights(prev => [held, ...prev])
      showToast(`Flight held! PNR: ${held.bookingRefNo || held.airlinePnr || 'pending'}`, 'success')
    } catch (e) {
      showToast('Hold failed: ' + (e.message || 'Unknown error'), 'error')
    } finally {
      setHoldLoading(false)
    }
  }

  /* ─── Pay & Ticket a held flight ─── */
  const payAndTicketHeld = async (held) => {
    setPayingHeld(held.bookingRefNo); setErr('')
    try {
      // AddPayment → Air_Ticketing (orchestrated)
      const r = await flightsAPI.ticketing({
        bookingRefNo: held.bookingRefNo,
        ticketingType: 1,
      })
      showToast(`Ticket issued! PNR: ${r.data?.ticket?.airlinePnr || held.bookingRefNo}`, 'success')
      // Update held list — mark as ticketed
      setHeldFlights(prev => prev.map(h =>
        h.bookingRefNo === held.bookingRefNo ? { ...h, status: 'Ticketed', ticketResult: r.data } : h
      ))
    } catch (e) {
      showToast('Ticketing failed: ' + (e.message || 'Unknown error'), 'error')
    } finally {
      setPayingHeld(null)
    }
  }

  /* ─── Release a held PNR ─── */
  const releaseHeld = async (held) => {
    setErr('')
    try {
      await flightsAPI.releasePnr({ bookingRefNo: held.bookingRefNo, airlinePnr: held.airlinePnr })
      showToast('PNR released successfully', 'success')
      setHeldFlights(prev => prev.map(h =>
        h.bookingRefNo === held.bookingRefNo ? { ...h, status: 'Released' } : h
      ))
    } catch (e) {
      showToast('Release failed: ' + (e.message || 'Unknown error'), 'error')
    }
  }

  /* ─── Check status of a held PNR ─── */
  const checkHeldStatus = async (held) => {
    try {
      const r = await flightsAPI.reprint({ bookingRefNo: held.bookingRefNo, airlinePnr: held.airlinePnr })
      setHeldFlights(prev => prev.map(h =>
        h.bookingRefNo === held.bookingRefNo ? { ...h, status: r.data?.status || h.status, latestReprint: r.data } : h
      ))
      showToast(`Status: ${r.data?.status || 'Unknown'}`, 'info')
    } catch (e) {
      showToast('Status check failed: ' + (e.message || 'Unknown error'), 'error')
    }
  }

  /* ─── Pre-book: show confirmation modal using wallet_balance from pending request ─── */
  const initiateBook = (flight, fare) => {
    if (!form.requestId)
      return setErr(
        'Please select an approved flight request from "Booking for" first.',
      );
    setErr("");
    const req = flightPending.find((r) => r.id === form.requestId);
    if (!req) return setErr("Linked request not found. Please re-select.");
    // wallet_balance comes directly from /bookings/pending query (no extra API call needed)
    const walletBal = Number(req.wallet_balance ?? req.walletBalance ?? null);
    setConfirmData({
      flight,
      fare,
      walletBal: isNaN(walletBal) ? null : walletBal,
      employeeName: req.user_name,
    });
  };

  /* ─── Confirm & execute booking ─── */
  const confirmBook = async () => {
    if (!confirmData) return;
    const { flight, fare } = confirmData;
    setBooking(true);
    setErr("");
    try {
      const r = await flightsAPI.bookTicket({
        requestId: form.requestId,
        selectedFlight: flight,
        fareType: fare.type,
        price: fare.price,
      });
      setBooked(r.data?.ticket);
      setConfirmData(null);
      setRawResults(null);
      setExpanded(null);
      load();
    } catch (e) {
      setConfirmData(null);
      // 402 = insufficient balance — backend returns structured data
      if (e.status === 402) {
        setErr(
          `Insufficient balance for ${confirmData?.employeeName}. Wallet has ₹${Number(e?.data?.currentBalance || 0).toLocaleString("en-IN")}, fare is ₹${Number(fare.price).toLocaleString("en-IN")} (shortfall ₹${Number(e?.data?.shortfall || 0).toLocaleString("en-IN")})`,
        );
      } else {
        setErr(e.message || "Booking failed");
      }
    } finally {
      setBooking(false);
    }
  };

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 300,
          flexDirection: "column",
          gap: 16,
        }}
      >
        <DotLoader />
        <span style={{ color: C.sub, fontSize: 13 }}>Loading…</span>
      </div>
    );

  /* ──── FARE RULE POPUP ──── */
  if (fareRuleData) {
    const { rules, flight, fare } = fareRuleData;
    // The supplier returns HTML in FareRuleDesc — extract and clean it
    const fareRules = rules?.FareRules || [];
    const ruleHtml = fareRules.map(r => r.FareRuleDesc || '').join('');
    // Clean supplier HTML into readable text
    const cleanHtml = (raw) => {
      return raw
        .replace(/<br\s*\/?>/gi, '\n')       // <br>, <br/>, <br />
        .replace(/<\/br>/gi, '\n')            // </br>
        .replace(/__nls__/g, '\n')            // supplier's custom line break
        .replace(/<[^>]*>/g, '')              // strip all remaining HTML tags
        .replace(/&nbsp;/gi, ' ')             // &nbsp; → space
        .replace(/&amp;/gi, '&')              // &amp; → &
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#?\w+;/gi, '')             // any remaining HTML entities
        .replace(/[ \t]+/g, ' ')              // collapse spaces (but keep \n)
        .replace(/\n\s*\n/g, '\n')            // collapse blank lines
        .trim();
    };
    const parseRuleText = (html) => {
      if (!html) return [];
      const sections = [];
      // Extract table rows: <th>SECTION</th><td>details</td>
      const rowRegex = /<th[^>]*(?:colspan[^>]*)?>([^<]*)<\/th>\s*(?:<th[^>]*>[^<]*<\/th>\s*)?<td>([\s\S]*?)<\/td>/gi;
      let match;
      while ((match = rowRegex.exec(html)) !== null) {
        const label = cleanHtml(match[1]).trim();
        const content = cleanHtml(match[2]).trim();
        if (label && content) sections.push({ label, content });
      }
      // Fallback: strip all HTML
      if (!sections.length && html) {
        const text = cleanHtml(html);
        if (text) sections.push({ label: 'Fare Rules', content: text });
      }
      return sections;
    };
    const parsedRules = parseRuleText(ruleHtml);

    return (
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(6px)', animation: 'fadeUp .2s ease',
        }}
        onClick={() => setFareRuleData(null)}
      >
        <style>{GLOBAL_CSS}</style>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 20,
            padding: 32, width: 520, maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto', overflowX: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,.6)',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
              Fare Policy Details
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
              {flight.airline} · {flight.flightNumber}
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
              {flight.departureTime} → {flight.arrivalTime} · {fare.type} Fare
            </div>
          </div>

          {/* Rules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {parsedRules.map((rule, i) => {
              const icons = { CANCELLATION: '❌', RESCHEDULE: '🔄', NO_SHOW: '⚠️', SEAT_CHARGES: '💺', BAGGAGE: '🧳' };
              const colors = { CANCELLATION: C.red, RESCHEDULE: C.amber, NO_SHOW: C.red, SEAT_CHARGES: C.sub, BAGGAGE: C.green };
              const key = rule.label.toUpperCase();
              const icon = icons[key] || '📋';
              const color = colors[key] || C.sub;

              return (
                <div key={i} style={{
                  background: C.bg, borderRadius: 12, padding: 16,
                  border: `1px solid ${C.divider}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{icon}</span> {rule.label}
                  </div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-line', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    {rule.content}
                  </div>
                </div>
              );
            })}
            {parsedRules.length === 0 && (
              <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 20 }}>
                No detailed fare rules available for this fare.
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={() => setFareRuleData(null)}
            style={{
              width: '100%', marginTop: 20, background: C.divider, color: C.sub,
              border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700,
              cursor: 'pointer', fontSize: 13, transition: 'all .2s',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  /* ──── LOW FARE CALENDAR POPUP (API 4) ──── */
  if (lowFareData) {
    const raw = lowFareData.fares;
    // Navigate through possible nesting: data.fares.LowFares or data.fares.fares.LowFares
    const dailyFares = raw?.LowFares || raw?.fares?.LowFares || raw?.LowFareDetails || raw?.Fares || [];
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }} onClick={() => setLowFareData(null)}>
        <style>{GLOBAL_CSS}</style>
        <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: 32, width: 560, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>📅 Low Fare Calendar</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{lowFareData.origin} → {lowFareData.destination}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{lowFareData.month}/{lowFareData.year}</div>
          </div>
          {dailyFares.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {dailyFares.map((d, i) => {
                const date = d.TravelDate || d.Date || d.DepartureDate || '';
                const price = d.Total_Amount || d.Amount || d.Fare || d.MinFare || 0;
                return (
                  <div key={i} onClick={() => { setForm(v => ({ ...v, date: date.split(' ')[0]?.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2') || '' })); setLowFareData(null); }}
                    style={{ background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '8px 4px', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}>
                    <div style={{ fontSize: 10, color: C.sub }}>
                      {(() => { const [m,d2,y] = (date.split(' ')[0] || '').split('/'); return d2 ? `${d2}/${m}` : date; })()}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: price > 0 ? C.green : C.muted, marginTop: 2 }}>
                      {price > 0 ? `₹${Number(price).toLocaleString('en-IN')}` : '—'}
                    </div>
                    {d.AirlineCode && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{d.AirlineCode}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 20 }}>
              No daily fare breakdown available for this route.
            </div>
          )}
          <button onClick={() => setLowFareData(null)} style={{ width: '100%', marginTop: 16, background: C.divider, color: C.sub, border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Close</button>
        </div>
      </div>
    );
  }

  /* ──── SSR SELECTION POPUP (API 6) ──── */
  if (ssrData) {
    const { ssrs, flight, fare } = ssrData;
    const ssrTotal = ssrs.filter(s => selectedSSRs.includes(s.ssrKey)).reduce((sum, s) => sum + s.price, 0);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }} onClick={() => setSsrData(null)}>
        <style>{GLOBAL_CSS}</style>
        <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: 32, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>🍽 Add Meals & Baggage</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{flight.airline} · {flight.flightNumber}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{fare.type} Fare · ₹{fare.price?.toLocaleString('en-IN')}</div>
          </div>
          {ssrs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ssrs.map(s => {
                const isSelected = selectedSSRs.includes(s.ssrKey);
                return (
                  <div key={s.ssrKey} onClick={() => toggleSSR(s.ssrKey)} style={{
                    background: isSelected ? `${C.accent}15` : C.bg, border: `1px solid ${isSelected ? C.accent : C.divider}`,
                    borderRadius: 10, padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all .15s',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.desc || s.code}</div>
                      <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{s.type} · {s.code}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>₹{s.price?.toLocaleString('en-IN')}</span>
                      <span style={{ fontSize: 16, color: isSelected ? C.accent : C.muted }}>{isSelected ? '☑' : '☐'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>No ancillary services available for this flight.</div>
          )}
          {selectedSSRs.length > 0 && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: C.bg, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${C.accent}40` }}>
              <span style={{ fontSize: 13, color: C.sub }}>Selected: {selectedSSRs.length} item(s)</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.accent }}>+ ₹{ssrTotal.toLocaleString('en-IN')}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => setSsrData(null)} style={{ flex: 1, background: C.divider, color: C.sub, border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Close</button>
            {selectedSSRs.length > 0 && (
              <button onClick={() => { setSsrData(null); }} style={{ flex: 1, background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Confirm Selection</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ──── SEAT MAP POPUP (API 7) ──── */
  if (seatMapData) {
    const { seatMap, flight } = seatMapData;
    const segment = seatMap[0];
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }} onClick={() => setSeatMapData(null)}>
        <style>{GLOBAL_CSS}</style>
        <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: 32, width: 480, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>💺 Choose Your Seat</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{flight.airline} · {flight.flightNumber}</div>
          </div>
          {segment && segment.rows?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              {segment.rows.map(row => (
                <div key={row.rowNumber} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ width: 24, fontSize: 10, color: C.muted, textAlign: 'right' }}>{row.rowNumber}</span>
                  {row.seats.map(seat => (
                    <div key={seat.seatNumber}
                      onClick={() => seat.available && setSelectedSeat(selectedSeat === seat.seatNumber ? null : seat.seatNumber)}
                      style={{
                        width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, cursor: seat.available ? 'pointer' : 'not-allowed',
                        background: selectedSeat === seat.seatNumber ? C.accent : seat.available ? C.bg : `${C.red}20`,
                        color: selectedSeat === seat.seatNumber ? '#fff' : seat.available ? C.text : C.muted,
                        border: `1px solid ${selectedSeat === seat.seatNumber ? C.accent : seat.available ? C.divider : `${C.red}30`}`,
                        transition: 'all .15s',
                      }}
                      title={seat.available ? `${seat.seatNumber} — ₹${seat.price}` : `${seat.seatNumber} — Occupied`}
                    >
                      {seat.seatNumber.replace(/\d+/, '')}
                    </div>
                  ))}
                </div>
              ))}
              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 10, color: C.sub }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: C.bg, border: `1px solid ${C.divider}`, marginRight: 4, verticalAlign: 'middle' }} /> Available</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: `${C.red}20`, border: `1px solid ${C.red}30`, marginRight: 4, verticalAlign: 'middle' }} /> Occupied</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: C.accent, marginRight: 4, verticalAlign: 'middle' }} /> Selected</span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>
              {seatMap.length === 0 ? 'Seat map not available for this flight.' : (
                <pre style={{ color: C.text, fontSize: 11, textAlign: 'left', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(seatMap, null, 2)}</pre>
              )}
            </div>
          )}
          {selectedSeat && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: C.bg, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${C.green}40` }}>
              <span style={{ fontSize: 13, color: C.text }}>Selected: <strong>{selectedSeat}</strong></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>₹{segment?.rows?.flatMap(r => r.seats).find(s => s.seatNumber === selectedSeat)?.price?.toLocaleString('en-IN') || '0'}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => setSeatMapData(null)} style={{ flex: 1, background: C.divider, color: C.sub, border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Close</button>
            {selectedSeat && (
              <button onClick={() => setSeatMapData(null)} style={{ flex: 1, background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Confirm Seat</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ──── HOLD RESULT MODAL ──── */
  if (holdResult) {
    const h = holdResult;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', animation: 'fadeUp .2s ease' }} onClick={() => setHoldResult(null)}>
        <style>{GLOBAL_CSS}</style>
        <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.amber}40`, borderRadius: 20, padding: 32, width: 480, boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Flight Held Successfully</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>PNR on Hold</div>
          </div>

          <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.sub }}>Booking Ref</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.amber }}>{h.bookingRefNo || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: C.sub }}>Airline PNR</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{h.airlinePnr || '—'}</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.sub }}>Flight</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{h.flight.airline} · {h.flight.flightNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.sub }}>Route</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{h.flight.origin} → {h.flight.destination}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.sub }}>Time</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{h.flight.departureTime} → {h.flight.arrivalTime}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.sub }}>Fare</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{h.fare.type} · ₹{h.totalAmount?.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.sub }}>Employee</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{h.employeeName}</span>
              </div>
              {h.blockedExpiry && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: C.sub }}>Hold Expires</span>
                  <span style={{ color: C.red, fontWeight: 700 }}>{h.blockedExpiry}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 10, padding: '12px 16px', fontSize: 12, color: C.amber, marginBottom: 20 }}>
            ⏳ This PNR is held but NOT ticketed. Go to <strong>Booking Management → Held Flights</strong> to pay and issue the ticket before the hold expires.
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setHoldResult(null)} style={{ flex: 1, background: C.divider, color: C.sub, border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Close</button>
            <button onClick={() => { setHoldResult(null); setMgmtPanel('held'); }} style={{ flex: 1, background: `linear-gradient(135deg, ${C.amber}, #FFB84D)`, color: '#0B0B14', border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>View Held Flights</button>
          </div>
        </div>
      </div>
    );
  }

  /* ──── AIR BOOKING PROGRESS (APIs 5,8,9,17,18) ──── */
  if (airBookingStep) {
    const steps = [
      { key: 'repricing', label: 'Validating fare...', icon: '🔄' },
      { key: 'booking', label: 'Creating PNR hold...', icon: '📝' },
      { key: 'paying', label: 'Processing payment...', icon: '💳' },
      { key: 'ticketing', label: 'Issuing ticket...', icon: '🎫' },
      { key: 'done', label: 'Booking confirmed!', icon: '✅' },
      { key: 'error', label: 'Booking failed', icon: '❌' },
    ];
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: 36, width: 440, boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>
          <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 20 }}>✈ Air API Booking</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.filter(s => s.key !== 'error' || airBookingStep === 'error').filter(s => s.key !== 'done' || airBookingStep === 'done').slice(0, airBookingStep === 'done' ? 5 : airBookingStep === 'error' ? 6 : undefined).map(s => {
              const isCurrent = s.key === airBookingStep;
              const isPast = steps.findIndex(x => x.key === airBookingStep) > steps.findIndex(x => x.key === s.key);
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: isPast ? 0.5 : 1 }}>
                  <span style={{ fontSize: 18 }}>{isPast ? '✓' : s.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? C.text : C.sub }}>
                    {s.label} {isCurrent && airBookingStep !== 'done' && airBookingStep !== 'error' && <DotLoader />}
                  </span>
                </div>
              );
            })}
          </div>
          {airBookingResult && airBookingStep === 'done' && (
            <div style={{ marginTop: 20, background: C.bg, borderRadius: 12, padding: 16, border: `1px solid ${C.green}30` }}>
              <div style={{ fontSize: 12, color: C.sub }}>Booking Reference</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.green, marginTop: 4 }}>{airBookingResult.ticket?.bookingRefNo || airBookingResult.tempBooking?.bookingRefNo || '—'}</div>
              {airBookingResult.ticket?.airlinePnr && (
                <div style={{ fontSize: 12, color: C.sub, marginTop: 8 }}>Airline PNR: <strong style={{ color: C.text }}>{airBookingResult.ticket.airlinePnr}</strong></div>
              )}
            </div>
          )}
          {(airBookingStep === 'done' || airBookingStep === 'error') && (
            <button onClick={() => { setAirBookingStep(null); setAirBookingResult(null); }} style={{ width: '100%', marginTop: 20, background: C.divider, color: C.sub, border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Close</button>
          )}
        </div>
      </div>
    );
  }

  /* ──── WALLET CONFIRMATION MODAL (flight) ──── */
  if (confirmData) {
    const { flight, fare, walletBal, employeeName } = confirmData;
    const remaining = walletBal != null ? walletBal - fare.price : null;
    const sufficient = remaining == null || remaining >= 0;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(6px)",
          animation: "fadeUp .2s ease",
        }}
      >
        <style>{GLOBAL_CSS}</style>
        <div
          style={{
            background: C.card,
            border: `1px solid ${sufficient ? C.cardBorder : C.red}`,
            borderRadius: 20,
            padding: 36,
            width: 460,
            boxShadow: `0 24px 80px rgba(0,0,0,.6)`,
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11,
                color: C.accent,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Booking Confirmation
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>
              Book flight for {employeeName}
            </div>
          </div>
          <div
            style={{
              background: C.bg,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  {flight.airline} · {flight.flightNumber}
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                  {flight.departureTime} → {flight.arrivalTime} ·{" "}
                  {flight.duration}
                </div>
              </div>
              <Tag color={flight.stops === 0 ? C.green : C.amber}>
                {flight.stopsLabel ||
                  (flight.stops === 0 ? 'Non-Stop' : `${flight.stops} Stop${flight.stops > 1 ? 's' : ''}`)}
              </Tag>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                color: C.sub,
                paddingTop: 10,
                borderTop: `1px solid ${C.divider}`,
              }}
            >
              <span>Fare Type</span>
              <span style={{ color: C.text, fontWeight: 600 }}>
                {fare.type}
              </span>
            </div>
          </div>
          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${C.divider}`,
              overflow: "hidden",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                padding: "13px 16px",
                display: "flex",
                justifyContent: "space-between",
                borderBottom: `1px solid ${C.divider}`,
              }}
            >
              <span style={{ fontSize: 13, color: C.sub }}>
                Employee Wallet Balance
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color:
                    walletBal != null ? (sufficient ? C.green : C.red) : C.sub,
                }}
              >
                {walletBal != null
                  ? `₹${walletBal.toLocaleString("en-IN")}`
                  : "Checking…"}
              </span>
            </div>
            <div
              style={{
                padding: "13px 16px",
                display: "flex",
                justifyContent: "space-between",
                borderBottom: `1px solid ${C.divider}`,
                background: `${C.accent}08`,
              }}
            >
              <span style={{ fontSize: 13, color: C.sub }}>
                Flight Fare ({fare.type})
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                — ₹{fare.price.toLocaleString("en-IN")}
              </span>
            </div>
            <div
              style={{
                padding: "13px 16px",
                display: "flex",
                justifyContent: "space-between",
                background: sufficient ? "#30D15812" : "#FF453A12",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: sufficient ? C.green : C.red,
                }}
              >
                Balance After Booking
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: sufficient ? C.green : C.red,
                }}
              >
                {remaining != null
                  ? `₹${remaining.toLocaleString("en-IN")}`
                  : "—"}
              </span>
            </div>
          </div>
          {!sufficient && walletBal != null && (
            <div
              style={{
                background: "#FF453A14",
                border: "1px solid #FF453A30",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 16,
                fontSize: 13,
                color: C.red,
              }}
            >
              ⚠ Insufficient balance — shortfall of ₹
              {Math.abs(remaining).toLocaleString("en-IN")}. Try a Saver fare.
            </div>
          )}
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 20 }}>
            ✓ Ticket will be generated and sent to {employeeName}'s employee
            portal immediately.
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setConfirmData(null)}
              style={{
                flex: 1,
                background: "transparent",
                border: `1px solid ${C.cardBorder}`,
                color: C.sub,
                padding: "13px 0",
                borderRadius: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmBook}
              disabled={booking || !sufficient}
              style={{
                flex: 2,
                background: sufficient
                  ? `linear-gradient(135deg,${C.accent},#9B6BFF)`
                  : `${C.red}30`,
                color: sufficient ? "#fff" : C.red,
                border: sufficient ? "none" : `1px solid ${C.red}40`,
                padding: "13px 0",
                borderRadius: 12,
                fontWeight: 800,
                cursor: booking || !sufficient ? "default" : "pointer",
                fontSize: 14,
                boxShadow: sufficient ? `0 4px 18px ${C.accentGlow}` : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: booking ? 0.6 : 1,
              }}
            >
              {booking ? (
                <>
                  <DotLoader />
                </>
              ) : sufficient ? (
                "✈ Confirm & Book"
              ) : (
                "Insufficient Balance"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ──── HOTEL CONFIRM MODAL ──── */
  if (hotelConfirm) {
    const { hotel, req, walletBal } = hotelConfirm;
    const remaining = walletBal - hotel.totalPrice;
    const sufficient = remaining >= 0;
    const nights = hotel.nights || 1;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.78)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(6px)",
          animation: "fadeUp .2s ease",
        }}
      >
        <style>{GLOBAL_CSS}</style>
        <div
          style={{
            background: C.card,
            border: `1px solid ${sufficient ? C.cardBorder : C.red}`,
            borderRadius: 20,
            padding: 36,
            width: 480,
            boxShadow: "0 24px 80px rgba(0,0,0,.6)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.accent,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Hotel Booking Confirmation
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: C.text,
              marginBottom: 20,
            }}
          >
            Book hotel for {req.user_name}
          </div>

          <div
            style={{
              background: C.bg,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: C.text,
                marginBottom: 4,
              }}
            >
              {hotel.name} {"★".repeat(hotel.stars)}
            </div>
            <div style={{ fontSize: 12, color: C.sub }}>{hotel.address}</div>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 10,
                fontSize: 12,
                color: C.sub,
              }}
            >
              <span>
                📅 Check-in:{" "}
                <b style={{ color: C.text }}>{hotelForm.checkIn}</b>
              </span>
              <span>
                📅 Check-out:{" "}
                <b style={{ color: C.text }}>{hotelForm.checkOut}</b>
              </span>
              <span>
                🌙 {nights} Night{nights > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${C.divider}`,
              overflow: "hidden",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                padding: "13px 16px",
                display: "flex",
                justifyContent: "space-between",
                borderBottom: `1px solid ${C.divider}`,
              }}
            >
              <span style={{ fontSize: 13, color: C.sub }}>
                Employee Wallet Balance
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: sufficient ? C.green : C.red,
                }}
              >
                ₹{walletBal.toLocaleString("en-IN")}
              </span>
            </div>
            <div
              style={{
                padding: "13px 16px",
                display: "flex",
                justifyContent: "space-between",
                borderBottom: `1px solid ${C.divider}`,
                background: `${C.accent}08`,
              }}
            >
              <span style={{ fontSize: 13, color: C.sub }}>
                Hotel Total ({nights} Night{nights > 1 ? "s" : ""})
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                — ₹{hotel.totalPrice.toLocaleString("en-IN")}
              </span>
            </div>
            <div
              style={{
                padding: "13px 16px",
                display: "flex",
                justifyContent: "space-between",
                background: sufficient ? "#30D15812" : "#FF453A12",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: sufficient ? C.green : C.red,
                }}
              >
                Balance After Booking
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: sufficient ? C.green : C.red,
                }}
              >
                ₹{remaining.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {!sufficient && (
            <div
              style={{
                background: "#FF453A14",
                border: "1px solid #FF453A30",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 16,
                fontSize: 13,
                color: C.red,
              }}
            >
              ⚠ Insufficient balance — shortfall of ₹
              {Math.abs(remaining).toLocaleString("en-IN")}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setHotelConfirm(null)}
              style={{
                flex: 1,
                background: "transparent",
                border: `1px solid ${C.cardBorder}`,
                color: C.sub,
                padding: "13px 0",
                borderRadius: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmHotelBook}
              disabled={hotelBooking || !sufficient}
              style={{
                flex: 2,
                background: sufficient
                  ? `linear-gradient(135deg,${C.accent},#9B6BFF)`
                  : `${C.red}30`,
                color: sufficient ? "#fff" : C.red,
                border: sufficient ? "none" : `1px solid ${C.red}40`,
                padding: "13px 0",
                borderRadius: 12,
                fontWeight: 800,
                cursor: hotelBooking || !sufficient ? "default" : "pointer",
                fontSize: 14,
                boxShadow: sufficient ? `0 4px 18px ${C.accentGlow}` : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: hotelBooking ? 0.6 : 1,
              }}
            >
              {hotelBooking ? (
                <DotLoader />
              ) : sufficient ? (
                "🏨 Confirm & Book"
              ) : (
                "Insufficient Balance"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ──── HOTEL RESULTS VIEW ──── */
  if (hotelResults) {
    const allLocations = [
      ...new Set(hotelResults.map((h) => h.location)),
    ].sort();
    const allAmenitiesInResults = [
      ...new Set(hotelResults.flatMap((h) => h.amenities)),
    ].sort();
    const filteredAmenities = hAmenitySearch
      ? allAmenitiesInResults.filter((a) =>
          a.toLowerCase().includes(hAmenitySearch.toLowerCase()),
        )
      : allAmenitiesInResults;
    const nights = hotelResults[0]?.nights || 1;
    const checkinFmt = hotelForm.checkIn
      ? new Date(hotelForm.checkIn + "T00:00")
          .toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .toUpperCase()
      : "";
    const checkoutFmt = hotelForm.checkOut
      ? new Date(hotelForm.checkOut + "T00:00")
          .toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .toUpperCase()
      : "";
    const policyMax =
      hotelPending.find((r) => r.id === hotelForm.requestId)
        ?.max_hotel_per_night || 0;

    return (
      <div
        style={{
          fontFamily: "'Inter',sans-serif",
          paddingBottom: 60,
          animation: "fadeUp .35s ease",
        }}
      >
        <style>{GLOBAL_CSS}</style>
        {err && <ErrBar>{err}</ErrBar>}
        {hotelBooked && (
          <div
            style={{
              background: "#30D15812",
              border: "1px solid #30D15830",
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 20,
              color: C.green,
              fontWeight: 700,
            }}
          >
            ✓ Hotel Booked — Ticket sent to employee portal (PNR:{" "}
            {hotelBooked.pnr_number})
          </div>
        )}

        {/* Summary strip */}
        <GlassCard style={{ padding: "16px 24px", marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>
                {hotelForm.city.split(",")[0]}
              </div>
              <div style={{ fontSize: 12, color: C.sub }}>
                {hotelForm.city.split(",").slice(1).join(",").trim() || "India"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {[
                { label: "Check-In", val: checkinFmt },
                { label: "Check-Out", val: checkoutFmt },
                {
                  label: "Room & Guest",
                  val: `${hotelForm.rooms} Room / ${hotelForm.guests} Guest`,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: "0 20px",
                    borderLeft: i > 0 ? `1px solid ${C.divider}` : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: C.sub,
                      marginBottom: 3,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {item.val}
                  </div>
                </div>
              ))}
              <div
                style={{
                  padding: "0 20px",
                  borderLeft: `1px solid ${C.divider}`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: C.sub }}>Nights</div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: C.accent,
                    lineHeight: 1,
                  }}
                >
                  {nights}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setHotelResults(null);
                setHotelBooked(null);
              }}
              style={{
                background: `linear-gradient(135deg,${C.accent},#9B6BFF)`,
                color: "#fff",
                border: "none",
                padding: "12px 24px",
                borderRadius: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13,
                boxShadow: `0 4px 18px ${C.accentGlow}`,
              }}
            >
              ← Modify Search
            </button>
          </div>
        </GlassCard>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            <span style={{ color: C.accent }}>{hotelFiltered?.length}</span>{" "}
            hotels found{" "}
            {hotelFiltered?.length !== hotelResults.length && (
              <span style={{ fontSize: 12, color: C.sub }}>
                (of {hotelResults.length})
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: C.sub }}>Sort By</span>
            <select
              value={hSortBy}
              onChange={(e) => setHSortBy(e.target.value)}
              style={{
                background: C.card,
                border: `1px solid ${C.cardBorder}`,
                color: C.text,
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="stars_desc">Stars: High to Low</option>
              <option value="stars_asc">Stars: Low to High</option>
            </select>
          </div>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "248px 1fr", gap: 20 }}
        >
          {/* ── FILTER SIDEBAR ── */}
          <GlassCard
            style={{
              padding: 20,
              alignSelf: "start",
              position: "sticky",
              top: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Filters
              </span>
              <button
                onClick={() => {
                  setHFilterName("");
                  setHFilterMinPrice("");
                  setHFilterMaxPrice("");
                  setHFilterStars([]);
                  setHFilterLocations([]);
                  setHFilterAmenities([]);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: C.accent,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Reset All
              </button>
            </div>

            {/* Map placeholder */}
            <div
              style={{
                background: "#1a2235",
                borderRadius: 10,
                height: 100,
                marginBottom: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${C.cardBorder}`,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "repeating-linear-gradient(0deg,transparent,transparent 19px,#1E2D4022 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,#1E2D4022 20px)",
                  backgroundSize: "20px 20px",
                }}
              />
              <span style={{ fontSize: 12, color: C.sub, zIndex: 1 }}>
                🗺 View on Map
              </span>
            </div>

            <FSection title="Hotel Name">
              <input
                value={hFilterName}
                onChange={(e) => setHFilterName(e.target.value)}
                placeholder="Search By Hotel Name"
                style={{
                  width: "100%",
                  background: C.bg,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 7,
                  color: C.text,
                  padding: "8px 12px",
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </FSection>

            <FSection title="Price Range">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={hFilterMinPrice}
                  onChange={(e) => setHFilterMinPrice(e.target.value)}
                  placeholder="Min"
                  style={{
                    flex: 1,
                    background: C.bg,
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 7,
                    color: C.text,
                    padding: "8px 10px",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <input
                  value={hFilterMaxPrice}
                  onChange={(e) => setHFilterMaxPrice(e.target.value)}
                  placeholder="Max"
                  style={{
                    flex: 1,
                    background: C.bg,
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 7,
                    color: C.text,
                    padding: "8px 10px",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
              </div>
            </FSection>

            <FSection title="Star Category">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[0, 1, 2, 3, 4, 5].map((s) => {
                  const active = hFilterStars.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setHFilterStars((prev) =>
                          prev.includes(s)
                            ? prev.filter((x) => x !== s)
                            : [...prev, s],
                        )
                      }
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: `1px solid ${active ? "#FFD60A" : C.cardBorder}`,
                        background: active ? "#FFD60A18" : "transparent",
                        cursor: "pointer",
                        fontSize: 11,
                        color: active ? "#FFD60A" : C.sub,
                        fontWeight: 600,
                      }}
                    >
                      {s === 0 ? "0★" : "★".repeat(s)}
                    </button>
                  );
                })}
              </div>
            </FSection>

            <FSection title="Search By Location">
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {allLocations.map((loc) => (
                  <label
                    key={loc}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hFilterLocations.includes(loc)}
                      onChange={() =>
                        setHFilterLocations((prev) =>
                          prev.includes(loc)
                            ? prev.filter((x) => x !== loc)
                            : [...prev, loc],
                        )
                      }
                      style={{
                        accentColor: C.accent,
                        width: 13,
                        height: 13,
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        color: hFilterLocations.includes(loc) ? C.text : C.sub,
                      }}
                    >
                      {loc}
                    </span>
                  </label>
                ))}
              </div>
            </FSection>

            <FSection title="Amenities" last>
              <input
                value={hAmenitySearch}
                onChange={(e) => setHAmenitySearch(e.target.value)}
                placeholder="Type Amenities Here"
                style={{
                  width: "100%",
                  background: C.bg,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 7,
                  color: C.text,
                  padding: "7px 10px",
                  fontSize: 12,
                  outline: "none",
                  marginBottom: 10,
                }}
              />
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {filteredAmenities.map((am) => (
                  <label
                    key={am}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hFilterAmenities.includes(am)}
                      onChange={() =>
                        setHFilterAmenities((prev) =>
                          prev.includes(am)
                            ? prev.filter((x) => x !== am)
                            : [...prev, am],
                        )
                      }
                      style={{
                        accentColor: C.accent,
                        width: 13,
                        height: 13,
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        color: hFilterAmenities.includes(am) ? C.text : C.sub,
                      }}
                    >
                      {am}
                    </span>
                  </label>
                ))}
              </div>
            </FSection>
          </GlassCard>

          {/* ── HOTEL CARDS ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!hotelFiltered?.length ? (
              <GlassCard style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ color: C.sub, fontSize: 14 }}>
                  No hotels match your filters.
                </div>
                <button
                  onClick={() => {
                    setHFilterName("");
                    setHFilterMinPrice("");
                    setHFilterMaxPrice("");
                    setHFilterStars([]);
                    setHFilterLocations([]);
                    setHFilterAmenities([]);
                  }}
                  style={{
                    marginTop: 16,
                    background: C.accentSoft,
                    color: C.accent,
                    border: `1px solid ${C.accent}30`,
                    padding: "9px 20px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Clear Filters
                </button>
              </GlassCard>
            ) : (
              (hotelFiltered || []).map((hotel) => {
                const outOfPolicy =
                  policyMax > 0 && hotel.pricePerNight > policyMax;
                const AMENITY_ICONS = {
                  "Free WiFi": "📶",
                  Restaurant: "🍽",
                  "Swimming Pool": "🏊",
                  Gym: "🏋",
                  Internet: "🌐",
                  "Business Center": "💼",
                  Bar: "🍺",
                  Laundry: "👔",
                  "Room Service": "🛎",
                  Parking: "🅿",
                  Spa: "💆",
                  "Conference Room": "🎤",
                };
                return (
                  <GlassCard key={hotel.hotelId} style={{ overflow: "hidden" }}>
                    <div style={{ display: "flex", gap: 0 }}>
                      {/* Image */}
                      <div
                        style={{
                          width: 220,
                          minHeight: 160,
                          background: `linear-gradient(135deg,#1a2235,#0d1520)`,
                          flexShrink: 0,
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ fontSize: 40 }}>🏨</span>
                        <button
                          style={{
                            position: "absolute",
                            top: 10,
                            left: 10,
                            background: "rgba(255,255,255,0.1)",
                            border: "none",
                            borderRadius: "50%",
                            width: 32,
                            height: 32,
                            cursor: "pointer",
                            fontSize: 16,
                            color: "#fff",
                          }}
                        >
                          ♡
                        </button>
                      </div>

                      {/* Details */}
                      <div
                        style={{
                          flex: 1,
                          padding: "16px 20px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              marginBottom: 6,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 800,
                                  color: C.text,
                                }}
                              >
                                {hotel.name}{" "}
                                <span
                                  style={{ fontSize: 12, color: "#FFD60A" }}
                                >
                                  {"★".repeat(hotel.stars)}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: C.sub,
                                  marginTop: 3,
                                }}
                              >
                                📍 {hotel.address}
                              </div>
                            </div>
                            {outOfPolicy && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#FF453A",
                                  background: "#FF453A14",
                                  border: "1px solid #FF453A30",
                                  borderRadius: 6,
                                  padding: "3px 8px",
                                  whiteSpace: "nowrap",
                                  flexShrink: 0,
                                  marginLeft: 12,
                                }}
                              >
                                🚩 OUT OF POLICY
                              </span>
                            )}
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: C.sub,
                                background: C.bg,
                                border: `1px solid ${C.cardBorder}`,
                                borderRadius: 6,
                                padding: "3px 10px",
                              }}
                            >
                              ☕ {hotel.roomType}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 10,
                              fontSize: 12,
                              color: C.sub,
                            }}
                          >
                            {hotel.amenities.slice(0, 6).map((am) => (
                              <span key={am}>
                                {AMENITY_ICONS[am] || "•"} {am}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Price + CTA */}
                      <div
                        style={{
                          width: 180,
                          padding: "16px 20px",
                          borderLeft: `1px solid ${C.divider}`,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 9,
                              color: C.muted,
                              letterSpacing: "0.5px",
                              marginBottom: 2,
                            }}
                          >
                            STARTS FROM
                          </div>
                          <div
                            style={{
                              fontSize: 22,
                              fontWeight: 900,
                              color: C.text,
                            }}
                          >
                            ₹{hotel.pricePerNight.toLocaleString("en-IN")}
                          </div>
                          <div style={{ fontSize: 10, color: C.sub }}>
                            {hotelForm.rooms} Room / {hotel.nights} Night
                            {hotel.nights > 1 ? "s" : ""}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: C.accent,
                              fontWeight: 700,
                              marginTop: 4,
                            }}
                          >
                            Total: ₹{hotel.totalPrice.toLocaleString("en-IN")}
                          </div>
                        </div>
                        <button
                          onClick={() => initiateHotelBook(hotel)}
                          style={{
                            background: `linear-gradient(135deg,${C.accent},#9B6BFF)`,
                            color: "#fff",
                            border: "none",
                            padding: "10px 18px",
                            borderRadius: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: 12,
                            boxShadow: `0 4px 14px ${C.accentGlow}`,
                            width: "100%",
                          }}
                        >
                          Select Room
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ──── RESULTS VIEW ──── */
  if (rawResults) {
    const srcCode =
      form.origin.match(/\((\w+)\)/)?.[1] ||
      form.origin.slice(0, 3).toUpperCase();
    const dstCode =
      form.destination.match(/\((\w+)\)/)?.[1] ||
      form.destination.slice(0, 3).toUpperCase();
    const dateStr = new Date(form.date + "T00:00:00").toLocaleDateString(
      "en-IN",
      { weekday: "short", day: "numeric", month: "short", year: "numeric" },
    );
    const allAirlines = [...new Set(rawResults.map((f) => f.airline))];
    const globalMin = Math.min(...rawResults.map((f) => f.price));
    const globalMax = Math.max(...rawResults.map((f) => f.price));

    return (
      <div
        style={{
          fontFamily: "'Inter',sans-serif",
          paddingBottom: 60,
          animation: "fadeUp .35s ease",
        }}
      >
        <style>{GLOBAL_CSS}</style>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

        {err && <ErrBar>{err}</ErrBar>}
        {booked && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.green, fontWeight: 700, marginBottom: 10 }}>
              ✓ Flight Booked — Ticket sent to employee portal
            </div>
            <TicketCard ticket={booked} onClose={() => setBooked(null)} />
          </div>
        )}

        {/* ── Summary Strip ── */}
        <GlassCard
          style={{
            padding: "18px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 5,
              }}
            >
              <span style={{ fontSize: 21, fontWeight: 800, color: C.text }}>
                {form.origin}
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    height: 1,
                    width: 44,
                    background: `linear-gradient(90deg,${C.accent},${C.muted})`,
                  }}
                />
                <span style={{ fontSize: 11, color: C.accent }}>✈</span>
                <div
                  style={{
                    height: 1,
                    width: 44,
                    background: `linear-gradient(90deg,${C.muted},${C.accent})`,
                  }}
                />
              </div>
              <span style={{ fontSize: 21, fontWeight: 800, color: C.text }}>
                {form.destination}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.sub }}>
              {form.pax} Adult · {form.cls} · {dateStr}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: C.accent,
                lineHeight: 1,
              }}
            >
              {results?.length}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
              {results?.length !== rawResults.length
                ? `of ${rawResults.length} flights`
                : "flights found"}
            </div>
          </div>
          <button
            onClick={() => {
              setRawResults(null);
              setExpanded(null);
            }}
            style={{
              background: `linear-gradient(135deg,${C.accent},#9B6BFF)`,
              color: "#fff",
              border: "none",
              padding: "12px 26px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
              boxShadow: `0 4px 18px ${C.accentGlow}`,
            }}
          >
            ← Modify Search
          </button>
        </GlassCard>

        <div
          style={{ display: "grid", gridTemplateColumns: "224px 1fr", gap: 20 }}
        >
          {/* ── FILTER SIDEBAR ── */}
          <GlassCard
            style={{
              padding: 20,
              alignSelf: "start",
              position: "sticky",
              top: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Filters
              </span>
              <button
                onClick={() => {
                  setFilterAirlines([]);
                  setFilterMaxPrice(globalMax);
                  setFilterStops([]);
                  setFilterTimes([]);
                  setFilterRefund(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: C.accent,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Reset All
              </button>
            </div>

            {/* Airlines */}
            <FSection title="Airlines">
              {allAirlines.map((a) => {
                const m = getAirlineMeta(a);
                const checked =
                  filterAirlines.length === 0 || filterAirlines.includes(a);
                return (
                  <label
                    key={a}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 10,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        // if all checked → uncheck others, leave only this
                        if (filterAirlines.length === 0)
                          setFilterAirlines(allAirlines.filter((x) => x !== a));
                        else toggleAirline(a);
                      }}
                      style={{
                        accentColor: C.accent,
                        width: 14,
                        height: 14,
                        cursor: "pointer",
                      }}
                    />
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: `linear-gradient(135deg,${m.grad[0]},${m.grad[1]})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 8,
                        fontWeight: 900,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {m.abbr}
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: checked ? C.text : C.muted,
                      }}
                    >
                      {a}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: C.muted,
                        marginLeft: "auto",
                      }}
                    >
                      {rawResults.filter((f) => f.airline === a).length}
                    </span>
                  </label>
                );
              })}
            </FSection>

            {/* Price Range */}
            <FSection title="Max Price">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: C.sub,
                  marginBottom: 10,
                }}
              >
                <span>₹{globalMin.toLocaleString("en-IN")}</span>
                <span style={{ color: C.accent, fontWeight: 700 }}>
                  ₹{(filterMaxPrice ?? globalMax).toLocaleString("en-IN")}
                </span>
              </div>
              <input
                type="range"
                min={globalMin}
                max={globalMax}
                step={100}
                value={filterMaxPrice ?? globalMax}
                onChange={(e) => setFilterMaxPrice(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </FSection>

            {/* Depart Time */}
            <FSection title="Depart Time">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {TIME_SLOTS.map((slot) => {
                  const active = filterTimes.includes(slot.id);
                  const count = rawResults.filter((f) => {
                    const h = getHour(f.departureTime);
                    return h >= slot.from && h < slot.to;
                  }).length;
                  return (
                    <button
                      key={slot.id}
                      onClick={() => toggleTime(slot.id)}
                      style={{
                        background: active ? C.accentSoft : C.bg,
                        border: `1px solid ${active ? C.accent : C.cardBorder}`,
                        borderRadius: 8,
                        padding: "9px 6px",
                        cursor: "pointer",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 3,
                        opacity: count === 0 ? 0.4 : 1,
                        transition: "all .15s",
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{slot.icon}</span>
                      <span
                        style={{
                          fontSize: 9,
                          color: active ? C.accent : C.sub,
                          fontWeight: active ? 700 : 400,
                        }}
                      >
                        {slot.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: active ? C.accent : C.muted,
                          fontWeight: 600,
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FSection>

            {/* Stops */}
            <FSection title="Stops">
              {[
                { label: "Non-Stop", v: 0 },
                { label: "1 Stop", v: 1 },
                { label: "2+ Stops", v: 2 },
              ].map(({ label, v }) => {
                const cnt = rawResults.filter(
                  (f) => f.stops === v || (v === 2 && f.stops >= 2),
                ).length;
                const isOn =
                  filterStops.length === 0 || filterStops.includes(v);
                return (
                  <label
                    key={v}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      cursor: "pointer",
                      opacity: cnt === 0 ? 0.4 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => {
                        if (filterStops.length === 0)
                          setFilterStops([0, 1, 2].filter((x) => x !== v));
                        else toggleStop(v);
                      }}
                      style={{
                        accentColor: C.accent,
                        width: 14,
                        height: 14,
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        color: isOn ? C.text : C.muted,
                        flex: 1,
                      }}
                    >
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: C.muted }}>{cnt}</span>
                  </label>
                );
              })}
            </FSection>

            {/* Refundable */}
            <FSection title="Fare Type" last>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={filterRefund}
                  onChange={(e) => setFilterRefund(e.target.checked)}
                  style={{
                    accentColor: C.accent,
                    width: 14,
                    height: 14,
                    cursor: "pointer",
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: filterRefund ? C.green : C.sub,
                  }}
                >
                  Refundable Only
                </span>
              </label>
            </FSection>
          </GlassCard>

          {/* ── FLIGHT CARDS ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {results && results.length === 0 ? (
              <GlassCard style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ color: C.sub, fontSize: 14 }}>
                  No flights match your filters.
                </div>
                <button
                  onClick={() => {
                    setFilterAirlines([]);
                    setFilterMaxPrice(globalMax);
                    setFilterStops([]);
                    setFilterTimes([]);
                  }}
                  style={{
                    marginTop: 16,
                    background: C.accentSoft,
                    color: C.accent,
                    border: `1px solid ${C.accent}30`,
                    padding: "9px 20px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Clear Filters
                </button>
              </GlassCard>
            ) : (
              (results || []).map((fl) => {
                const meta = getAirlineMeta(fl.airline, fl.airlineCode);
                const isOpen = expanded === fl.flightId;
                return (
                  <GlassCard
                    key={fl.flightId}
                    style={{
                      overflow: "hidden",
                      transition: "border-color .2s",
                      borderColor: isOpen ? C.accent : C.cardBorder,
                    }}
                  >
                    {/* Main row */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "190px 1fr 1fr 1fr 200px",
                        alignItems: "center",
                      }}
                    >
                      {/* Airline */}
                      <div
                        style={{
                          padding: "22px 20px",
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          borderRight: `1px solid ${C.divider}`,
                        }}
                      >
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 14,
                            background: `linear-gradient(135deg,${meta.grad[0]},${meta.grad[1]})`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 900,
                            color: "#fff",
                            flexShrink: 0,
                            boxShadow: `0 4px 14px ${meta.grad[1]}55`,
                          }}
                        >
                          {meta.abbr}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: C.text,
                            }}
                          >
                            {fl.airline}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: C.muted,
                              marginTop: 2,
                            }}
                          >
                            {fl.flightNumber}
                          </div>
                          <div style={{ marginTop: 5 }}>
                            <Tag color={fl.refundable ? C.green : C.red}>
                              {fl.refundable ? 'Refundable' : 'Non-Refundable'}
                            </Tag>
                          </div>
                        </div>
                      </div>

                      {/* Depart */}
                      <div
                        style={{
                          padding: "22px 16px",
                          textAlign: "center",
                          borderRight: `1px solid ${C.divider}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 900,
                            color: C.text,
                            letterSpacing: "-1px",
                          }}
                        >
                          {fl.departureTime}
                        </div>
                        <div
                          style={{ fontSize: 11, color: C.sub, marginTop: 4 }}
                        >
                          {srcCode} · {fl.departureTerminal}
                        </div>
                      </div>

                      {/* Duration */}
                      <div
                        style={{
                          padding: "22px 12px",
                          textAlign: "center",
                          borderRight: `1px solid ${C.divider}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: C.sub,
                            marginBottom: 8,
                          }}
                        >
                          {fl.duration}
                        </div>
                        <div
                          style={{
                            position: "relative",
                            height: 2,
                            background: C.divider,
                            margin: "0 10px",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              width: "100%",
                              height: "100%",
                              background: `linear-gradient(90deg,${C.accent},${fl.stops === 0 ? C.green : C.amber})`,
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              right: -4,
                              top: -7,
                              fontSize: 12,
                            }}
                          >
                            ✈
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            marginTop: 8,
                            color: fl.stops === 0 ? C.green : C.amber,
                            textShadow: `0 0 10px ${fl.stops === 0 ? C.green : C.amber}60`,
                          }}
                        >
                          {fl.stopsLabel ||
                            (fl.stops === 0 ? 'Non-Stop' : `${fl.stops} Stop${fl.stops > 1 ? 's' : ''}`)}
                        </div>
                      </div>

                      {/* Arrive */}
                      <div
                        style={{
                          padding: "22px 16px",
                          textAlign: "center",
                          borderRight: `1px solid ${C.divider}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 900,
                            color: C.text,
                            letterSpacing: "-1px",
                          }}
                        >
                          {fl.arrivalTime}
                        </div>
                        <div
                          style={{ fontSize: 11, color: C.sub, marginTop: 4 }}
                        >
                          {dstCode} · {fl.arrivalTerminal}
                        </div>
                      </div>

                      {/* Price + CTA */}
                      <div
                        style={{
                          padding: "22px 20px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 10,
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 9,
                              color: C.muted,
                              letterSpacing: "0.5px",
                              marginBottom: 2,
                            }}
                          >
                            FROM
                          </div>
                          <div
                            style={{
                              fontSize: 23,
                              fontWeight: 900,
                              color: C.text,
                              letterSpacing: "-0.5px",
                            }}
                          >
                            ₹{fl.price.toLocaleString("en-IN")}
                          </div>
                          <div style={{ fontSize: 10, color: C.sub }}>
                            per person
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setExpanded(isOpen ? null : fl.flightId)
                          }
                          style={{
                            background: isOpen
                              ? C.accentSoft
                              : `linear-gradient(135deg,${C.accent},#9B6BFF)`,
                            color: isOpen ? C.accent : "#fff",
                            border: isOpen ? `1px solid ${C.accent}40` : "none",
                            padding: "10px 20px",
                            borderRadius: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: 13,
                            boxShadow: isOpen
                              ? "none"
                              : `0 4px 14px ${C.accentGlow}`,
                            transition: "all .2s",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isOpen ? "Collapse ↑" : "View Fares →"}
                        </button>
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            fontSize: 11,
                            color: C.muted,
                          }}
                        >
                          {fl.seatsAvailable != null && (
                            <span
                              style={{
                                color:
                                  fl.seatsAvailable < 20 ? C.amber : C.muted,
                              }}
                            >
                              💺 {fl.seatsAvailable} left
                            </span>
                          )}
                          <span>🧳 {[fl.baggage, fl.cabinBaggage].filter(Boolean).join(' + ') || '–'}</span>
                        </div>
                      </div>
                    </div>

                    {/* ── Fare cards (expanded) ── */}
                    {isOpen && (
                      <div
                        style={{
                          borderTop: `1px solid ${C.accent}40`,
                          padding: 24,
                          background: `linear-gradient(180deg,${C.accentSoft},transparent)`,
                          display: "grid",
                          gridTemplateColumns: "repeat(3,1fr)",
                          gap: 16,
                          animation: "fadeUp .2s ease",
                        }}
                      >
                        {fl.fareOptions.map((fare, fi) => (
                          <div
                            key={fare.type}
                            style={{
                              borderRadius: 14,
                              padding: 20,
                              border: `1px solid ${fi === 0 ? C.accent : C.cardBorder}`,
                              background:
                                fi === 0
                                  ? `linear-gradient(160deg,${C.accentSoft},${C.card})`
                                  : C.card,
                              position: "relative",
                            }}
                          >
                            {fi === 0 && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: -11,
                                  left: 16,
                                  background: `linear-gradient(90deg,${C.accent},#9B6BFF)`,
                                  fontSize: 9,
                                  fontWeight: 800,
                                  color: "#fff",
                                  padding: "3px 12px",
                                  borderRadius: 20,
                                  letterSpacing: "1px",
                                }}
                              >
                                ★ BEST VALUE
                              </div>
                            )}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 14,
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 800,
                                    color: C.text,
                                  }}
                                >
                                  {fare.type}
                                </div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: fare.refundable ? C.green : C.red,
                                    fontWeight: 600,
                                    marginTop: 3,
                                  }}
                                >
                                  ● {fare.refundable ? 'Refundable' : 'Non-Refundable'}
                                </div>
                              </div>
                              <div
                                style={{
                                  fontSize: 19,
                                  fontWeight: 900,
                                  color: fi === 0 ? C.accent : C.text,
                                }}
                              >
                                ₹{fare.price.toLocaleString("en-IN")}
                              </div>
                            </div>
                            <div
                              style={{
                                borderTop: `1px solid ${C.divider}`,
                                paddingTop: 12,
                                fontSize: 12,
                                color: C.sub,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                marginBottom: 16,
                              }}
                            >
                              <Row
                                label="🔄 Date change"
                                val={
                                  <span style={{ color: fare.refundable ? C.amber : C.red }}>
                                    {fare.refundable ? 'Allowed' : 'Not Allowed'}
                                  </span>
                                }
                              />
                              <Row
                                label="❌ Cancellation"
                                val={
                                  <span style={{ color: fare.refundable ? C.amber : C.red }}>
                                    {fare.refundable ? 'Allowed' : 'Not Allowed'}
                                  </span>
                                }
                              />
                              <Row
                                label="🧳 Check-in"
                                val={
                                  <span style={{ color: (fare.baggage || fl.baggage) ? C.green : C.muted }}>
                                    {fare.baggage || fl.baggage || 'Not Included'}
                                  </span>
                                }
                              />
                              <Row
                                label="🎒 Cabin"
                                val={
                                  <span style={{ color: (fare.cabinBaggage || fl.cabinBaggage) ? C.green : C.muted }}>
                                    {fare.cabinBaggage || fl.cabinBaggage || 'Not Included'}
                                  </span>
                                }
                              />
                              {fare.foodOnboard && (
                                <Row
                                  label="🍽 Meal"
                                  val={
                                    <span style={{ color: C.sub }}>
                                      {fare.foodOnboard}
                                    </span>
                                  }
                                />
                              )}
                              {(() => {
                                const thisKey = `${fl.flightId}:${fare.fareId}`;
                                const isFareRuleThis = fareRuleLoading === thisKey;
                                const isSSRThis = ssrLoading === fl.flightId;
                                const isSeatThis = seatMapLoading === fl.flightId;
                                return (
                                  <>
                                    <div
                                      onClick={() => !fareRuleLoading && fetchFareRule(fl, fare)}
                                      style={{
                                        marginTop: 4, fontSize: 11, color: C.accent,
                                        cursor: isFareRuleThis ? 'wait' : 'pointer',
                                        fontWeight: 600, textAlign: 'center',
                                        opacity: (fareRuleLoading && !isFareRuleThis) ? 0.4 : 1,
                                      }}
                                    >
                                      {isFareRuleThis ? '⏳ Loading...' : '📋 View Policy Details'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 4 }}>
                                      <div
                                        onClick={() => !ssrLoading && fetchSSR(fl, fare)}
                                        style={{
                                          fontSize: 11, color: C.amber, fontWeight: 600,
                                          cursor: isSSRThis ? 'wait' : 'pointer',
                                          opacity: (ssrLoading && !isSSRThis) ? 0.4 : 1,
                                        }}
                                      >
                                        {isSSRThis ? '⏳ Loading...' : '🍽 Add Meals/Baggage'}
                                      </div>
                                      <div
                                        onClick={() => !seatMapLoading && fetchSeatMap(fl)}
                                        style={{
                                          fontSize: 11, color: C.green, fontWeight: 600,
                                          cursor: isSeatThis ? 'wait' : 'pointer',
                                          opacity: (seatMapLoading && !isSeatThis) ? 0.4 : 1,
                                        }}
                                      >
                                        {isSeatThis ? '⏳ Loading...' : '💺 Choose Seat'}
                                      </div>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                            <button
                              onClick={() => {
                                initiateBook(fl, fare);
                              }}
                              disabled={booking}
                              style={{
                                width: "100%",
                                background:
                                  fi === 0
                                    ? `linear-gradient(135deg,${C.accent},#9B6BFF)`
                                    : C.divider,
                                color: fi === 0 ? "#fff" : C.sub,
                                border: "none",
                                padding: "11px 0",
                                borderRadius: 10,
                                fontWeight: 700,
                                cursor: booking ? "default" : "pointer",
                                fontSize: 13,
                                boxShadow:
                                  fi === 0
                                    ? `0 4px 14px ${C.accentGlow}`
                                    : "none",
                                transition: "all .2s",
                                opacity: booking ? 0.5 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                              }}
                            >
                              {booking ? <DotLoader /> : "✈ Select & Book"}
                            </button>
                            {(() => {
                              const thisHoldKey = `${fl.flightId}:${fare.fareId}`;
                              const isThisLoading = holdLoading === thisHoldKey;
                              const anyLoading = !!holdLoading;
                              return (
                                <button
                                  onClick={() => holdFlight(fl, fare)}
                                  disabled={anyLoading || booking}
                                  style={{
                                    width: '100%',
                                    background: 'none',
                                    color: C.amber,
                                    border: `1px solid ${C.amber}40`,
                                    padding: '9px 0',
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    cursor: (anyLoading || booking) ? 'default' : 'pointer',
                                    fontSize: 12,
                                    transition: 'all .2s',
                                    opacity: (anyLoading || booking) ? 0.5 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    marginTop: 8,
                                  }}
                                >
                                  {isThisLoading ? <DotLoader /> : '🔒 Hold & Pay Later'}
                                </button>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ──── SEARCH FORM VIEW ──── */
  return (
    <div
      style={{
        fontFamily: "'Inter',sans-serif",
        paddingBottom: 60,
        animation: "fadeUp .3s ease",
      }}
    >
      <style>{GLOBAL_CSS}</style>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 11,
            color: C.accent,
            fontWeight: 700,
            letterSpacing: "2px",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          ✦ Booking Admin Portal
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 900,
            color: C.text,
            lineHeight: 1.1,
          }}
        >
          Book travel for your team,
          <br />
          <span
            style={{
              background: `linear-gradient(90deg,${C.accent},#B06BFF)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            effortlessly.
          </span>
        </h1>
        <p style={{ margin: "10px 0 0", color: C.sub, fontSize: 14 }}>
          Search · Compare · Book — sent instantly to the employee's portal
        </p>
      </div>

      {err && <ErrBar>{err}</ErrBar>}

      {booked && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: C.green, fontWeight: 700, marginBottom: 10 }}>
            ✓ Flight Booked Successfully — Ticket sent to employee portal
          </div>
          <TicketCard ticket={booked} onClose={() => setBooked(null)} />
        </div>
      )}

      {/* ── Special Fare Deals (from Air_SectorAvailabilityPI) ── */}
      {modeTab === 'Flight' && sectorDeals.length > 0 && !rawResults && (
        <GlassCard style={{ marginBottom: 28, padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${C.cardBorder}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>🔥</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Special Fare Deals</div>
              <div style={{ fontSize: 11, color: C.sub }}>Bulk-negotiated series fares at discounted rates</div>
            </div>
          </div>
          <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sectorDeals.map((deal, i) => {
              const fromDate = deal.firstDate;
              const toDate = deal.lastDate;
              // Parse MM/DD/YYYY to display-friendly format
              const fmtDate = (d) => {
                if (!d) return '';
                const [m, day, y] = d.split('/');
                const dt = new Date(y, m - 1, day);
                return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
              };
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: C.bg, borderRadius: 12, padding: '14px 20px',
                  border: `1px solid ${C.divider}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: `linear-gradient(135deg, ${C.accent}30, ${C.accent}10)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18,
                    }}>✈️</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                        {cityName(deal.origin)} → {cityName(deal.destination)}
                        <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, marginLeft: 8 }}>
                          {deal.origin} → {deal.destination}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                        📅 {fmtDate(fromDate)} — {fmtDate(toDate)}
                        <span style={{ marginLeft: 12, color: C.green, fontWeight: 600 }}>
                          {deal.dates.length} dates available
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setForm(v => ({
                        ...v,
                        origin: cityName(deal.origin),
                        destination: cityName(deal.destination),
                        date: '',
                      }));
                      setModeTab('Flight');
                    }}
                    style={{
                      background: `linear-gradient(135deg, ${C.accent}, #9B6BFF)`,
                      color: '#fff', border: 'none', padding: '9px 18px',
                      borderRadius: 10, fontWeight: 700, cursor: 'pointer',
                      fontSize: 12, boxShadow: `0 4px 14px ${C.accentGlow}`,
                      transition: 'all .2s', whiteSpace: 'nowrap',
                    }}
                  >
                    Search Deals →
                  </button>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* ── Search Card ── */}
      <GlassCard style={{ overflow: "hidden", marginBottom: 28 }}>
        {/* Mode tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${C.cardBorder}`,
            padding: "0 24px",
            gap: 4,
          }}
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setModeTab(m.id)}
              style={{
                padding: "15px 20px",
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                borderBottom:
                  modeTab === m.id
                    ? `2px solid ${C.accent}`
                    : "2px solid transparent",
                color: modeTab === m.id ? C.accent : C.muted,
                fontSize: 12,
                fontWeight: modeTab === m.id ? 700 : 400,
                transition: "all .15s",
              }}
            >
              <span style={{ fontSize: 18 }}>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {/* ── HOTEL search form ── */}
          {modeTab === "Hotel" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 13, color: C.sub }}>
                  Book a hotel for an approved request
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    Booking for:
                  </span>
                  {hotelPending.length === 0 ? (
                    <span
                      style={{
                        fontSize: 12,
                        color: C.amber,
                        padding: "8px 14px",
                        background: `${C.amber}12`,
                        borderRadius: 8,
                        border: `1px solid ${C.amber}30`,
                      }}
                    >
                      ⚠ No approved hotel requests
                    </span>
                  ) : (
                    <select
                      value={hotelForm.requestId}
                      onChange={(e) => {
                        const r = hotelPending.find(
                          (x) => x.id === e.target.value,
                        );
                        if (r)
                          setHotelForm((v) => ({
                            ...v,
                            requestId: r.id,
                            city: r.to_location || "",
                            checkIn: r.start_date?.slice(0, 10) || "",
                            checkOut: r.end_date?.slice(0, 10) || "",
                          }));
                        else setHotelForm((v) => ({ ...v, requestId: "" }));
                      }}
                      style={{
                        background: C.bg,
                        border: `1px solid ${C.cardBorder}`,
                        borderRadius: 8,
                        color: C.text,
                        padding: "9px 14px",
                        fontSize: 12,
                        outline: "none",
                        maxWidth: 360,
                        cursor: "pointer",
                      }}
                    >
                      <option value="">
                        — Select approved hotel request —
                      </option>
                      {hotelPending.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.user_name} · {r.to_location} · Wallet ₹
                          {Number(r.wallet_balance || 0).toLocaleString(
                            "en-IN",
                          )}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  background: C.bg,
                  borderRadius: 14,
                  padding: 4,
                  alignItems: "stretch",
                  minHeight: 72,
                }}
              >
                <SField label="DESTINATION / CITY" style={{ flex: 2 }}>
                  <input
                    value={hotelForm.city}
                    onChange={(e) =>
                      setHotelForm((v) => ({ ...v, city: e.target.value }))
                    }
                    placeholder="e.g. Chennai, Tamil Nadu, India"
                    style={inputSt}
                  />
                </SField>
                <SField label="CHECK-IN" style={{ flex: 1 }}>
                  <input
                    type="date"
                    value={hotelForm.checkIn}
                    onChange={(e) =>
                      setHotelForm((v) => ({ ...v, checkIn: e.target.value }))
                    }
                    style={inputSt}
                  />
                </SField>
                <SField
                  label="NIGHTS"
                  style={{ flex: "0 0 64px", textAlign: "center" }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      color: C.accent,
                      textAlign: "center",
                    }}
                  >
                    {hotelForm.checkIn && hotelForm.checkOut
                      ? Math.max(
                          1,
                          Math.ceil(
                            (new Date(hotelForm.checkOut) -
                              new Date(hotelForm.checkIn)) /
                              (1000 * 60 * 60 * 24),
                          ),
                        )
                      : "—"}
                  </div>
                </SField>
                <SField label="CHECK-OUT" style={{ flex: 1 }}>
                  <input
                    type="date"
                    value={hotelForm.checkOut}
                    onChange={(e) =>
                      setHotelForm((v) => ({ ...v, checkOut: e.target.value }))
                    }
                    style={inputSt}
                  />
                </SField>
                <SField label="ROOMS & GUESTS" style={{ flex: 1 }}>
                  <div
                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                  >
                    <input
                      value={hotelForm.rooms}
                      onChange={(e) =>
                        setHotelForm((v) => ({ ...v, rooms: e.target.value }))
                      }
                      style={{ ...inputSt, width: 22 }}
                      placeholder="1"
                    />
                    <span style={{ color: C.sub, fontSize: 12 }}>Room /</span>
                    <input
                      value={hotelForm.guests}
                      onChange={(e) =>
                        setHotelForm((v) => ({ ...v, guests: e.target.value }))
                      }
                      style={{ ...inputSt, width: 22 }}
                      placeholder="1"
                    />
                    <span style={{ color: C.sub, fontSize: 12 }}>Guest</span>
                  </div>
                </SField>
                <div
                  style={{ display: "flex", alignItems: "center", padding: 6 }}
                >
                  <button
                    onClick={hotelSearch}
                    disabled={searching}
                    style={{
                      background: searching
                        ? C.muted
                        : `linear-gradient(135deg,${C.accent},#9B6BFF)`,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "0 28px",
                      height: "100%",
                      minWidth: 110,
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: searching ? "wait" : "pointer",
                      boxShadow: `0 4px 18px ${C.accentGlow}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {searching ? <DotLoader /> : "🔍 Search"}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Trip type + Booking for */}
          {modeTab !== "Hotel" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  background: C.bg,
                  borderRadius: 10,
                  padding: 4,
                }}
              >
                {["one-way", "round-trip", "multi-city"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTripType(t)}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      background:
                        tripType === t
                          ? `linear-gradient(135deg,${C.accent},#9B6BFF)`
                          : "transparent",
                      color: tripType === t ? "#fff" : C.muted,
                      transition: "all .2s",
                      boxShadow:
                        tripType === t ? `0 2px 10px ${C.accentGlow}` : "none",
                      textTransform: "capitalize",
                    }}
                  >
                    {t.replace("-", " ")}
                  </button>
                ))}
              </div>

              {/* ── Booking For — Flight requests only ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.muted }}>
                  Booking for:
                </span>
                {flightPending.length === 0 ? (
                  <span
                    style={{
                      fontSize: 12,
                      color: C.amber,
                      padding: "8px 14px",
                      background: `${C.amber}12`,
                      borderRadius: 8,
                      border: `1px solid ${C.amber}30`,
                    }}
                  >
                    ⚠ No approved flight requests
                  </span>
                ) : (
                  <select
                    value={form.requestId}
                    onChange={(e) => {
                      const r = flightPending.find(
                        (x) => x.id === e.target.value,
                      );
                      if (r)
                        setForm((v) => ({
                          ...v,
                          requestId: r.id,
                          origin: r.from_location || "",
                          destination: r.to_location || "",
                          date: r.start_date?.slice(0, 10) || "",
                        }));
                      else setForm((v) => ({ ...v, requestId: "" }));
                    }}
                    style={{
                      background: C.bg,
                      border: `1px solid ${C.cardBorder}`,
                      borderRadius: 8,
                      color: C.text,
                      padding: "9px 14px",
                      fontSize: 12,
                      outline: "none",
                      maxWidth: 320,
                      cursor: "pointer",
                    }}
                  >
                    <option value="">— Select approved flight request —</option>
                    {flightPending.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.user_name} · {r.from_location} → {r.to_location}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Search fields row — Flight/other modes */}
          {modeTab !== "Hotel" && (
            <div
              style={{
                display: "flex",
                gap: 2,
                background: C.bg,
                borderRadius: 14,
                padding: 4,
                alignItems: "stretch",
                minHeight: 72,
              }}
            >
              <SField label="FROM" style={{ flex: 1.4 }}>
                <input
                  value={form.origin}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, origin: e.target.value }))
                  }
                  placeholder="City or Airport"
                  style={inputSt}
                />
                {form.origin && (
                  <div style={{ fontSize: 10, color: C.accent, marginTop: 3 }}>
                    {form.origin.match(/\((\w+)\)/)?.[1] ||
                      form.origin.slice(0, 3).toUpperCase()}
                  </div>
                )}
              </SField>

              {/* Swap */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 2px",
                }}
              >
                <button
                  onClick={() =>
                    setForm((v) => ({
                      ...v,
                      origin: v.destination,
                      destination: v.origin,
                    }))
                  }
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: C.card,
                    border: `1px solid ${C.cardBorder}`,
                    color: C.accent,
                    cursor: "pointer",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "transform .3s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.transform = "rotate(180deg)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = "rotate(0deg)")
                  }
                >
                  ⇄
                </button>
              </div>

              <SField label="TO" style={{ flex: 1.4 }}>
                <input
                  value={form.destination}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, destination: e.target.value }))
                  }
                  placeholder="City or Airport"
                  style={inputSt}
                />
                {form.destination && (
                  <div style={{ fontSize: 10, color: C.accent, marginTop: 3 }}>
                    {form.destination.match(/\((\w+)\)/)?.[1] ||
                      form.destination.slice(0, 3).toUpperCase()}
                  </div>
                )}
              </SField>

              <SField label="DEPART DATE" style={{ flex: 1 }}>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, date: e.target.value }))
                  }
                  style={inputSt}
                />
              </SField>

              {tripType === "round-trip" && (
                <SField label="RETURN DATE" style={{ flex: 1 }}>
                  <input
                    type="date"
                    value={form.returnDate}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, returnDate: e.target.value }))
                    }
                    style={inputSt}
                  />
                </SField>
              )}

              <SField label="TRAVELLERS & CLASS" style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={form.pax}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, pax: e.target.value }))
                    }
                    style={{ ...inputSt, width: 22 }}
                    placeholder="1"
                  />
                  <select
                    value={form.cls}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, cls: e.target.value }))
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: C.text,
                      fontSize: 13,
                      fontWeight: 600,
                      outline: "none",
                      flex: 1,
                      cursor: "pointer",
                    }}
                  >
                    <option>Economy</option>
                    <option>Business</option>
                    <option>Premium Economy</option>
                    <option>First Class</option>
                  </select>
                </div>
              </SField>

              <div
                style={{ display: "flex", alignItems: "center", padding: 6 }}
              >
                <button
                  onClick={search}
                  disabled={searching}
                  style={{
                    background: searching
                      ? C.muted
                      : `linear-gradient(135deg,${C.accent},#9B6BFF)`,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "0 28px",
                    height: "100%",
                    minWidth: 110,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: searching ? "wait" : "pointer",
                    boxShadow: `0 4px 18px ${C.accentGlow}`,
                    transition: "all .2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {searching ? <DotLoader /> : "🔍 Search"}
                </button>
                {modeTab === 'Flight' && (
                  <button
                    onClick={fetchLowFare}
                    disabled={lowFareLoading}
                    style={{
                      background: 'none', border: `1px solid ${C.accent}40`, borderRadius: 10,
                      padding: '0 16px', height: '100%', minWidth: 90, fontSize: 12,
                      fontWeight: 700, color: C.accent, cursor: lowFareLoading ? 'wait' : 'pointer',
                      marginLeft: 8, transition: 'all .2s',
                    }}
                  >
                    {lowFareLoading ? '⏳' : '📅 Low Fares'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── Dashboard Grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <GlassCard style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              ✈ Pending Flight Bookings
            </div>
            <Tag color={flightPending.length > 0 ? C.amber : C.muted}>
              {flightPending.length} Pending
            </Tag>
          </div>
          {flightPending.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "28px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No approved flight requests awaiting booking
            </div>
          ) : (
            flightPending.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "13px 0",
                  borderBottom: `1px solid ${C.divider}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {r.user_name}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                    ✈ {r.from_location} → {r.to_location}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {r.start_date?.slice(0, 10)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setModeTab("Flight");
                    setForm((v) => ({
                      ...v,
                      requestId: r.id,
                      origin: r.from_location || "",
                      destination: r.to_location || "",
                      date: r.start_date?.slice(0, 10) || "",
                    }));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  style={{
                    background: C.accentSoft,
                    color: C.accent,
                    border: `1px solid ${C.accent}30`,
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Book →
                </button>
              </div>
            ))
          )}
        </GlassCard>

        <GlassCard style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              🏨 Pending Hotel Bookings
            </div>
            <Tag color={hotelPending.length > 0 ? C.amber : C.muted}>
              {hotelPending.length} Pending
            </Tag>
          </div>
          {hotelPending.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "28px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No approved hotel requests awaiting booking
            </div>
          ) : (
            hotelPending.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "13px 0",
                  borderBottom: `1px solid ${C.divider}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {r.user_name}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                    🏨 {r.to_location}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {r.start_date?.slice(0, 10)} → {r.end_date?.slice(0, 10)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setModeTab("Hotel");
                    setHotelForm((v) => ({
                      ...v,
                      requestId: r.id,
                      city: r.to_location || "",
                      checkIn: r.start_date?.slice(0, 10) || "",
                      checkOut: r.end_date?.slice(0, 10) || "",
                    }));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  style={{
                    background: C.accentSoft,
                    color: C.accent,
                    border: `1px solid ${C.accent}30`,
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Book →
                </button>
              </div>
            ))
          )}
        </GlassCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
        <GlassCard style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              📋 Recent Bookings
            </div>
            <Tag color={C.green}>{history.length}</Tag>
          </div>
          {history.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "28px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No bookings yet
            </div>
          ) : (
            history.slice(0, 5).map((h) => (
              <div
                key={h.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "11px 0",
                  borderBottom: `1px solid ${C.divider}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    {h.booked_for_name || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                    {h.from_location} → {h.to_location}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                    {new Date(h.created_at).toLocaleDateString("en-IN")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    ₹{Number(h.amount || 0).toLocaleString("en-IN")}
                  </div>
                  <Tag color={C.green} style={{ marginTop: 4 }}>
                    {(h.status || "confirmed").toUpperCase()}
                  </Tag>
                </div>
              </div>
            ))
          )}
        </GlassCard>
      </div>

      {/* ── Booking Management Section (APIs 10-16, 17) ── */}
      {modeTab === 'Flight' && (
        <GlassCard style={{ marginTop: 28, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>✈ Booking Management</div>
              <div style={{ fontSize: 11, color: C.sub }}>Reprint, history, cancellation & post-booking services</div>
            </div>
          </div>
          {/* Tab buttons */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.cardBorder}`, padding: '0 24px' }}>
            {[
              { id: 'held', icon: '🔒', label: `Held Flights${heldFlights.filter(h => h.status === 'Held').length ? ` (${heldFlights.filter(h => h.status === 'Held').length})` : ''}` },
              { id: 'reprint', icon: '🔄', label: 'Reprint' },
              { id: 'history', icon: '📋', label: 'History' },
              { id: 'cancel', icon: '❌', label: 'Cancel' },
              { id: 'postssr', icon: '🍽', label: 'Add Services' },
              { id: 'balance', icon: '💰', label: 'Agency Balance' },
            ].map(t => (
              <button key={t.id} onClick={() => setMgmtPanel(mgmtPanel === t.id ? null : t.id)} style={{
                padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: mgmtPanel === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
                color: mgmtPanel === t.id ? C.accent : C.muted, fontSize: 12, fontWeight: mgmtPanel === t.id ? 700 : 400,
                transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ padding: 24 }}>
            {/* Held Flights — Hold & Pay Later */}
            {mgmtPanel === 'held' && (
              <div>
                {heldFlights.length === 0 ? (
                  <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 30 }}>
                    No held flights. Use the <strong>"🔒 Hold & Pay Later"</strong> button on a fare card to hold a flight.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {heldFlights.map((h, i) => {
                      const isActive = h.status === 'Held';
                      const isTicketed = h.status === 'Ticketed';
                      const isReleased = h.status === 'Released';
                      const statusColor = isTicketed ? C.green : isReleased ? C.red : C.amber;
                      return (
                        <div key={i} style={{
                          background: C.bg, borderRadius: 12, padding: 16,
                          border: `1px solid ${isActive ? C.amber + '40' : C.divider}`,
                          opacity: isActive ? 1 : 0.6,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                                {h.flight.airline} · {h.flight.flightNumber}
                              </div>
                              <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                                {h.flight.origin} → {h.flight.destination} · {h.flight.departureTime} → {h.flight.arrivalTime}
                              </div>
                              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                                For: {h.employeeName} · {h.fare.type} · ₹{h.totalAmount?.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {h.status}
                              </div>
                              <div style={{ fontSize: 15, fontWeight: 900, color: C.amber, marginTop: 4 }}>
                                {h.bookingRefNo || '—'}
                              </div>
                              {h.airlinePnr && (
                                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>PNR: {h.airlinePnr}</div>
                              )}
                            </div>
                          </div>
                          {h.blockedExpiry && isActive && (
                            <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 10 }}>
                              ⏳ Hold expires: {h.blockedExpiry}
                            </div>
                          )}
                          {isActive && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => payAndTicketHeld(h)}
                                disabled={payingHeld === h.bookingRefNo}
                                style={{
                                  flex: 1, background: `linear-gradient(135deg, ${C.green}, #50E878)`, color: '#0B0B14',
                                  border: 'none', padding: '10px 0', borderRadius: 8, fontWeight: 700,
                                  cursor: payingHeld ? 'wait' : 'pointer', fontSize: 12,
                                  opacity: payingHeld === h.bookingRefNo ? 0.6 : 1,
                                }}
                              >
                                {payingHeld === h.bookingRefNo ? '⏳ Processing...' : '💳 Pay & Issue Ticket'}
                              </button>
                              <button
                                onClick={() => checkHeldStatus(h)}
                                style={{
                                  background: C.bg, color: C.accent, border: `1px solid ${C.accent}40`,
                                  padding: '10px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 11,
                                }}
                              >
                                🔍 Status
                              </button>
                              <button
                                onClick={() => releaseHeld(h)}
                                style={{
                                  background: `${C.red}15`, color: C.red, border: `1px solid ${C.red}40`,
                                  padding: '10px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 11,
                                }}
                              >
                                ✕ Release
                              </button>
                            </div>
                          )}
                          {isTicketed && h.ticketResult && (
                            <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginTop: 8 }}>
                              ✅ Ticketed — PNR: {h.ticketResult.ticket?.airlinePnr || h.airlinePnr}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Reprint (API 10) + Release (API 13) */}
            {mgmtPanel === 'reprint' && (() => {
              const RefInput = () => {
                const [refNo, setRefNo] = useState('');
                const [pnr, setPnr] = useState('');
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Booking Ref No" style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <input value={pnr} onChange={e => setPnr(e.target.value)} placeholder="Airline PNR (optional)" style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <button onClick={() => fetchReprint(refNo, pnr)} disabled={reprintLoading} style={{ background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        {reprintLoading ? '⏳' : '🔍 Fetch'}
                      </button>
                    </div>
                    {reprintData && (
                      <div style={{ background: C.bg, borderRadius: 12, padding: 16, border: `1px solid ${C.divider}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 12, color: C.sub }}>Booking Ref</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{reprintData.bookingRefNo || '—'}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, color: C.sub }}>Airline PNR</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>{reprintData.airlinePnr || '—'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: C.sub, marginBottom: 12 }}>
                          <span>Status: <strong style={{ color: C.text }}>{reprintData.status}</strong></span>
                          <span>Amount: <strong style={{ color: C.text }}>₹{reprintData.totalAmount?.toLocaleString('en-IN') || '—'}</strong></span>
                          {reprintData.blockedExpiry && <span>Expiry: <strong style={{ color: C.amber }}>{reprintData.blockedExpiry}</strong></span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => executeReleasePnr(reprintData.bookingRefNo, reprintData.airlinePnr)} style={{ background: `${C.red}20`, color: C.red, border: `1px solid ${C.red}40`, padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 11 }}>Release PNR</button>
                        </div>
                        <pre style={{ marginTop: 12, fontSize: 10, color: C.muted, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(reprintData.raw, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              };
              return <RefInput />;
            })()}

            {/* History (API 11) */}
            {mgmtPanel === 'history' && (() => {
              const HistPanel = () => {
                const [from, setFrom] = useState('');
                const [to, setTo] = useState('');
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <button onClick={() => {
                        const fmtD = d => { const p = d.split('-'); return `${p[1]}/${p[2]}/${p[0]}`; };
                        fetchAirHistory(fmtD(from), fmtD(to));
                      }} disabled={airHistoryLoading} style={{ background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        {airHistoryLoading ? '⏳' : '📋 Fetch'}
                      </button>
                    </div>
                    {airHistory && (
                      <div style={{ background: C.bg, borderRadius: 12, padding: 16, border: `1px solid ${C.divider}`, maxHeight: 400, overflow: 'auto' }}>
                        <pre style={{ fontSize: 11, color: C.text, whiteSpace: 'pre-wrap' }}>{JSON.stringify(airHistory, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              };
              return <HistPanel />;
            })()}

            {/* Cancel (API 12) */}
            {mgmtPanel === 'cancel' && (() => {
              const CancelPanel = () => {
                const [refNo, setRefNo] = useState('');
                const [pnr, setPnr] = useState('');
                const [remarks, setRemarks] = useState('');
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Booking Ref No" style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <input value={pnr} onChange={e => setPnr(e.target.value)} placeholder="Airline PNR" style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                    </div>
                    <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Cancellation remarks (optional)" style={{ width: '100%', background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
                    <button onClick={() => executeCancellation(refNo, pnr, [], remarks)} style={{ background: `linear-gradient(135deg,${C.red},#FF6B6B)`, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                      ❌ Submit Cancellation
                    </button>
                    {cancelResult && (
                      <div style={{ marginTop: 16, background: C.bg, borderRadius: 12, padding: 16, border: `1px solid ${C.divider}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8 }}>Cancellation submitted</div>
                        <div style={{ fontSize: 12, color: C.sub }}>Ref: {cancelResult.bookingRefNo} · Status: {cancelResult.status}</div>
                      </div>
                    )}
                  </div>
                );
              };
              return <CancelPanel />;
            })()}

            {/* Post-Booking SSR (APIs 14-16) */}
            {mgmtPanel === 'postssr' && (() => {
              const PostSSRPanel = () => {
                const [refNo, setRefNo] = useState('');
                const [pnr, setPnr] = useState('');
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Booking Ref No" style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <input value={pnr} onChange={e => setPnr(e.target.value)} placeholder="Airline PNR (optional)" style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <button onClick={() => fetchPostSSR(refNo, pnr)} disabled={postSSRLoading} style={{ background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        {postSSRLoading ? '⏳' : '🍽 Load Services'}
                      </button>
                    </div>
                    {postSSRData && (
                      <div>
                        {postSSRData.ssrs.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {postSSRData.ssrs.map(s => {
                              const sel = selectedPostSSRs.includes(s.ssrKey);
                              return (
                                <div key={s.ssrKey} onClick={() => setSelectedPostSSRs(prev => sel ? prev.filter(k => k !== s.ssrKey) : [...prev, s.ssrKey])} style={{
                                  background: sel ? `${C.accent}15` : C.bg, border: `1px solid ${sel ? C.accent : C.divider}`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.desc || s.code}</div>
                                    <div style={{ fontSize: 11, color: C.sub }}>{s.type}</div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>₹{s.price?.toLocaleString('en-IN')}</span>
                                    <span style={{ fontSize: 16, color: sel ? C.accent : C.muted }}>{sel ? '☑' : '☐'}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {selectedPostSSRs.length > 0 && (
                              <button onClick={confirmPostSSR} style={{ marginTop: 12, background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none', padding: '12px 0', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                                Confirm {selectedPostSSRs.length} Service(s) & Pay
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 20 }}>No post-booking services available.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              };
              return <PostSSRPanel />;
            })()}

            {/* Agency Balance (API 17) */}
            {mgmtPanel === 'balance' && (() => {
              const BalPanel = () => {
                const [refNo, setRefNo] = useState('');
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Booking Ref No" style={{ flex: 1, background: C.bg, border: `1px solid ${C.divider}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 13, outline: 'none' }} />
                      <button onClick={() => fetchAgencyBalance(refNo)} style={{ background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        💰 Check Balance
                      </button>
                    </div>
                    {agencyBalance && (
                      <div style={{ background: C.bg, borderRadius: 12, padding: 20, border: `1px solid ${C.green}30`, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>Agency Wallet Balance</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: C.green }}>₹{agencyBalance.balance?.toLocaleString('en-IN') || '0'}</div>
                        <div style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>{agencyBalance.currency || 'INR'}</div>
                      </div>
                    )}
                  </div>
                );
              };
              return <BalPanel />;
            })()}

            {!mgmtPanel && (
              <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 20 }}>
                Select a tab above to manage bookings
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

/* ── Sub-components ── */
function SField({ label, children, style = {} }) {
  return (
    <div
      style={{
        flex: 1,
        background: "#151524",
        borderRadius: 10,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 5,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: C.muted,
          fontWeight: 700,
          letterSpacing: "1px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
function FSection({ title, children, last = false }) {
  return (
    <div
      style={{
        marginBottom: last ? 0 : 18,
        paddingBottom: last ? 0 : 18,
        borderBottom: last ? "none" : `1px solid ${C.divider}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.muted,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
function Row({ label, val }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span style={{ color: C.text }}>{val}</span>
    </div>
  );
}
function ErrBar({ children }) {
  return (
    <div
      style={{
        background: "#FF453A14",
        border: "1px solid #FF453A30",
        borderRadius: 10,
        padding: "12px 16px",
        color: C.red,
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}
