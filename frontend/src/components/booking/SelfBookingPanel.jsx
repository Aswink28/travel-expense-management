import { useState, useEffect, useCallback } from 'react'
import { selfBookingAPI, walletAPI, flightsAPI } from '../../services/api' // flightsAPI used for search
import { useAuth } from '../../context/AuthContext'
import { Spinner, Alert, Button } from '../shared/UI'
import TicketCard from './TicketCard'

// ── Icons ──
const TABS = [
  { id: 'Flight', icon: '✈️' },
  { id: 'Hotel', icon: '🏨' },
  { id: 'Bus', icon: '🚌' },
  { id: 'Visa', icon: '📋' },
  { id: 'Cab', icon: '🚕' },
  { id: 'Train', icon: '🚂' }
]

export default function SelfBookingPanel() {
  const { user, updateWallet } = useAuth()
  const [requests, setRequests] = useState([])
  const [wallet, setWallet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Layout states
  const [activeTab, setActiveTab] = useState('Flight')
  const [tripType, setTripType] = useState('OneWay')
  
  // Search form state
  const [form, setForm] = useState({
    requestId: '',
    origin: '',
    destination: '',
    onwardDate: '',
    returnDate: '',
    passengers: '1, Economy',
    airline: 'All'
  })

  // Search Results state
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState(null)
  const [expandedFlight, setExpandedFlight] = useState(null)
  
  // Executing Booking
  const [submitting, setSubmitting] = useState(false)
  const [viewTicket, setViewTicket] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, w] = await Promise.all([selfBookingAPI.myApproved(), walletAPI.balance()])
      setRequests(r.data || [])
      setWallet(w.data)
      updateWallet?.(w.data)
      
      // Auto-select first request if available
      if (r.data && r.data.length > 0) {
        setForm(p => ({ 
          ...p, 
          requestId: r.data[0].id,
          origin: r.data[0].from_location || '',
          destination: r.data[0].to_location || '',
          onwardDate: r.data[0].start_date?.slice(0, 10) || ''
        }))
      }
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSearch = async () => {
    if (!form.requestId) return setError("Please select an Approved Request to bill against.")
    if (!form.origin || !form.destination || !form.onwardDate) return setError("Please fill Origin, Destination, and Date.")
    
    setSearching(true)
    setError('')
    setSuccess('')
    setSearchResults(null)
    setExpandedFlight(null)
    setViewTicket(null)

    try {
      // Mock search or actual if Flight
      if (activeTab === 'Flight') {
        const res = await flightsAPI.search({
          source: form.origin,
          destination: form.destination,
          date: form.onwardDate,
          passengers: parseInt(form.passengers) || 1,
          travelClass: form.passengers.includes('Business') ? 'Business' : 'Economy'
        })
        setSearchResults(res.data)
      } else {
        // Fallback or other tabs
        setError(`Search for ${activeTab} is currently mock-only in this demo. Please use Flight for full Amadeus SDK demo.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  const handleBook = async (flight, fare) => {
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const res = await selfBookingAPI.bookTransport({
        request_id:    form.requestId,
        travel_mode:   'Flight',
        from_location: flight.origin      || form.origin,
        to_location:   flight.destination || form.destination,
        travel_date:   form.onwardDate,
        travel_time:   flight.departureTime || '',
        seat_class:    fare.type || 'Economy',
        vendor:        flight.airline || '',
        flight_number: flight.flightNumber || '',
        amount:        fare.price,
      })

      setSuccess(`Booked successfully! PNR: ${res.data?.pnr}`)
      setViewTicket(res.data?.ticket)

      // Refresh wallet & requests
      load()
    } catch (err) {
      setError(err.message || 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up" style={{ paddingBottom: 60 }}>
      {/* ── Top Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, className: 'syne', color: '#F0F0F4' }}>
          Welcome {(user?.name || '').split(' ')[0]}, <span style={{ color: '#888', fontWeight: 400 }}>Where to next?</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ background: '#E1395F', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            💼 Self Booking
          </div>
          <div style={{ background: '#1A1A22', color: '#888', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #2A2A35' }}>
            ✨ Book with AI
          </div>
        </div>
      </div>

      {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}
      {success && <Alert type="success" style={{ marginBottom: 16 }}>{success}</Alert>}

      {/* ── Main Search Card ── */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        
        {/* Horizontal Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #eaeaea', padding: '0 20px' }}>
          {TABS.map(t => (
            <div 
              key={t.id} 
              onClick={() => { setActiveTab(t.id); setSearchResults(null); }}
              style={{ 
                padding: '16px 24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                borderBottom: activeTab === t.id ? '3px solid #E1395F' : '3px solid transparent',
                color: activeTab === t.id ? '#E1395F' : '#666',
                fontWeight: activeTab === t.id ? 600 : 500,
                transition: 'all .2s'
              }}
            >
              <div style={{ fontSize: 20 }}>{t.icon}</div>
              <div style={{ fontSize: 13 }}>{t.id}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {/* Options Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, fontSize: 13, color: '#444' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={tripType === 'OneWay'} onChange={() => setTripType('OneWay')} style={{ accentColor: '#E1395F' }} />
                OneWay
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={tripType === 'RoundTrip'} onChange={() => setTripType('RoundTrip')} style={{ accentColor: '#E1395F' }} />
                Round Trip
              </label>
              
              {/* Added Request Dropdown Here to map layout naturally */}
              <div style={{ marginLeft: 20, paddingLeft: 20, borderLeft: '1px solid #eaeaea', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#888' }}>Link to Request:</span>
                <select 
                  value={form.requestId} 
                  onChange={e => {
                    const req = requests.find(r => r.id === e.target.value);
                    if (req) {
                      setForm(p => ({
                        ...p,
                        requestId: req.id,
                        origin: req.from_location,
                        destination: req.to_location,
                        onwardDate: req.start_date?.slice(0, 10) || ''
                      }))
                    } else {
                      setForm(p => ({ ...p, requestId: '' }))
                    }
                  }}
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, outline: 'none' }}
                >
                  <option value="">-- Select Approved Request --</option>
                  {requests.map(r => (
                    <option key={r.id} value={r.id}>{r.purpose} ({r.from_location} - {r.to_location})</option>
                  ))}
                </select>
                {wallet && <span style={{ color: '#30D158', fontWeight: 600 }}>Wallet: ₹{Number(wallet.balance).toLocaleString('en-IN')}</span>}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" /> Personal Bookings</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" /> Direct Flight</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" /> No Cache</label>
            </div>
          </div>

          {/* Dynamic Search Bar Row */}
          <div style={{ display: 'flex', border: '1px solid #eaeaea', borderRadius: 8, padding: 4, minHeight: 64 }}>
            {activeTab === 'Flight' && (
              <>
                <div style={{ flex: 1.2, padding: '8px 16px', borderRight: '1px solid #eaeaea', position: 'relative' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Select Origin City</div>
                  <input value={form.origin} onChange={e => setForm(p=>({...p, origin: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. Delhi (DEL)" />
                  <div style={{ position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)', background: '#fff', border: '1px solid #eaeaea', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E1395F', zIndex: 2, cursor: 'pointer' }}>⇄</div>
                </div>
                <div style={{ flex: 1.2, padding: '8px 16px', borderRight: '1px solid #eaeaea', paddingLeft: 24 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Select Destination City</div>
                  <input value={form.destination} onChange={e => setForm(p=>({...p, destination: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. Bagdogra (IXB)" />
                </div>
                <div style={{ flex: 1, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Onward Date</div>
                  <input type="date" value={form.onwardDate} onChange={e => setForm(p=>({...p, onwardDate: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, padding: '8px 16px', borderRight: '1px solid #eaeaea', opacity: tripType === 'OneWay' ? 0.4 : 1 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Return Date</div>
                  <input type="date" value={form.returnDate} onChange={e => setForm(p=>({...p, returnDate: e.target.value}))} disabled={tripType === 'OneWay'} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Passenger, Class</div>
                  <input value={form.passengers} onChange={e => setForm(p=>({...p, passengers: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, padding: '8px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Preferred Airline</div>
                  <input value={form.airline} onChange={e => setForm(p=>({...p, airline: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
              </>
            )}

            {activeTab === 'Hotel' && (
              <>
                <div style={{ flex: 2, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>City, Property Name Or Location</div>
                  <input value={form.destination} onChange={e => setForm(p=>({...p, destination: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. Mumbai" />
                </div>
                <div style={{ flex: 1, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Check-In</div>
                  <input type="date" value={form.onwardDate} onChange={e => setForm(p=>({...p, onwardDate: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Check-Out</div>
                  <input type="date" value={form.returnDate} onChange={e => setForm(p=>({...p, returnDate: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
                <div style={{ flex: 1.5, padding: '8px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Rooms & Guests</div>
                  <input value={form.passengers || '1 Room, 1 Adult'} onChange={e => setForm(p=>({...p, passengers: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="1 Room, 1 Adult" />
                </div>
              </>
            )}

            {activeTab === 'Bus' && (
              <>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea', position: 'relative' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>From</div>
                  <input value={form.origin} onChange={e => setForm(p=>({...p, origin: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. Bangalore" />
                  <div style={{ position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)', background: '#fff', border: '1px solid #eaeaea', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E1395F', zIndex: 2, cursor: 'pointer' }}>⇄</div>
                </div>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea', paddingLeft: 24 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>To</div>
                  <input value={form.destination} onChange={e => setForm(p=>({...p, destination: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. Chennai" />
                </div>
                <div style={{ flex: 1.5, padding: '8px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Date of Journey</div>
                  <input type="date" value={form.onwardDate} onChange={e => setForm(p=>({...p, onwardDate: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
              </>
            )}

            {activeTab === 'Train' && (
              <>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea', position: 'relative' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>From Station</div>
                  <input value={form.origin} onChange={e => setForm(p=>({...p, origin: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. NDLS" />
                  <div style={{ position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)', background: '#fff', border: '1px solid #eaeaea', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E1395F', zIndex: 2, cursor: 'pointer' }}>⇄</div>
                </div>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea', paddingLeft: 24 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>To Station</div>
                  <input value={form.destination} onChange={e => setForm(p=>({...p, destination: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. MAS" />
                </div>
                <div style={{ flex: 1, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Travel Date</div>
                  <input type="date" value={form.onwardDate} onChange={e => setForm(p=>({...p, onwardDate: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, padding: '8px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Class</div>
                  <select value={form.passengers} onChange={e => setForm(p=>({...p, passengers: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none', appearance: 'none' }}>
                    <option value="All Classes">All Classes</option>
                    <option value="1A">1A</option>
                    <option value="2A">2A</option>
                    <option value="3A">3A</option>
                    <option value="SL">SL</option>
                  </select>
                </div>
              </>
            )}

            {activeTab === 'Cab' && (
              <>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Pickup Location</div>
                  <input value={form.origin} onChange={e => setForm(p=>({...p, origin: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. Airport Terminal 1" />
                </div>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Drop Location</div>
                  <input value={form.destination} onChange={e => setForm(p=>({...p, destination: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. Taj Hotel" />
                </div>
                <div style={{ flex: 1, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Pickup Date</div>
                  <input type="date" value={form.onwardDate} onChange={e => setForm(p=>({...p, onwardDate: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, padding: '8px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Pickup Time</div>
                  <input type="time" defaultValue="10:00" style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
              </>
            )}

            {activeTab === 'Visa' && (
              <>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Citizen Of</div>
                  <input value={form.origin} onChange={e => setForm(p=>({...p, origin: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. India" />
                </div>
                <div style={{ flex: 1.5, padding: '8px 16px', borderRight: '1px solid #eaeaea' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Traveling To</div>
                  <input value={form.destination} onChange={e => setForm(p=>({...p, destination: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 15, fontWeight: 600, color: '#222', outline: 'none' }} placeholder="e.g. United States" />
                </div>
                <div style={{ flex: 1, padding: '8px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Expected Travel Date</div>
                  <input type="date" value={form.onwardDate} onChange={e => setForm(p=>({...p, onwardDate: e.target.value}))} style={{ width: '100%', border: 'none', fontSize: 14, fontWeight: 600, color: '#222', outline: 'none' }} />
                </div>
              </>
            )}

            <div>
              <button 
                onClick={handleSearch}
                disabled={searching}
                style={{ background: '#E1395F', color: '#fff', border: 'none', height: '100%', padding: '0 32px', fontSize: 16, fontWeight: 600, borderRadius: 6, cursor: searching ? 'wait' : 'pointer', transition: 'background .2s' }}
              >
                {searching ? '...' : 'Search'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewTicket && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: '#30D158', fontWeight: 600, marginBottom: 12 }}>✓ Ticket Generated Successfully</div>
          <TicketCard ticket={viewTicket} onClose={() => setViewTicket(null)} />
        </div>
      )}

      {/* ── Search Results / Dashboard lower half ── */}
      {searchResults ? (
        <>
          {/* Header Strip */}
          <div style={{ background: '#fff', borderRadius: 8, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#222' }}>{form.origin} - {form.destination}</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>1 Adult 0 Child 0 Infant, ECONOMY</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#222' }}>{form.onwardDate ? new Date(form.onwardDate).toDateString().toUpperCase() : 'THU 26 MAR, 2026'}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{searchResults.length} Flights Found</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <button onClick={() => setSearchResults(null)} style={{ background: '#E1395F', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}>Modify Search</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#888' }}>
                <span style={{ fontSize: 12, marginRight: 4 }}>Share Itinerary</span>
                {['♡', '✉', '↓', '🖨'].map((icon, i) => (
                  <span key={i} style={{ background: '#f5f5f5', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }}>{icon}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
            {/* Left Filter Sidebar */}
            <div style={{ background: '#fff', borderRadius: 8, padding: 20, color: '#333', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', alignSelf: 'start', border: '1px solid #eaeaea' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 16, marginBottom: 20 }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>Filter</span>
                <span style={{ fontSize: 13, color: '#666', cursor: 'pointer', fontWeight: 500 }}>Reset All</span>
              </div>
              
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Search By Airlines</div>
                <input placeholder="Type Airline here" style={{ width: '100%', padding: '10px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, marginBottom: 12, outline: 'none' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#444' }}><input type="checkbox" defaultChecked /> <span style={{ width: 16, height: 16, background: '#E1395F', borderRadius: '50%', display: 'inline-block' }}></span> All Airlines</label>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Price Range</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 6 }}>
                  <span>INR 3000</span>
                  <span>INR 30000</span>
                </div>
                <div style={{ width: '100%', height: 4, background: '#E1395F', borderRadius: 2, position: 'relative', marginBottom: 8 }}>
                  <div style={{ position: 'absolute', width: 14, height: 14, background: '#fff', border: '2px solid #E1395F', borderRadius: '50%', top: -5, left: 0 }}></div>
                  <div style={{ position: 'absolute', width: 14, height: 14, background: '#fff', border: '2px solid #E1395F', borderRadius: '50%', top: -5, right: 0 }}></div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Depart Time</div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>(DEL) - (IXB)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                  <div style={{ border: '1px solid #ccc', padding: '10px 0', textAlign: 'center', borderRadius: 4, cursor: 'pointer' }}><div style={{fontSize:16, marginBottom:4}}>🌙</div><div style={{fontSize:10}}>00-06</div></div>
                  <div style={{ border: '1px solid #ccc', padding: '10px 0', textAlign: 'center', borderRadius: 4, cursor: 'pointer' }}><div style={{fontSize:16, marginBottom:4}}>☀️</div><div style={{fontSize:10}}>06-12</div></div>
                  <div style={{ border: '1px solid #ccc', padding: '10px 0', textAlign: 'center', borderRadius: 4, cursor: 'pointer' }}><div style={{fontSize:16, marginBottom:4}}>⛅</div><div style={{fontSize:10}}>12-18</div></div>
                  <div style={{ border: '1px solid #ccc', padding: '10px 0', textAlign: 'center', borderRadius: 4, cursor: 'pointer' }}><div style={{fontSize:16, marginBottom:4}}>🌙</div><div style={{fontSize:10}}>18-00</div></div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>No of Stops</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#444', marginBottom: 8 }}><input type="checkbox" /> 1 Change</label>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Fare Policy</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#444' }}><input type="checkbox" /> Refundable</label>
              </div>
            </div>

            {/* Right Results Area */}
            <div>
              {/* Fake Table Header */}
              <div style={{ background: '#fff', borderRadius: 8, padding: '12px 24px', display: 'grid', gridTemplateColumns: '1.2fr 100px 100px 100px 1.5fr', fontSize: 12, color: '#888', borderBottom: '1px solid #ccc', marginBottom: 16 }}>
                <div>Airline</div>
                <div style={{ textAlign: 'center' }}>Depart</div>
                <div style={{ textAlign: 'center' }}>Duration</div>
                <div style={{ textAlign: 'center' }}>Arrive</div>
                <div>Price</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {searchResults.length === 0 ? (
                  <div style={{ background: '#fff', padding: 40, textAlign: 'center', borderRadius: 8, color: '#666' }}>No flights found.</div>
                ) : searchResults.map(flight => (
                  <div key={flight.flightId} style={{ background: '#fff', borderRadius: 8, border: '1px solid #eaeaea', overflow: 'hidden' }}>
                    
                    {/* Flight Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 100px 100px 100px 1.5fr', padding: '24px', alignItems: 'center', gap: 16, color: '#222' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 6, background: '#E1395F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>SG</div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{flight.airline}</div>
                          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>SG - {flight.flightId.slice(0, 6)}</div>
                          <div style={{ fontSize: 11, color: '#30D158', marginTop: 12 }}>Refundable</div>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{flight.departureTime}</div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>DEL T1D</div>
                      </div>
                      
                      <div style={{ textAlign: 'center', position: 'relative' }}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{flight.duration}</div>
                        <div style={{ height: 1, background: '#ccc', width: '100%', position: 'relative' }}>
                          <span style={{ position: 'absolute', right: -6, top: -7, fontSize: 12, color: '#ccc' }}>✈️</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>1-Change</div>
                      </div>
                      
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{flight.arrivalTime} <span style={{fontSize: 11, color: '#E1395F'}}>+1D</span></div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>IXB T</div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 24 }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>INR {flight.price.toLocaleString('en-IN')}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <button 
                            onClick={() => setExpandedFlight(expandedFlight === flight.flightId ? null : flight.flightId)}
                            style={{ background: '#E1395F', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                          >
                            View fares
                          </button>
                          <div style={{ fontSize: 11, color: '#666', cursor: 'pointer' }}>Fare rule</div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status Strip */}
                    <div style={{ padding: '12px 24px', background: '#fafafa', borderTop: '1px solid #eaeaea', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#666' }}>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <span style={{ fontSize: 16, cursor: 'pointer' }}>♡</span>
                        <span style={{ background: '#f0f0f0', padding: '6px 10px', borderRadius: 4 }}>💼 15 Kg / 7 Kg</span>
                        <span style={{ background: '#f0f0f0', padding: '6px 10px', borderRadius: 4 }}>💺 1 Seat(s)</span>
                        <span style={{ background: '#f0f0f0', padding: '6px 10px', borderRadius: 4 }}>⏳ Long Layover</span>
                      </div>
                      <div style={{ color: '#E1395F', display: 'flex', gap: 16, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>👎 OUT OF POLICY</span>
                        <span style={{ color: '#444', textDecoration: 'underline', cursor: 'pointer' }}>View Flight Details</span>
                      </div>
                    </div>

                    {/* Expanded Fare Cards */}
                    {expandedFlight === flight.flightId && (
                      <div style={{ padding: 24, background: '#fdfdfd', borderTop: '1px solid #eaeaea', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                        {flight.fareOptions.map(fare => (
                          <div key={fare.type} style={{ border: fare.type === 'Saver' ? '1px solid #E1395F' : '1px solid #eaeaea', borderRadius: 8, padding: 20, background: '#fff', position: 'relative', boxShadow: fare.type==='Saver' ? '0 0 0 1px #E1395F' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #eaeaea', paddingBottom: 12 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>{fare.type} Fare</span>
                              <span style={{ fontSize: 12, color: fare.refundable ? '#30D158' : '#FF453A' }}>
                                {fare.refundable ? 'Refundable' : 'Non-Refundable'}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, color: '#444', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                              <div>❌ Cancellation | {fare.refundable ? 'Allowed' : 'Not Allowed'}</div>
                              <div>🔄 Date Change | {fare.refundable ? 'Allowed' : 'Not Allowed'}</div>
                              {(fare.cabinBaggage || flight.cabinBaggage) && (
                                <div>🎒 Cabin | {fare.cabinBaggage || flight.cabinBaggage}</div>
                              )}
                              <div>🧳 Check-in | {fare.baggage || flight.baggage || 'Not Included'}</div>
                              {fare.foodOnboard && <div>🍽 Meal | {fare.foodOnboard}</div>}
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                              <div>
                                 <div style={{ fontSize: 11, color: '#E1395F', marginBottom: 4 }}>👎 Out Policy</div>
                                 <div style={{ fontSize: 16, fontWeight: 700, color: '#333' }}>INR {fare.price.toLocaleString('en-IN')}</div>
                              </div>
                              <button 
                                 onClick={() => handleBook(flight, fare)}
                                 disabled={submitting}
                                 style={{ background: '#E1395F', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                              >
                                 {submitting ? '...' : 'Select'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Recent Bookings Placeholder */}
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 16 }}>Recent Bookings</div>
            <table style={{ width: '100%', fontSize: 11, color: '#666', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eaeaea', textAlign: 'left' }}>
                  <th style={{ paddingBottom: 8 }}>REF NO</th>
                  <th style={{ paddingBottom: 8 }}>BOOKING DATE</th>
                  <th style={{ paddingBottom: 8 }}>ITINERARY</th>
                  <th style={{ paddingBottom: 8 }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>No recent bookings recorded.</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Recent Search Placeholder */}
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 16 }}>Recent Search</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Today</div>
            {form.origin && form.destination ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#333', fontSize: 13, fontWeight: 500 }}>
                <div>
                  {form.origin} - {form.destination}
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 400, marginTop: 4 }}>{form.onwardDate}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  One_way
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 400, marginTop: 4 }}>{form.passengers}</div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#999', fontSize: 12 }}>No searches performed yet.</div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
