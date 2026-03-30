import { useState, useEffect, useCallback, useMemo } from 'react'
import { bookingsAPI, flightsAPI, adminBookingsAPI, hotelsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import TicketCard from '../booking/TicketCard'

/* ─── Color tokens ─── */
const C = {
  bg: '#0B0B14', card: '#12121E', cardBorder: '#1E1E30', cardHover: '#171728',
  accent: '#7C6FFF', accentGlow: 'rgba(124,111,255,0.18)', accentSoft: 'rgba(124,111,255,0.08)',
  green: '#30D158', amber: '#FF9F0A', red: '#FF453A',
  text: '#F0F0F6', sub: '#9090A8', muted: '#454560', divider: '#1C1C2E',
}

const MODES = [
  { id: 'Flight', icon: '✈️', label: 'Flights' },
  { id: 'Hotel', icon: '🏨', label: 'Hotels' },
  { id: 'Train', icon: '🚆', label: 'Trains' },
  { id: 'Bus', icon: '🚌', label: 'Buses' },
  { id: 'Cab', icon: '🚕', label: 'Cabs' },
  { id: 'Visa', icon: '📋', label: 'Visa' },
]

const AIRLINE_META = {
  'IndiGo': { grad: ['#1A1FCC', '#5C60F5'], abbr: '6E' },
  'Air India': { grad: ['#8B0000', '#CC2929'], abbr: 'AI' },
  'Vistara': { grad: ['#4B006E', '#9B1FCC'], abbr: 'UK' },
  'Akasa Air': { grad: ['#BB4100', '#FF6B00'], abbr: 'QP' },
}

const DotLoader = () => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: 7, height: 7, borderRadius: '50%', background: C.accent,
        animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`
      }} />
    ))}
  </div>
)

const Tag = ({ children, color = C.accent }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', padding: '3px 8px', borderRadius: 20,
    background: `${color}18`, color, border: `1px solid ${color}30`, textTransform: 'uppercase'
  }}>
    {children}
  </span>
)

const GlassCard = ({ children, style = {} }) => (
  <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, ...style }}>
    {children}
  </div>
)

const inputSt = { background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 15, fontWeight: 600, width: '100%', padding: 0 }

const GLOBAL_CSS = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes dot-pulse{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.1);opacity:1}}
  *{box-sizing:border-box}
  input[type=date]::-webkit-calendar-picker-indicator{ filter:invert(1) opacity(0.4); cursor:pointer }
  input[type=range]{ -webkit-appearance:none; appearance:none; width:100%; height:4px; background:transparent; outline:none }
  input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:${C.accent}; border:2px solid ${C.bg}; box-shadow:0 0 8px ${C.accent}; cursor:pointer }
  input[type=range]::-webkit-slider-runnable-track{ height:4px; border-radius:2px; background:linear-gradient(90deg,${C.accent},#9B6BFF) }
  select option{ background:#12121E; color:#F0F0F6 }
`

/* ─── Depart time buckets ─── */
const TIME_SLOTS = [
  { id: '00-06', icon: '🌙', label: 'Early', from: 0, to: 6 },
  { id: '06-12', icon: '🌅', label: 'Morning', from: 6, to: 12 },
  { id: '12-18', icon: '☀️', label: 'Afternoon', from: 12, to: 18 },
  { id: '18-24', icon: '🌆', label: 'Evening', from: 18, to: 24 },
]

function getHour(timeStr) {
  if (!timeStr) return 0
  const t = timeStr.match(/(\d+):(\d+)/)
  if (!t) return 0
  let h = parseInt(t[1])
  if (timeStr.toLowerCase().includes('pm') && h !== 12) h += 12
  if (timeStr.toLowerCase().includes('am') && h === 12) h = 0
  return h
}

/* ═══════════════════════════════════════════ */
export default function BookingPanel() {
  const { user } = useAuth()
  const [modeTab, setModeTab] = useState('Flight')
  const [tripType, setTripType] = useState('one-way')
  const [form, setForm] = useState({ requestId: '', origin: '', destination: '', date: '', returnDate: '', pax: '1', cls: 'Economy' })
  const [allPending, setAllPending] = useState([])   // all approved requests
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [rawResults, setRawResults] = useState(null)  // null = search page, [] = results page
  const [expanded, setExpanded] = useState(null)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(null)
  const [err, setErr] = useState('')
  // Wallet confirmation modal
  const [confirmData, setConfirmData] = useState(null) // { flight, fare, wallet }

  /* ─── Hotel state ─── */
  const [hotelForm, setHotelForm] = useState({ requestId: '', city: '', checkIn: '', checkOut: '', rooms: '1', guests: '1' })
  const [hotelResults, setHotelResults] = useState(null)  // null = search page
  const [hotelConfirm, setHotelConfirm] = useState(null)  // { hotel, req }
  const [hotelBooking, setHotelBooking] = useState(false)
  const [hotelBooked, setHotelBooked] = useState(null)
  // Hotel filters
  const [hFilterName, setHFilterName] = useState('')
  const [hFilterMinPrice, setHFilterMinPrice] = useState('')
  const [hFilterMaxPrice, setHFilterMaxPrice] = useState('')
  const [hFilterStars, setHFilterStars] = useState([])
  const [hFilterLocations, setHFilterLocations] = useState([])
  const [hFilterAmenities, setHFilterAmenities] = useState([])
  const [hSortBy, setHSortBy] = useState('price_asc')
  const [hAmenitySearch, setHAmenitySearch] = useState('')

  /* ─── Filter state ─── */
  const [filterAirlines, setFilterAirlines] = useState([])   // [] = all checked
  const [filterMaxPrice, setFilterMaxPrice] = useState(null)
  const [filterStops, setFilterStops] = useState([])   // [] = all
  const [filterTimes, setFilterTimes] = useState([])   // [] = all
  const [filterRefund, setFilterRefund] = useState(false)

  /* ─── Only show Flight-mode approved requests ─── */
  const flightPending = useMemo(() =>
    allPending.filter(r => r.travel_mode?.toLowerCase() === 'flight')
    , [allPending])

  /* ─── Only show Hotel-mode approved requests ─── */
  const hotelPending = useMemo(() =>
    allPending.filter(r => r.travel_mode?.toLowerCase() === 'hotel')
    , [allPending])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, h] = await Promise.all([bookingsAPI.pending(), bookingsAPI.history()])
      const pr = p.data || []
      setAllPending(pr)
      setHistory(h.data || [])
      // Auto-select first flight request
      const firstFlight = pr.find(r => r.travel_mode?.toLowerCase() === 'flight')
      if (firstFlight && !form.requestId) {
        setForm(v => ({
          ...v, requestId: firstFlight.id, origin: firstFlight.from_location || '',
          destination: firstFlight.to_location || '', date: firstFlight.start_date?.slice(0, 10) || ''
        }))
      }
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  /* ─── Apply filters to raw results ─── */
  const results = useMemo(() => {
    if (!rawResults) return null
    let list = [...rawResults]

    // Airlines
    if (filterAirlines.length > 0)
      list = list.filter(f => filterAirlines.includes(f.airline))

    // Max price
    if (filterMaxPrice != null)
      list = list.filter(f => f.price <= filterMaxPrice)

    // Stops
    if (filterStops.length > 0)
      list = list.filter(f => filterStops.includes(f.stops))

    // Depart time slots
    if (filterTimes.length > 0)
      list = list.filter(f => {
        const h = getHour(f.departureTime)
        return filterTimes.some(slotId => {
          const slot = TIME_SLOTS.find(s => s.id === slotId)
          return slot && h >= slot.from && h < slot.to
        })
      })

    // Refundable only (mock: all are refundable, so this is a pass-through)
    // if (filterRefund) list = list.filter(f=>f.refundable !== false)

    return list
  }, [rawResults, filterAirlines, filterMaxPrice, filterStops, filterTimes, filterRefund])

  /* ─── Toggle helpers ─── */
  const toggleAirline = name => setFilterAirlines(prev =>
    prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])

  const toggleStop = n => setFilterStops(prev =>
    prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])

  const toggleTime = id => setFilterTimes(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  /* ─── Hotel search ─── */
  const hotelSearch = async () => {
    if (!hotelForm.city || !hotelForm.checkIn || !hotelForm.checkOut)
      return setErr('Fill City, Check-In and Check-Out dates.')
    if (!hotelForm.requestId) return setErr('Select an approved hotel request from "Booking for" first.')
    setErr(''); setSearching(true); setHotelResults(null); setHotelBooked(null)
    setHFilterName(''); setHFilterMinPrice(''); setHFilterMaxPrice('')
    setHFilterStars([]); setHFilterLocations([]); setHFilterAmenities([]); setHSortBy('price_asc')
    try {
      const r = await hotelsAPI.search({ city: hotelForm.city, checkIn: hotelForm.checkIn, checkOut: hotelForm.checkOut, rooms: hotelForm.rooms, guests: hotelForm.guests })
      setHotelResults(r.data || [])
    } catch (e) { setErr(e.message) }
    finally { setSearching(false) }
  }

  /* ─── Hotel filtered+sorted results ─── */
  const hotelFiltered = useMemo(() => {
    if (!hotelResults) return null
    let list = [...hotelResults]
    if (hFilterName) list = list.filter(h => h.name.toLowerCase().includes(hFilterName.toLowerCase()))
    if (hFilterMinPrice) list = list.filter(h => h.pricePerNight >= Number(hFilterMinPrice))
    if (hFilterMaxPrice) list = list.filter(h => h.pricePerNight <= Number(hFilterMaxPrice))
    if (hFilterStars.length) list = list.filter(h => hFilterStars.includes(h.stars))
    if (hFilterLocations.length) list = list.filter(h => hFilterLocations.includes(h.location))
    if (hFilterAmenities.length) list = list.filter(h => hFilterAmenities.every(a => h.amenities.includes(a)))
    if (hSortBy === 'price_asc')  list.sort((a, b) => a.pricePerNight - b.pricePerNight)
    if (hSortBy === 'price_desc') list.sort((a, b) => b.pricePerNight - a.pricePerNight)
    if (hSortBy === 'stars_desc') list.sort((a, b) => b.stars - a.stars)
    if (hSortBy === 'stars_asc')  list.sort((a, b) => a.stars - b.stars)
    return list
  }, [hotelResults, hFilterName, hFilterMinPrice, hFilterMaxPrice, hFilterStars, hFilterLocations, hFilterAmenities, hSortBy])

  /* ─── Hotel confirm + book ─── */
  const initiateHotelBook = (hotel) => {
    const req = hotelPending.find(r => r.id === hotelForm.requestId)
    if (!req) return setErr('Linked hotel request not found.')
    setHotelConfirm({ hotel, req, walletBal: Number(req.wallet_balance ?? 0) })
  }

  const confirmHotelBook = async () => {
    if (!hotelConfirm) return
    setHotelBooking(true); setErr('')
    try {
      const r = await hotelsAPI.bookHotel({
        requestId: hotelConfirm.req.id,
        hotel: hotelConfirm.hotel,
        checkIn: hotelForm.checkIn,
        checkOut: hotelForm.checkOut,
        rooms: hotelForm.rooms,
        totalPrice: hotelConfirm.hotel.totalPrice,
      })
      setHotelBooked(r.data?.ticket)
      setHotelConfirm(null)
      setHotelResults(null)
      load()
    } catch (e) {
      setHotelConfirm(null)
      setErr(e.message || 'Hotel booking failed')
    } finally { setHotelBooking(false) }
  }

  /* ─── Search ─── */
  const search = async () => {
    if (!form.origin || !form.destination || !form.date) return setErr('Fill Origin, Destination and Date.')
    if (modeTab !== 'Flight') return setErr(`${modeTab} search coming soon — try Flights!`)
    setErr(''); setSearching(true); setRawResults(null); setExpanded(null); setBooked(null)
    // Reset filters
    setFilterAirlines([]); setFilterMaxPrice(null); setFilterStops([]); setFilterTimes([]); setFilterRefund(false)
    try {
      const r = await flightsAPI.search({
        source: form.origin, destination: form.destination, date: form.date,
        passengers: parseInt(form.pax) || 1, travelClass: form.cls
      })
      setRawResults(r.data)
      // init price slider to max
      if (r.data?.length) setFilterMaxPrice(Math.max(...r.data.map(f => f.price)))
    } catch (e) { setErr(e.message) }
    finally { setSearching(false) }
  }

  /* ─── Pre-book: show confirmation modal using wallet_balance from pending request ─── */
  const initiateBook = (flight, fare) => {
    if (!form.requestId) return setErr('Please select an approved flight request from "Booking for" first.')
    setErr('')
    const req = flightPending.find(r => r.id === form.requestId)
    if (!req) return setErr('Linked request not found. Please re-select.')
    // wallet_balance comes directly from /bookings/pending query (no extra API call needed)
    const walletBal = Number(req.wallet_balance ?? req.walletBalance ?? null)
    setConfirmData({ flight, fare, walletBal: isNaN(walletBal) ? null : walletBal, employeeName: req.user_name })
  }

  /* ─── Confirm & execute booking ─── */
  const confirmBook = async () => {
    if (!confirmData) return
    const { flight, fare } = confirmData
    setBooking(true); setErr('')
    try {
      const r = await flightsAPI.bookTicket({
        requestId: form.requestId, selectedFlight: flight, fareType: fare.type, price: fare.price
      })
      setBooked(r.data?.ticket)
      setConfirmData(null)
      setRawResults(null); setExpanded(null)
      load()
    } catch (e) {
      setConfirmData(null)
      // 402 = insufficient balance — backend returns structured data
      if (e.status === 402) {
        setErr(`Insufficient balance for ${confirmData?.employeeName}. Wallet has ₹${Number(e?.data?.currentBalance || 0).toLocaleString('en-IN')}, fare is ₹${Number(fare.price).toLocaleString('en-IN')} (shortfall ₹${Number(e?.data?.shortfall || 0).toLocaleString('en-IN')})`)
      } else {
        setErr(e.message || 'Booking failed')
      }
    } finally { setBooking(false) }
  }


  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 16 }}>
      <DotLoader />
      <span style={{ color: C.sub, fontSize: 13 }}>Loading…</span>
    </div>
  )

  /* ──── WALLET CONFIRMATION MODAL (flight) ──── */
  if (confirmData) {
    const { flight, fare, walletBal, employeeName } = confirmData
    const remaining = walletBal != null ? walletBal - fare.price : null
    const sufficient = remaining == null || remaining >= 0
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', animation: 'fadeUp .2s ease'
      }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{
          background: C.card, border: `1px solid ${sufficient ? C.cardBorder : C.red}`, borderRadius: 20,
          padding: 36, width: 460, boxShadow: `0 24px 80px rgba(0,0,0,.6)`
        }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Booking Confirmation</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Book flight for {employeeName}</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{flight.airline} · {flight.flightNumber}</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{flight.departureTime} → {flight.arrivalTime} · {flight.duration}</div>
              </div>
              <Tag color={flight.stops === 0 ? C.green : C.amber}>{flight.stopsLabel || (flight.stops === 0 ? 'Non-Stop' : '1 Stop')}</Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.sub, paddingTop: 10, borderTop: `1px solid ${C.divider}` }}>
              <span>Fare Type</span><span style={{ color: C.text, fontWeight: 600 }}>{fare.type}</span>
            </div>
          </div>
          <div style={{ borderRadius: 12, border: `1px solid ${C.divider}`, overflow: 'hidden', marginBottom: 22 }}>
            <div style={{ padding: '13px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.divider}` }}>
              <span style={{ fontSize: 13, color: C.sub }}>Employee Wallet Balance</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: walletBal != null ? (sufficient ? C.green : C.red) : C.sub }}>
                {walletBal != null ? `₹${walletBal.toLocaleString('en-IN')}` : 'Checking…'}
              </span>
            </div>
            <div style={{ padding: '13px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.divider}`, background: `${C.accent}08` }}>
              <span style={{ fontSize: 13, color: C.sub }}>Flight Fare ({fare.type})</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>— ₹{fare.price.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ padding: '13px 16px', display: 'flex', justifyContent: 'space-between', background: sufficient ? '#30D15812' : '#FF453A12' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: sufficient ? C.green : C.red }}>Balance After Booking</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: sufficient ? C.green : C.red }}>
                {remaining != null ? `₹${remaining.toLocaleString('en-IN')}` : '—'}
              </span>
            </div>
          </div>
          {!sufficient && walletBal != null && (
            <div style={{ background: '#FF453A14', border: '1px solid #FF453A30', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: C.red }}>
              ⚠ Insufficient balance — shortfall of ₹{Math.abs(remaining).toLocaleString('en-IN')}. Try a Saver fare.
            </div>
          )}
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 20 }}>
            ✓ Ticket will be generated and sent to {employeeName}'s employee portal immediately.
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setConfirmData(null)}
              style={{ flex: 1, background: 'transparent', border: `1px solid ${C.cardBorder}`, color: C.sub, padding: '13px 0', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
              Cancel
            </button>
            <button onClick={confirmBook} disabled={booking || !sufficient}
              style={{
                flex: 2, background: sufficient ? `linear-gradient(135deg,${C.accent},#9B6BFF)` : `${C.red}30`,
                color: sufficient ? '#fff' : C.red, border: sufficient ? 'none' : `1px solid ${C.red}40`,
                padding: '13px 0', borderRadius: 12, fontWeight: 800, cursor: booking || !sufficient ? 'default' : 'pointer',
                fontSize: 14, boxShadow: sufficient ? `0 4px 18px ${C.accentGlow}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: booking ? .6 : 1
              }}>
              {booking ? <><DotLoader /></> : sufficient ? '✈ Confirm & Book' : 'Insufficient Balance'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ──── HOTEL CONFIRM MODAL ──── */
  if (hotelConfirm) {
    const { hotel, req, walletBal } = hotelConfirm
    const remaining = walletBal - hotel.totalPrice
    const sufficient = remaining >= 0
    const nights = hotel.nights || 1
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)', animation:'fadeUp .2s ease' }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ background:C.card, border:`1px solid ${sufficient?C.cardBorder:C.red}`, borderRadius:20, padding:36, width:480, boxShadow:'0 24px 80px rgba(0,0,0,.6)' }}>
          <div style={{ fontSize:11, color:C.accent, fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:8 }}>Hotel Booking Confirmation</div>
          <div style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:20 }}>Book hotel for {req.user_name}</div>

          <div style={{ background:C.bg, borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:4 }}>{hotel.name} {'★'.repeat(hotel.stars)}</div>
            <div style={{ fontSize:12, color:C.sub }}>{hotel.address}</div>
            <div style={{ display:'flex', gap:16, marginTop:10, fontSize:12, color:C.sub }}>
              <span>📅 Check-in: <b style={{color:C.text}}>{hotelForm.checkIn}</b></span>
              <span>📅 Check-out: <b style={{color:C.text}}>{hotelForm.checkOut}</b></span>
              <span>🌙 {nights} Night{nights>1?'s':''}</span>
            </div>
          </div>

          <div style={{ borderRadius:12, border:`1px solid ${C.divider}`, overflow:'hidden', marginBottom:22 }}>
            <div style={{ padding:'13px 16px', display:'flex', justifyContent:'space-between', borderBottom:`1px solid ${C.divider}` }}>
              <span style={{ fontSize:13, color:C.sub }}>Employee Wallet Balance</span>
              <span style={{ fontSize:14, fontWeight:700, color:sufficient?C.green:C.red }}>₹{walletBal.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ padding:'13px 16px', display:'flex', justifyContent:'space-between', borderBottom:`1px solid ${C.divider}`, background:`${C.accent}08` }}>
              <span style={{ fontSize:13, color:C.sub }}>Hotel Total ({nights} Night{nights>1?'s':''})</span>
              <span style={{ fontSize:14, fontWeight:700, color:C.text }}>— ₹{hotel.totalPrice.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ padding:'13px 16px', display:'flex', justifyContent:'space-between', background:sufficient?'#30D15812':'#FF453A12' }}>
              <span style={{ fontSize:13, fontWeight:600, color:sufficient?C.green:C.red }}>Balance After Booking</span>
              <span style={{ fontSize:15, fontWeight:800, color:sufficient?C.green:C.red }}>₹{remaining.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {!sufficient && <div style={{ background:'#FF453A14', border:'1px solid #FF453A30', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:C.red }}>⚠ Insufficient balance — shortfall of ₹{Math.abs(remaining).toLocaleString('en-IN')}</div>}

          <div style={{ display:'flex', gap:12 }}>
            <button onClick={()=>setHotelConfirm(null)} style={{ flex:1, background:'transparent', border:`1px solid ${C.cardBorder}`, color:C.sub, padding:'13px 0', borderRadius:12, fontWeight:600, cursor:'pointer', fontSize:14 }}>Cancel</button>
            <button onClick={confirmHotelBook} disabled={hotelBooking||!sufficient}
              style={{ flex:2, background:sufficient?`linear-gradient(135deg,${C.accent},#9B6BFF)`:`${C.red}30`, color:sufficient?'#fff':C.red, border:sufficient?'none':`1px solid ${C.red}40`, padding:'13px 0', borderRadius:12, fontWeight:800, cursor:hotelBooking||!sufficient?'default':'pointer', fontSize:14, boxShadow:sufficient?`0 4px 18px ${C.accentGlow}`:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:hotelBooking?.6:1 }}>
              {hotelBooking?<DotLoader/>:sufficient?'🏨 Confirm & Book':'Insufficient Balance'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ──── HOTEL RESULTS VIEW ──── */
  if (hotelResults) {
    const allLocations = [...new Set(hotelResults.map(h => h.location))].sort()
    const allAmenitiesInResults = [...new Set(hotelResults.flatMap(h => h.amenities))].sort()
    const filteredAmenities = hAmenitySearch ? allAmenitiesInResults.filter(a => a.toLowerCase().includes(hAmenitySearch.toLowerCase())) : allAmenitiesInResults
    const nights = hotelResults[0]?.nights || 1
    const checkinFmt = hotelForm.checkIn ? new Date(hotelForm.checkIn+'T00:00').toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).toUpperCase() : ''
    const checkoutFmt = hotelForm.checkOut ? new Date(hotelForm.checkOut+'T00:00').toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).toUpperCase() : ''
    const policyMax = hotelPending.find(r=>r.id===hotelForm.requestId)?.max_hotel_per_night || 0

    return (
      <div style={{ fontFamily:"'Inter',sans-serif", paddingBottom:60, animation:'fadeUp .35s ease' }}>
        <style>{GLOBAL_CSS}</style>
        {err && <ErrBar>{err}</ErrBar>}
        {hotelBooked && <div style={{ background:'#30D15812', border:'1px solid #30D15830', borderRadius:10, padding:'14px 18px', marginBottom:20, color:C.green, fontWeight:700 }}>✓ Hotel Booked — Ticket sent to employee portal (PNR: {hotelBooked.pnr_number})</div>}

        {/* Summary strip */}
        <GlassCard style={{ padding:'16px 24px', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:20, fontWeight:800, color:C.text }}>{hotelForm.city.split(',')[0]}</div>
              <div style={{ fontSize:12, color:C.sub }}>{hotelForm.city.split(',').slice(1).join(',').trim() || 'India'}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:0 }}>
              {[
                { label:'Check-In', val:checkinFmt },
                { label:'Check-Out', val:checkoutFmt },
                { label:'Room & Guest', val:`${hotelForm.rooms} Room / ${hotelForm.guests} Guest` },
              ].map((item, i) => (
                <div key={i} style={{ padding:'0 20px', borderLeft:i>0?`1px solid ${C.divider}`:'none' }}>
                  <div style={{ fontSize:10, color:C.sub, marginBottom:3, textTransform:'uppercase', letterSpacing:'0.5px' }}>{item.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{item.val}</div>
                </div>
              ))}
              <div style={{ padding:'0 20px', borderLeft:`1px solid ${C.divider}`, textAlign:'center' }}>
                <div style={{ fontSize:11, color:C.sub }}>Nights</div>
                <div style={{ fontSize:22, fontWeight:900, color:C.accent, lineHeight:1 }}>{nights}</div>
              </div>
            </div>
            <button onClick={()=>{setHotelResults(null);setHotelBooked(null)}}
              style={{ background:`linear-gradient(135deg,${C.accent},#9B6BFF)`, color:'#fff', border:'none', padding:'12px 24px', borderRadius:12, fontWeight:700, cursor:'pointer', fontSize:13, boxShadow:`0 4px 18px ${C.accentGlow}` }}>
              ← Modify Search
            </button>
          </div>
        </GlassCard>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}><span style={{ color:C.accent }}>{hotelFiltered?.length}</span> hotels found {hotelFiltered?.length !== hotelResults.length && <span style={{ fontSize:12, color:C.sub }}>(of {hotelResults.length})</span>}</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:12, color:C.sub }}>Sort By</span>
            <select value={hSortBy} onChange={e=>setHSortBy(e.target.value)} style={{ background:C.card, border:`1px solid ${C.cardBorder}`, color:C.text, borderRadius:8, padding:'7px 12px', fontSize:12, outline:'none', cursor:'pointer' }}>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="stars_desc">Stars: High to Low</option>
              <option value="stars_asc">Stars: Low to High</option>
            </select>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'248px 1fr', gap:20 }}>

          {/* ── FILTER SIDEBAR ── */}
          <GlassCard style={{ padding:20, alignSelf:'start', position:'sticky', top:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <span style={{ fontSize:14, fontWeight:700, color:C.text }}>Filters</span>
              <button onClick={()=>{setHFilterName('');setHFilterMinPrice('');setHFilterMaxPrice('');setHFilterStars([]);setHFilterLocations([]);setHFilterAmenities([])}} style={{ background:'none', border:'none', color:C.accent, cursor:'pointer', fontSize:11, fontWeight:700 }}>Reset All</button>
            </div>

            {/* Map placeholder */}
            <div style={{ background:'#1a2235', borderRadius:10, height:100, marginBottom:18, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${C.cardBorder}`, overflow:'hidden', position:'relative' }}>
              <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 19px,#1E2D4022 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,#1E2D4022 20px)', backgroundSize:'20px 20px' }} />
              <span style={{ fontSize:12, color:C.sub, zIndex:1 }}>🗺 View on Map</span>
            </div>

            <FSection title="Hotel Name">
              <input value={hFilterName} onChange={e=>setHFilterName(e.target.value)} placeholder="Search By Hotel Name"
                style={{ width:'100%', background:C.bg, border:`1px solid ${C.cardBorder}`, borderRadius:7, color:C.text, padding:'8px 12px', fontSize:12, outline:'none' }} />
            </FSection>

            <FSection title="Price Range">
              <div style={{ display:'flex', gap:8 }}>
                <input value={hFilterMinPrice} onChange={e=>setHFilterMinPrice(e.target.value)} placeholder="Min"
                  style={{ flex:1, background:C.bg, border:`1px solid ${C.cardBorder}`, borderRadius:7, color:C.text, padding:'8px 10px', fontSize:12, outline:'none' }} />
                <input value={hFilterMaxPrice} onChange={e=>setHFilterMaxPrice(e.target.value)} placeholder="Max"
                  style={{ flex:1, background:C.bg, border:`1px solid ${C.cardBorder}`, borderRadius:7, color:C.text, padding:'8px 10px', fontSize:12, outline:'none' }} />
              </div>
            </FSection>

            <FSection title="Star Category">
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {[0,1,2,3,4,5].map(s => {
                  const active = hFilterStars.includes(s)
                  return (
                    <button key={s} onClick={()=>setHFilterStars(prev=>prev.includes(s)?prev.filter(x=>x!==s):[...prev,s])}
                      style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${active?'#FFD60A':C.cardBorder}`, background:active?'#FFD60A18':'transparent', cursor:'pointer', fontSize:11, color:active?'#FFD60A':C.sub, fontWeight:600 }}>
                      {s === 0 ? '0★' : '★'.repeat(s)}
                    </button>
                  )
                })}
              </div>
            </FSection>

            <FSection title="Search By Location">
              <div style={{ maxHeight:160, overflowY:'auto' }}>
                {allLocations.map(loc => (
                  <label key={loc} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, cursor:'pointer' }}>
                    <input type="checkbox" checked={hFilterLocations.includes(loc)} onChange={()=>setHFilterLocations(prev=>prev.includes(loc)?prev.filter(x=>x!==loc):[...prev,loc])}
                      style={{ accentColor:C.accent, width:13, height:13, cursor:'pointer' }} />
                    <span style={{ fontSize:12, color:hFilterLocations.includes(loc)?C.text:C.sub }}>{loc}</span>
                  </label>
                ))}
              </div>
            </FSection>

            <FSection title="Amenities" last>
              <input value={hAmenitySearch} onChange={e=>setHAmenitySearch(e.target.value)} placeholder="Type Amenities Here"
                style={{ width:'100%', background:C.bg, border:`1px solid ${C.cardBorder}`, borderRadius:7, color:C.text, padding:'7px 10px', fontSize:12, outline:'none', marginBottom:10 }} />
              <div style={{ maxHeight:160, overflowY:'auto' }}>
                {filteredAmenities.map(am => (
                  <label key={am} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, cursor:'pointer' }}>
                    <input type="checkbox" checked={hFilterAmenities.includes(am)} onChange={()=>setHFilterAmenities(prev=>prev.includes(am)?prev.filter(x=>x!==am):[...prev,am])}
                      style={{ accentColor:C.accent, width:13, height:13, cursor:'pointer' }} />
                    <span style={{ fontSize:12, color:hFilterAmenities.includes(am)?C.text:C.sub }}>{am}</span>
                  </label>
                ))}
              </div>
            </FSection>
          </GlassCard>

          {/* ── HOTEL CARDS ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!hotelFiltered?.length ? (
              <GlassCard style={{ padding:40, textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
                <div style={{ color:C.sub, fontSize:14 }}>No hotels match your filters.</div>
                <button onClick={()=>{setHFilterName('');setHFilterMinPrice('');setHFilterMaxPrice('');setHFilterStars([]);setHFilterLocations([]);setHFilterAmenities([])}}
                  style={{ marginTop:16, background:C.accentSoft, color:C.accent, border:`1px solid ${C.accent}30`, padding:'9px 20px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 }}>
                  Clear Filters
                </button>
              </GlassCard>
            ) : (hotelFiltered || []).map(hotel => {
              const outOfPolicy = policyMax > 0 && hotel.pricePerNight > policyMax
              const AMENITY_ICONS = { 'Free WiFi':'📶', 'Restaurant':'🍽', 'Swimming Pool':'🏊', 'Gym':'🏋', 'Internet':'🌐', 'Business Center':'💼', 'Bar':'🍺', 'Laundry':'👔', 'Room Service':'🛎', 'Parking':'🅿', 'Spa':'💆', 'Conference Room':'🎤' }
              return (
                <GlassCard key={hotel.hotelId} style={{ overflow:'hidden' }}>
                  <div style={{ display:'flex', gap:0 }}>
                    {/* Image */}
                    <div style={{ width:220, minHeight:160, background:`linear-gradient(135deg,#1a2235,#0d1520)`, flexShrink:0, position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:40 }}>🏨</span>
                      <button style={{ position:'absolute', top:10, left:10, background:'rgba(255,255,255,0.1)', border:'none', borderRadius:'50%', width:32, height:32, cursor:'pointer', fontSize:16, color:'#fff' }}>♡</button>
                    </div>

                    {/* Details */}
                    <div style={{ flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                          <div>
                            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{hotel.name} <span style={{ fontSize:12, color:'#FFD60A' }}>{'★'.repeat(hotel.stars)}</span></div>
                            <div style={{ fontSize:12, color:C.sub, marginTop:3 }}>📍 {hotel.address}</div>
                          </div>
                          {outOfPolicy && <span style={{ fontSize:10, fontWeight:700, color:'#FF453A', background:'#FF453A14', border:'1px solid #FF453A30', borderRadius:6, padding:'3px 8px', whiteSpace:'nowrap', flexShrink:0, marginLeft:12 }}>🚩 OUT OF POLICY</span>}
                        </div>
                        <div style={{ marginBottom:8 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:C.sub, background:C.bg, border:`1px solid ${C.cardBorder}`, borderRadius:6, padding:'3px 10px' }}>☕ {hotel.roomType}</span>
                        </div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:12, color:C.sub }}>
                          {hotel.amenities.slice(0,6).map(am => <span key={am}>{AMENITY_ICONS[am]||'•'} {am}</span>)}
                        </div>
                      </div>
                    </div>

                    {/* Price + CTA */}
                    <div style={{ width:180, padding:'16px 20px', borderLeft:`1px solid ${C.divider}`, display:'flex', flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:8, flexShrink:0 }}>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.5px', marginBottom:2 }}>STARTS FROM</div>
                        <div style={{ fontSize:22, fontWeight:900, color:C.text }}>₹{hotel.pricePerNight.toLocaleString('en-IN')}</div>
                        <div style={{ fontSize:10, color:C.sub }}>{hotelForm.rooms} Room / {hotel.nights} Night{hotel.nights>1?'s':''}</div>
                        <div style={{ fontSize:12, color:C.accent, fontWeight:700, marginTop:4 }}>Total: ₹{hotel.totalPrice.toLocaleString('en-IN')}</div>
                      </div>
                      <button onClick={()=>initiateHotelBook(hotel)}
                        style={{ background:`linear-gradient(135deg,${C.accent},#9B6BFF)`, color:'#fff', border:'none', padding:'10px 18px', borderRadius:10, fontWeight:700, cursor:'pointer', fontSize:12, boxShadow:`0 4px 14px ${C.accentGlow}`, width:'100%' }}>
                        Select Room
                      </button>
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ──── RESULTS VIEW ──── */
  if (rawResults) {
    const srcCode = form.origin.match(/\((\w+)\)/)?.[1] || form.origin.slice(0, 3).toUpperCase()
    const dstCode = form.destination.match(/\((\w+)\)/)?.[1] || form.destination.slice(0, 3).toUpperCase()
    const dateStr = new Date(form.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    const allAirlines = [...new Set(rawResults.map(f => f.airline))]
    const globalMin = Math.min(...rawResults.map(f => f.price))
    const globalMax = Math.max(...rawResults.map(f => f.price))

    return (
      <div style={{ fontFamily: "'Inter',sans-serif", paddingBottom: 60, animation: 'fadeUp .35s ease' }}>
        <style>{GLOBAL_CSS}</style>

        {err && <ErrBar>{err}</ErrBar>}
        {booked && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: C.green, fontWeight: 700, marginBottom: 10 }}>✓ Flight Booked — Ticket sent to employee portal</div>
            <TicketCard ticket={booked} onClose={() => setBooked(null)} />
          </div>
        )}

        {/* ── Summary Strip ── */}
        <GlassCard style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
              <span style={{ fontSize: 21, fontWeight: 800, color: C.text }}>{form.origin}</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ height: 1, width: 44, background: `linear-gradient(90deg,${C.accent},${C.muted})` }} />
                <span style={{ fontSize: 11, color: C.accent }}>✈</span>
                <div style={{ height: 1, width: 44, background: `linear-gradient(90deg,${C.muted},${C.accent})` }} />
              </div>
              <span style={{ fontSize: 21, fontWeight: 800, color: C.text }}>{form.destination}</span>
            </div>
            <div style={{ fontSize: 12, color: C.sub }}>{form.pax} Adult · {form.cls} · {dateStr}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: C.accent, lineHeight: 1 }}>{results?.length}</div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
              {results?.length !== rawResults.length ? `of ${rawResults.length} flights` : 'flights found'}
            </div>
          </div>
          <button onClick={() => { setRawResults(null); setExpanded(null) }}
            style={{
              background: `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff', border: 'none',
              padding: '12px 26px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 13,
              boxShadow: `0 4px 18px ${C.accentGlow}`
            }}>
            ← Modify Search
          </button>
        </GlassCard>

        <div style={{ display: 'grid', gridTemplateColumns: '224px 1fr', gap: 20 }}>

          {/* ── FILTER SIDEBAR ── */}
          <GlassCard style={{ padding: 20, alignSelf: 'start', position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Filters</span>
              <button onClick={() => { setFilterAirlines([]); setFilterMaxPrice(globalMax); setFilterStops([]); setFilterTimes([]); setFilterRefund(false) }}
                style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                Reset All
              </button>
            </div>

            {/* Airlines */}
            <FSection title="Airlines">
              {allAirlines.map(a => {
                const m = AIRLINE_META[a] || { grad: ['#333', '#555'], abbr: '??' }
                const checked = filterAirlines.length === 0 || filterAirlines.includes(a)
                return (
                  <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => {
                        // if all checked → uncheck others, leave only this
                        if (filterAirlines.length === 0) setFilterAirlines(allAirlines.filter(x => x !== a))
                        else toggleAirline(a)
                      }}
                      style={{ accentColor: C.accent, width: 14, height: 14, cursor: 'pointer' }} />
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: `linear-gradient(135deg,${m.grad[0]},${m.grad[1]})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 900, color: '#fff', flexShrink: 0
                    }}>{m.abbr}</div>
                    <span style={{ fontSize: 12, color: checked ? C.text : C.muted }}>{a}</span>
                    <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
                      {rawResults.filter(f => f.airline === a).length}
                    </span>
                  </label>
                )
              })}
            </FSection>

            {/* Price Range */}
            <FSection title="Max Price">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.sub, marginBottom: 10 }}>
                <span>₹{globalMin.toLocaleString('en-IN')}</span>
                <span style={{ color: C.accent, fontWeight: 700 }}>₹{(filterMaxPrice ?? globalMax).toLocaleString('en-IN')}</span>
              </div>
              <input type="range"
                min={globalMin} max={globalMax} step={100}
                value={filterMaxPrice ?? globalMax}
                onChange={e => setFilterMaxPrice(Number(e.target.value))}
                style={{ width: '100%' }} />
            </FSection>

            {/* Depart Time */}
            <FSection title="Depart Time">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {TIME_SLOTS.map(slot => {
                  const active = filterTimes.includes(slot.id)
                  const count = rawResults.filter(f => { const h = getHour(f.departureTime); return h >= slot.from && h < slot.to }).length
                  return (
                    <button key={slot.id} onClick={() => toggleTime(slot.id)}
                      style={{
                        background: active ? C.accentSoft : C.bg, border: `1px solid ${active ? C.accent : C.cardBorder}`,
                        borderRadius: 8, padding: '9px 6px', cursor: 'pointer', textAlign: 'center',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                        opacity: count === 0 ? .4 : 1, transition: 'all .15s'
                      }}>
                      <span style={{ fontSize: 16 }}>{slot.icon}</span>
                      <span style={{ fontSize: 9, color: active ? C.accent : C.sub, fontWeight: active ? 700 : 400 }}>{slot.label}</span>
                      <span style={{ fontSize: 10, color: active ? C.accent : C.muted, fontWeight: 600 }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </FSection>

            {/* Stops */}
            <FSection title="Stops">
              {[{ label: 'Non-Stop', v: 0 }, { label: '1 Stop', v: 1 }, { label: '2+ Stops', v: 2 }].map(({ label, v }) => {
                const cnt = rawResults.filter(f => f.stops === v || (v === 2 && f.stops >= 2)).length
                const isOn = filterStops.length === 0 || filterStops.includes(v)
                return (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', opacity: cnt === 0 ? .4 : 1 }}>
                    <input type="checkbox" checked={isOn}
                      onChange={() => {
                        if (filterStops.length === 0) setFilterStops([0, 1, 2].filter(x => x !== v))
                        else toggleStop(v)
                      }}
                      style={{ accentColor: C.accent, width: 14, height: 14, cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, color: isOn ? C.text : C.muted, flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{cnt}</span>
                  </label>
                )
              })}
            </FSection>

            {/* Refundable */}
            <FSection title="Fare Type" last>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={filterRefund} onChange={e => setFilterRefund(e.target.checked)}
                  style={{ accentColor: C.accent, width: 14, height: 14, cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: filterRefund ? C.green : C.sub }}>Refundable Only</span>
              </label>
            </FSection>
          </GlassCard>

          {/* ── FLIGHT CARDS ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {results && results.length === 0 ? (
              <GlassCard style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ color: C.sub, fontSize: 14 }}>No flights match your filters.</div>
                <button onClick={() => { setFilterAirlines([]); setFilterMaxPrice(globalMax); setFilterStops([]); setFilterTimes([]) }}
                  style={{
                    marginTop: 16, background: C.accentSoft, color: C.accent, border: `1px solid ${C.accent}30`,
                    padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600
                  }}>
                  Clear Filters
                </button>
              </GlassCard>
            ) : (results || []).map(fl => {
              const meta = AIRLINE_META[fl.airline] || { grad: ['#333', '#555'], abbr: '??' }
              const isOpen = expanded === fl.flightId
              return (
                <GlassCard key={fl.flightId} style={{
                  overflow: 'hidden', transition: 'border-color .2s',
                  borderColor: isOpen ? C.accent : C.cardBorder
                }}>

                  {/* Main row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr 1fr 1fr 200px', alignItems: 'center' }}>

                    {/* Airline */}
                    <div style={{ padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 14, borderRight: `1px solid ${C.divider}` }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: `linear-gradient(135deg,${meta.grad[0]},${meta.grad[1]})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 900, color: '#fff', flexShrink: 0,
                        boxShadow: `0 4px 14px ${meta.grad[1]}55`
                      }}>
                        {meta.abbr}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fl.airline}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{fl.flightNumber}</div>
                        <div style={{ marginTop: 5 }}><Tag color={C.green}>Refundable</Tag></div>
                      </div>
                    </div>

                    {/* Depart */}
                    <div style={{ padding: '22px 16px', textAlign: 'center', borderRight: `1px solid ${C.divider}` }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: C.text, letterSpacing: '-1px' }}>{fl.departureTime}</div>
                      <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{srcCode} · {fl.departureTerminal}</div>
                    </div>

                    {/* Duration */}
                    <div style={{ padding: '22px 12px', textAlign: 'center', borderRight: `1px solid ${C.divider}` }}>
                      <div style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>{fl.duration}</div>
                      <div style={{ position: 'relative', height: 2, background: C.divider, margin: '0 10px' }}>
                        <div style={{
                          position: 'absolute', left: 0, width: '100%', height: '100%',
                          background: `linear-gradient(90deg,${C.accent},${fl.stops === 0 ? C.green : C.amber})`
                        }} />
                        <span style={{ position: 'absolute', right: -4, top: -7, fontSize: 12 }}>✈</span>
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: 700, marginTop: 8, color: fl.stops === 0 ? C.green : C.amber,
                        textShadow: `0 0 10px ${fl.stops === 0 ? C.green : C.amber}60`
                      }}>
                        {fl.stopsLabel || (fl.stops === 0 ? 'Non-Stop' : `${fl.stops} Stop`)}
                      </div>
                    </div>

                    {/* Arrive */}
                    <div style={{ padding: '22px 16px', textAlign: 'center', borderRight: `1px solid ${C.divider}` }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: C.text, letterSpacing: '-1px' }}>{fl.arrivalTime}</div>
                      <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{dstCode} · {fl.arrivalTerminal}</div>
                    </div>

                    {/* Price + CTA */}
                    <div style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.5px', marginBottom: 2 }}>FROM</div>
                        <div style={{ fontSize: 23, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }}>
                          ₹{fl.price.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: 10, color: C.sub }}>per person</div>
                      </div>
                      <button onClick={() => setExpanded(isOpen ? null : fl.flightId)}
                        style={{
                          background: isOpen ? C.accentSoft : `linear-gradient(135deg,${C.accent},#9B6BFF)`,
                          color: isOpen ? C.accent : '#fff', border: isOpen ? `1px solid ${C.accent}40` : 'none',
                          padding: '10px 20px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13,
                          boxShadow: isOpen ? 'none' : `0 4px 14px ${C.accentGlow}`, transition: 'all .2s', whiteSpace: 'nowrap'
                        }}>
                        {isOpen ? 'Collapse ↑' : 'View Fares →'}
                      </button>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.muted }}>
                        {fl.seatsAvailable != null && <span style={{ color: fl.seatsAvailable < 20 ? C.amber : C.muted }}>💺 {fl.seatsAvailable} left</span>}
                        <span>🧳 {fl.baggage || '15+7 KG'}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Fare cards (expanded) ── */}
                  {isOpen && (
                    <div style={{
                      borderTop: `1px solid ${C.accent}40`, padding: 24,
                      background: `linear-gradient(180deg,${C.accentSoft},transparent)`,
                      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, animation: 'fadeUp .2s ease'
                    }}>
                      {fl.fareOptions.map((fare, fi) => (
                        <div key={fare.type} style={{
                          borderRadius: 14, padding: 20,
                          border: `1px solid ${fi === 0 ? C.accent : C.cardBorder}`,
                          background: fi === 0 ? `linear-gradient(160deg,${C.accentSoft},${C.card})` : C.card,
                          position: 'relative'
                        }}>
                          {fi === 0 && (
                            <div style={{
                              position: 'absolute', top: -11, left: 16,
                              background: `linear-gradient(90deg,${C.accent},#9B6BFF)`,
                              fontSize: 9, fontWeight: 800, color: '#fff', padding: '3px 12px', borderRadius: 20, letterSpacing: '1px'
                            }}>
                              ★ BEST VALUE
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{fare.type}</div>
                              <div style={{ fontSize: 10, color: C.green, fontWeight: 600, marginTop: 3 }}>● Refundable</div>
                            </div>
                            <div style={{ fontSize: 19, fontWeight: 900, color: fi === 0 ? C.accent : C.text }}>
                              ₹{fare.price.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 12, fontSize: 12, color: C.sub, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                            <Row label="🔄 Date change" val="₹2,500" />
                            <Row label="❌ Cancellation" val="₹3,300" />
                            <Row label="🧳 Baggage" val={<span style={{ color: C.green }}>{fl.baggage || '15+7 KG'}</span>} />
                          </div>
                          <button onClick={() => {
                            initiateBook(fl, fare)

                          }} disabled={booking}
                            style={{
                              width: '100%',
                              background: fi === 0 ? `linear-gradient(135deg,${C.accent},#9B6BFF)` : C.divider,
                              color: fi === 0 ? '#fff' : C.sub, border: 'none', padding: '11px 0', borderRadius: 10,
                              fontWeight: 700, cursor: booking ? 'default' : 'pointer', fontSize: 13,
                              boxShadow: fi === 0 ? `0 4px 14px ${C.accentGlow}` : 'none', transition: 'all .2s',
                              opacity: booking ? .5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                            }}>
                            {booking ? <DotLoader /> : '✈ Select & Book'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ──── SEARCH FORM VIEW ──── */
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", paddingBottom: 60, animation: 'fadeUp .3s ease' }}>
      <style>{GLOBAL_CSS}</style>

      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
          ✦ Booking Admin Portal
        </div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: C.text, lineHeight: 1.1 }}>
          Book travel for your team,<br />
          <span style={{ background: `linear-gradient(90deg,${C.accent},#B06BFF)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            effortlessly.
          </span>
        </h1>
        <p style={{ margin: '10px 0 0', color: C.sub, fontSize: 14 }}>Search · Compare · Book — sent instantly to the employee's portal</p>
      </div>

      {err && <ErrBar>{err}</ErrBar>}

      {booked && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: C.green, fontWeight: 700, marginBottom: 10 }}>✓ Flight Booked Successfully — Ticket sent to employee portal</div>
          <TicketCard ticket={booked} onClose={() => setBooked(null)} />
        </div>
      )}

      {/* ── Search Card ── */}
      <GlassCard style={{ overflow: 'hidden', marginBottom: 28 }}>

        {/* Mode tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.cardBorder}`, padding: '0 24px', gap: 4 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setModeTab(m.id)}
              style={{
                padding: '15px 20px', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                borderBottom: modeTab === m.id ? `2px solid ${C.accent}` : '2px solid transparent',
                color: modeTab === m.id ? C.accent : C.muted,
                fontSize: 12, fontWeight: modeTab === m.id ? 700 : 400, transition: 'all .15s'
              }}>
              <span style={{ fontSize: 18 }}>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {/* ── HOTEL search form ── */}
          {modeTab === 'Hotel' && (<>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontSize:13, color:C.sub }}>Book a hotel for an approved request</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:12, color:C.muted }}>Booking for:</span>
                {hotelPending.length === 0 ? (
                  <span style={{ fontSize:12, color:C.amber, padding:'8px 14px', background:`${C.amber}12`, borderRadius:8, border:`1px solid ${C.amber}30` }}>⚠ No approved hotel requests</span>
                ) : (
                  <select value={hotelForm.requestId}
                    onChange={e => {
                      const r = hotelPending.find(x => x.id === e.target.value)
                      if (r) setHotelForm(v => ({ ...v, requestId: r.id, city: r.to_location || '', checkIn: r.start_date?.slice(0,10)||'', checkOut: r.end_date?.slice(0,10)||'' }))
                      else setHotelForm(v => ({ ...v, requestId:'' }))
                    }}
                    style={{ background:C.bg, border:`1px solid ${C.cardBorder}`, borderRadius:8, color:C.text, padding:'9px 14px', fontSize:12, outline:'none', maxWidth:360, cursor:'pointer' }}>
                    <option value="">— Select approved hotel request —</option>
                    {hotelPending.map(r => (
                      <option key={r.id} value={r.id}>{r.user_name} · {r.to_location} · Wallet ₹{Number(r.wallet_balance||0).toLocaleString('en-IN')}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div style={{ display:'flex', gap:2, background:C.bg, borderRadius:14, padding:4, alignItems:'stretch', minHeight:72 }}>
              <SField label="DESTINATION / CITY" style={{ flex:2 }}>
                <input value={hotelForm.city} onChange={e=>setHotelForm(v=>({...v,city:e.target.value}))} placeholder="e.g. Chennai, Tamil Nadu, India" style={inputSt} />
              </SField>
              <SField label="CHECK-IN" style={{ flex:1 }}>
                <input type="date" value={hotelForm.checkIn} onChange={e=>setHotelForm(v=>({...v,checkIn:e.target.value}))} style={inputSt} />
              </SField>
              <SField label="NIGHTS" style={{ flex:'0 0 64px', textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:900, color:C.accent, textAlign:'center' }}>
                  {hotelForm.checkIn && hotelForm.checkOut ? Math.max(1,Math.ceil((new Date(hotelForm.checkOut)-new Date(hotelForm.checkIn))/(1000*60*60*24))) : '—'}
                </div>
              </SField>
              <SField label="CHECK-OUT" style={{ flex:1 }}>
                <input type="date" value={hotelForm.checkOut} onChange={e=>setHotelForm(v=>({...v,checkOut:e.target.value}))} style={inputSt} />
              </SField>
              <SField label="ROOMS & GUESTS" style={{ flex:1 }}>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input value={hotelForm.rooms} onChange={e=>setHotelForm(v=>({...v,rooms:e.target.value}))} style={{...inputSt,width:22}} placeholder="1" />
                  <span style={{ color:C.sub, fontSize:12 }}>Room /</span>
                  <input value={hotelForm.guests} onChange={e=>setHotelForm(v=>({...v,guests:e.target.value}))} style={{...inputSt,width:22}} placeholder="1" />
                  <span style={{ color:C.sub, fontSize:12 }}>Guest</span>
                </div>
              </SField>
              <div style={{ display:'flex', alignItems:'center', padding:6 }}>
                <button onClick={hotelSearch} disabled={searching}
                  style={{ background:searching?C.muted:`linear-gradient(135deg,${C.accent},#9B6BFF)`, color:'#fff', border:'none', borderRadius:10, padding:'0 28px', height:'100%', minWidth:110, fontSize:14, fontWeight:800, cursor:searching?'wait':'pointer', boxShadow:`0 4px 18px ${C.accentGlow}`, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {searching?<DotLoader/>:'🔍 Search'}
                </button>
              </div>
            </div>
          </>)}

          {/* Trip type + Booking for */}
          {modeTab !== 'Hotel' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 6, background: C.bg, borderRadius: 10, padding: 4 }}>
              {['one-way', 'round-trip', 'multi-city'].map(t => (
                <button key={t} onClick={() => setTripType(t)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: tripType === t ? `linear-gradient(135deg,${C.accent},#9B6BFF)` : 'transparent',
                    color: tripType === t ? '#fff' : C.muted, transition: 'all .2s',
                    boxShadow: tripType === t ? `0 2px 10px ${C.accentGlow}` : 'none', textTransform: 'capitalize'
                  }}>
                  {t.replace('-', ' ')}
                </button>
              ))}
            </div>

            {/* ── Booking For — Flight requests only ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: C.muted }}>Booking for:</span>
              {flightPending.length === 0 ? (
                <span style={{ fontSize: 12, color: C.amber, padding: '8px 14px', background: `${C.amber}12`, borderRadius: 8, border: `1px solid ${C.amber}30` }}>
                  ⚠ No approved flight requests
                </span>
              ) : (
                <select value={form.requestId}
                  onChange={e => {
                    const r = flightPending.find(x => x.id === e.target.value)
                    if (r) setForm(v => ({ ...v, requestId: r.id, origin: r.from_location || '', destination: r.to_location || '', date: r.start_date?.slice(0, 10) || '' }))
                    else setForm(v => ({ ...v, requestId: '' }))
                  }}
                  style={{
                    background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.text,
                    padding: '9px 14px', fontSize: 12, outline: 'none', maxWidth: 320, cursor: 'pointer'
                  }}>
                  <option value="">— Select approved flight request —</option>
                  {flightPending.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.user_name} · {r.from_location} → {r.to_location}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>}

          {/* Search fields row — Flight/other modes */}
          {modeTab !== 'Hotel' && <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 14, padding: 4, alignItems: 'stretch', minHeight: 72 }}>

            <SField label="FROM" style={{ flex: 1.4 }}>
              <input value={form.origin} onChange={e => setForm(v => ({ ...v, origin: e.target.value }))}
                placeholder="City or Airport" style={inputSt} />
              {form.origin && (
                <div style={{ fontSize: 10, color: C.accent, marginTop: 3 }}>
                  {form.origin.match(/\((\w+)\)/)?.[1] || form.origin.slice(0, 3).toUpperCase()}
                </div>
              )}
            </SField>

            {/* Swap */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px' }}>
              <button onClick={() => setForm(v => ({ ...v, origin: v.destination, destination: v.origin }))}
                style={{
                  width: 32, height: 32, borderRadius: '50%', background: C.card, border: `1px solid ${C.cardBorder}`,
                  color: C.accent, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform .3s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'rotate(180deg)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'rotate(0deg)'}>
                ⇄
              </button>
            </div>

            <SField label="TO" style={{ flex: 1.4 }}>
              <input value={form.destination} onChange={e => setForm(v => ({ ...v, destination: e.target.value }))}
                placeholder="City or Airport" style={inputSt} />
              {form.destination && (
                <div style={{ fontSize: 10, color: C.accent, marginTop: 3 }}>
                  {form.destination.match(/\((\w+)\)/)?.[1] || form.destination.slice(0, 3).toUpperCase()}
                </div>
              )}
            </SField>

            <SField label="DEPART DATE" style={{ flex: 1 }}>
              <input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))} style={inputSt} />
            </SField>

            {tripType === 'round-trip' && (
              <SField label="RETURN DATE" style={{ flex: 1 }}>
                <input type="date" value={form.returnDate} onChange={e => setForm(v => ({ ...v, returnDate: e.target.value }))} style={inputSt} />
              </SField>
            )}

            <SField label="TRAVELLERS & CLASS" style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={form.pax} onChange={e => setForm(v => ({ ...v, pax: e.target.value }))} style={{ ...inputSt, width: 22 }} placeholder="1" />
                <select value={form.cls} onChange={e => setForm(v => ({ ...v, cls: e.target.value }))}
                  style={{ background: 'transparent', border: 'none', color: C.text, fontSize: 13, fontWeight: 600, outline: 'none', flex: 1, cursor: 'pointer' }}>
                  <option>Economy</option><option>Business</option><option>Premium Economy</option><option>First Class</option>
                </select>
              </div>
            </SField>

            <div style={{ display: 'flex', alignItems: 'center', padding: 6 }}>
              <button onClick={search} disabled={searching}
                style={{
                  background: searching ? C.muted : `linear-gradient(135deg,${C.accent},#9B6BFF)`, color: '#fff',
                  border: 'none', borderRadius: 10, padding: '0 28px', height: '100%', minWidth: 110, fontSize: 14, fontWeight: 800,
                  cursor: searching ? 'wait' : 'pointer', boxShadow: `0 4px 18px ${C.accentGlow}`, transition: 'all .2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}>
                {searching ? <DotLoader /> : '🔍 Search'}
              </button>
            </div>
          </div>}
        </div>
      </GlassCard>

      {/* ── Dashboard Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        <GlassCard style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>✈ Pending Flight Bookings</div>
            <Tag color={flightPending.length > 0 ? C.amber : C.muted}>{flightPending.length} Pending</Tag>
          </div>
          {flightPending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: C.muted, fontSize: 13 }}>
              No approved flight requests awaiting booking
            </div>
          ) : flightPending.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${C.divider}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.user_name}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>✈ {r.from_location} → {r.to_location}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{r.start_date?.slice(0, 10)}</div>
              </div>
              <button onClick={() => {
                setModeTab('Flight')
                setForm(v => ({ ...v, requestId: r.id, origin: r.from_location || '', destination: r.to_location || '', date: r.start_date?.slice(0, 10) || '' }))
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
                style={{ background: C.accentSoft, color: C.accent, border: `1px solid ${C.accent}30`, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Book →
              </button>
            </div>
          ))}
        </GlassCard>

        <GlassCard style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>🏨 Pending Hotel Bookings</div>
            <Tag color={hotelPending.length > 0 ? C.amber : C.muted}>{hotelPending.length} Pending</Tag>
          </div>
          {hotelPending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: C.muted, fontSize: 13 }}>No approved hotel requests awaiting booking</div>
          ) : hotelPending.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${C.divider}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.user_name}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>🏨 {r.to_location}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{r.start_date?.slice(0,10)} → {r.end_date?.slice(0,10)}</div>
              </div>
              <button onClick={() => {
                setModeTab('Hotel')
                setHotelForm(v => ({ ...v, requestId: r.id, city: r.to_location||'', checkIn: r.start_date?.slice(0,10)||'', checkOut: r.end_date?.slice(0,10)||'' }))
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
                style={{ background: C.accentSoft, color: C.accent, border: `1px solid ${C.accent}30`, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Book →
              </button>
            </div>
          ))}
        </GlassCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
        <GlassCard style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>📋 Recent Bookings</div>
            <Tag color={C.green}>{history.length}</Tag>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: C.muted, fontSize: 13 }}>No bookings yet</div>
          ) : history.slice(0, 5).map(h => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${C.divider}` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{h.booked_for_name || '—'}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{h.from_location} → {h.to_location}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{new Date(h.created_at).toLocaleDateString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>₹{Number(h.amount || 0).toLocaleString('en-IN')}</div>
                <Tag color={C.green} style={{ marginTop: 4 }}>{(h.status || 'confirmed').toUpperCase()}</Tag>
              </div>
            </div>
          ))}
        </GlassCard>
      </div>
    </div>
  )
}

/* ── Sub-components ── */
function SField({ label, children, style = {} }) {
  return (
    <div style={{
      flex: 1, background: '#151524', borderRadius: 10, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, ...style
    }}>
      <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </div>
  )
}
function FSection({ title, children, last = false }) {
  return (
    <div style={{ marginBottom: last ? 0 : 18, paddingBottom: last ? 0 : 18, borderBottom: last ? 'none' : `1px solid ${C.divider}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ label, val }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span><span style={{ color: C.text }}>{val}</span>
    </div>
  )
}
function ErrBar({ children }) {
  return (
    <div style={{
      background: '#FF453A14', border: '1px solid #FF453A30', borderRadius: 10,
      padding: '12px 16px', color: C.red, fontSize: 13, marginBottom: 16
    }}>
      {children}
    </div>
  )
}
