import { useState, useEffect } from 'react'
import { requestsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Alert, Spinner } from '../shared/UI'

const PROJECTS = ['Not Applicable', 'Project Alpha', 'Project Beta', 'Internal Operations']

export default function NewRequestForm({ onSuccess }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Approval configuration is sourced entirely from the employee profile (Employee Creation).
  // Approvals run strictly in order from lowest-authority to highest.
  const ROLE_RANK = {
    'Super Admin': 1, 'Booking Admin': 2, 'Manager': 3, 'Finance': 3, 'Tech Lead': 4, 'Employee': 5,
  }
  const approverRoles = (Array.isArray(user?.approver_roles) ? user.approver_roles : [])
    .slice()
    .sort((a, b) => (ROLE_RANK[b] ?? 99) - (ROLE_RANK[a] ?? 99))

  // ----- Form State -----
  const [form, setForm] = useState({
    trip_name: '',
    trip_type: 'Domestic',
    project_name: 'Not Applicable',
    remarks: '',
    contact_name: user?.name || '',
    contact_mobile: '',
    contact_email: '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ----- Itinerary State -----
  const [activeTab, setActiveTab] = useState('Flight')
  const [itinerary, setItinerary] = useState({
    Flight: { origin: '', destination: '', travel_type: '', departure_date: '', time_pref: '', class_pref: '', meals_pref: '', remarks: '' },
    Bus:    { from_city: '', to_city: '', date: '', bus_type: '', departure_time_pref: '', remarks: '' },
    Hotel:  { city: '', check_in: '', check_out: '', remarks: '' },
  })
  const setItin = (tab, k, v) => setItinerary(p => ({ ...p, [tab]: { ...p[tab], [k]: v } }))

  // ----- Flight Passenger State -----
  const [passengers, setPassengers] = useState([
    { type: 'Adult', title: 'Mr', firstname: '', lastname: '', dob: '', passport: '', nationality: 'IN', issuing_country: 'IN', passport_expiry: '' }
  ])
  const updatePassenger = (i, k, v) => setPassengers(p => { const n=[...p]; n[i][k]=v; return n })
  const addPassenger    = () => setPassengers(p => [...p, { type:'Adult', title:'Mr', firstname:'', lastname:'', dob:'', passport:'', nationality:'IN', issuing_country:'IN', passport_expiry:'' }])
  const removePassenger = (i) => setPassengers(p => p.filter((_,x)=>x!==i))

  // ----- Bus Passenger State -----
  const [busPassengers, setBusPassengers] = useState([
    { type: 'Adult', title: 'Mr', firstname: '', lastname: '', age: '' }
  ])
  const updateBusPax    = (i, k, v) => setBusPassengers(p => { const n=[...p]; n[i][k]=v; return n })
  const addBusPax       = () => setBusPassengers(p => [...p, { type:'Adult', title:'Mr', firstname:'', lastname:'', age:'' }])
  const removeBusPax    = (i) => setBusPassengers(p => p.filter((_,x)=>x!==i))

  // ----- Hotel Passenger State -----
  const [hotelPassengers, setHotelPassengers] = useState([
    { room_no: 1, paxtype: 'Adult', title: 'Mr', firstname: '', lastname: '', address: '', country: 'IN', state: '', city: '', postalcode: '', area: '', pan_number: '' }
  ])
  const updateHotelPax = (i, k, v) => setHotelPassengers(p => { const n=[...p]; n[i][k]=v; return n })
  const addHotelPax    = () => setHotelPassengers(p => [...p, { room_no: p.length+1, paxtype:'Adult', title:'Mr', firstname:'', lastname:'', address:'', country:'IN', state:'', city:'', postalcode:'', area:'', pan_number:'' }])
  const removeHotelPax = (i) => setHotelPassengers(p => p.filter((_,x)=>x!==i))

  // ----- Validation -----
  const [submitted, setSubmitted] = useState(false)

  const validate = () => {
    const errs = []
    const itin = itinerary[activeTab] || {}

    // Trip info
    if (!form.trip_name.trim())       errs.push('Trip Name is required')
    if (!form.contact_name.trim())    errs.push('Contact Name is required')
    if (!form.contact_mobile.trim())  errs.push('Contact Mobile is required')
    if (!form.contact_email.trim())   errs.push('Contact Email is required')

    // Itinerary — per active tab
    if (activeTab === 'Flight') {
      if (!itin.origin.trim())         errs.push('Flight: Origin is required')
      if (!itin.destination.trim())    errs.push('Flight: Destination is required')
      if (!itin.travel_type)           errs.push('Flight: Travel Type is required')
      if (!itin.departure_date)        errs.push('Flight: Departure Date is required')
    }
    if (activeTab === 'Bus') {
      if (!itin.from_city.trim())      errs.push('Bus: From City is required')
      if (!itin.to_city.trim())        errs.push('Bus: To City is required')
      if (!itin.date)                  errs.push('Bus: Travel Date is required')
      if (!itin.bus_type)              errs.push('Bus: Bus Type is required')
    }
    if (activeTab === 'Hotel') {
      if (!itin.city.trim())           errs.push('Hotel: Location is required')
      if (!itin.check_in)              errs.push('Hotel: Check-In Date is required')
      if (!itin.check_out)             errs.push('Hotel: Check-Out Date is required')
      if (itin.check_in && itin.check_out && itin.check_out <= itin.check_in)
        errs.push('Hotel: Check-Out must be after Check-In')
    }

    // Passengers — first name + last name required for every row
    const paxList = activeTab === 'Bus' ? busPassengers : activeTab === 'Hotel' ? hotelPassengers : passengers
    paxList.forEach((p, i) => {
      if (!p.firstname?.trim()) errs.push(`Passenger ${i + 1}: First Name is required`)
      if (!p.lastname?.trim())  errs.push(`Passenger ${i + 1}: Last Name is required`)
    })

    return errs
  }

  // ----- Submit -----
  const handleSubmit = async (draft = false) => {
    setSubmitted(true)

    if (!draft) {
      const errs = validate()
      if (errs.length) {
        setError(errs.join(' · '))
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }

    try {
      setLoading(true)
      setError('')

      const activeItin = itinerary[activeTab] || {}
      const from_loc = activeItin.origin || activeItin.from_city || activeItin.city || 'TBD'
      const to_loc = activeItin.destination || activeItin.to_city || activeItin.city || 'TBD'
      const start = activeItin.departure_date || activeItin.date || activeItin.check_in || new Date().toISOString().split('T')[0]
      const end = activeItin.check_out || start
      const purpose = form.trip_name || 'Business Travel'
      const paxList = activeTab === 'Bus' ? busPassengers : activeTab === 'Hotel' ? hotelPassengers : passengers

      const payload = {
        from_location: from_loc,
        to_location: to_loc,
        travel_mode: activeTab,
        booking_type: 'company',
        start_date: start,
        end_date: end,
        purpose: purpose,
        notes: form.remarks,
        estimated_travel_cost: 0,
        estimated_hotel_cost: 0,
        ...form,
        itinerary: itinerary,
        passengers: paxList
      }

      await requestsAPI.create(payload)
      setSuccess('Request saved and submitted successfully!')
      setTimeout(() => { if (onSuccess) onSuccess() }, 1500)
    } catch(err) {
      setError(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  // ----- Demo Auto Fill -----
  const handleDemoFill = () => {
    const pad = n => String(n).padStart(2, '0')
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const today     = new Date()
    const tomorrow  = addDays(today, 3)
    const dayAfter  = addDays(today, 5)
    const checkout  = addDays(today, 6)

    setForm({
      trip_name:      'Q3 Client Summit — Mumbai',
      trip_type:      'Domestic',
      project_name:   'Project Alpha',
      remarks:        'Business visit for Q3 client review and product demo',
      contact_name:   user?.name || 'Arjun Sharma',
      contact_mobile: '9876543210',
      contact_email:  user?.email || 'employee@company.in',
    })

    setItinerary({
      Flight: {
        origin:         'Chennai (MAA)',
        destination:    'Mumbai (BOM)',
        travel_type:    'One Way',
        departure_date: fmt(tomorrow),
        time_pref:      'Morning',
        class_pref:     'Economy',
        meals_pref:     'Veg',
        remarks:        'Window seat preferred',
      },
      Bus: {
        from_city:            'Chennai',
        to_city:              'Bangalore',
        date:                 fmt(tomorrow),
        bus_type:             'Volvo AC',
        departure_time_pref:  'Night (10PM–6AM)',
        remarks:              'Lower berth preferred',
      },
      Hotel: {
        city:      'Mumbai',
        check_in:  fmt(dayAfter),
        check_out: fmt(checkout),
        remarks:   'Non-smoking room, high floor preferred',
      },
    })

    setPassengers([{
      type: 'Adult', title: 'Mr', firstname: 'Arjun', lastname: 'Sharma',
      dob: '1990-05-15', passport: 'P1234567', nationality: 'IN',
      issuing_country: 'IN', passport_expiry: '2030-05-14',
    }])

    setBusPassengers([{
      type: 'Adult', title: 'Mr', firstname: 'Arjun', lastname: 'Sharma', age: '34',
    }])

    setHotelPassengers([{
      room_no: 1, paxtype: 'Adult', title: 'Mr', firstname: 'Arjun', lastname: 'Sharma',
      address: '42 Anna Nagar West, 3rd Street', country: 'IN', state: 'Tamil Nadu',
      city: 'Chennai', postalcode: '600040', area: 'Anna Nagar', pan_number: 'ABCDE1234F',
    }])
  }

  // --- VELOCITY DESIGN SYSTEM STYLES ---
  const accent = user?.color || '#0A84FF'
  const sectionTitleStyle = { fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #F0F0F8)', marginBottom: 20 }
  const labelStyle = { fontSize: 11, color: 'var(--text-muted, #9090A8)', marginBottom: 6, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #2A2A35)', background: 'var(--bg-input, #13131A)', outline: 'none', fontSize: 14, color: 'var(--text-primary, #F0F0F8)', transition: 'border 0.2s' }
  const cardStyle = { background: 'var(--bg-card, #1A1A22)', borderRadius: 12, padding: 24, border: '1px solid var(--border, #2A2A35)' }
  // Returns red-border style when field is empty after a submit attempt
  const req = (val) => submitted && !String(val || '').trim()
    ? { ...inputStyle, border: '1px solid #FF453A', boxShadow: '0 0 0 2px #FF453A22' }
    : inputStyle

  if (success) return (
    <div style={{ ...cardStyle, textAlign: 'center', padding: 80, maxWidth: 600, margin: '40px auto' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#30D158', marginBottom: 8 }}>Success</div>
      <div style={{ color: 'var(--text-muted, #9090A8)' }}>{success}</div>
    </div>
  )

  return (
    <div className="fade-up" style={{ maxWidth: 1200, margin: '0 auto', color: 'var(--text-body, #E2E2E8)' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => onSuccess && onSuccess()}
          style={{ background: 'var(--bg-card, #1A1A22)', border: '1px solid var(--border, #2A2A35)', color: 'var(--text-primary, #F0F0F8)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #F0F0F8)' }}>Draft Travel Request</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #9090A8)', marginTop: 4 }}>Company booked travel workflows</div>
        </div>
        <button
          onClick={handleDemoFill}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg,#FF9F0A22,#FF6B0018)',
            border: '1px solid #FF9F0A55', borderRadius: 8,
            color: '#FF9F0A', padding: '9px 18px', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.3px', whiteSpace: 'nowrap'
          }}
        >
          ⚡ Demo Auto Fill
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        {/* LEFT: Trip Information */}
        <div style={{ ...cardStyle, flex: 2 }}>
          <div style={sectionTitleStyle}>Trip Information</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Trip Name *</label>
              <input style={req(form.trip_name)} value={form.trip_name} onChange={e => set('trip_name', e.target.value)} placeholder="e.g. Q3 Client Summit" />
            </div>
            <div>
              <label style={labelStyle}>Trip Type</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ flex: 1, padding: 12, background: form.trip_type === 'Domestic' ? `${accent}15` : 'var(--bg-input, #13131A)', border: `1px solid ${form.trip_type === 'Domestic' ? accent : 'var(--border, #2A2A35)'}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}>
                  <input type="radio" checked={form.trip_type === 'Domestic'} onChange={() => set('trip_type', 'Domestic')} style={{ accentColor: accent }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: form.trip_type === 'Domestic' ? accent : '#E2E2E8' }}>Domestic</div>
                  </div>
                </label>
                <label style={{ flex: 1, padding: 12, background: form.trip_type === 'International' ? `${accent}15` : 'var(--bg-input, #13131A)', border: `1px solid ${form.trip_type === 'International' ? accent : 'var(--border, #2A2A35)'}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}>
                  <input type="radio" checked={form.trip_type === 'International'} onChange={() => set('trip_type', 'International')} style={{ accentColor: accent }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: form.trip_type === 'International' ? accent : '#E2E2E8' }}>International</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Approval flow — read-only, sequential, sourced from Employee Creation */}
          <div style={{
            marginBottom: 20, padding: '12px 14px', borderRadius: 8,
            background: 'var(--bg-input, #13131A)', border: '1px solid var(--border, #2A2A35)',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: approverRoles.length ? 10 : 0, gap: 10, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🔀</span>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform:'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary, #F0F0F8)' }}>
                  Sequential Approval Flow
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #9090A8)' }}>
                  · lowest → highest authority
                </span>
              </div>
              {approverRoles.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: accent, background: `${accent}18`, border: `1px solid ${accent}40`,
                  padding: '3px 8px', borderRadius: 999,
                }}>{approverRoles.length}-step flow</span>
              )}
            </div>
            {approverRoles.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {approverRoles.map((name, i) => (
                  <span key={name} style={{ display:'inline-flex', alignItems:'center', gap: 6 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #F0F0F8)',
                      background: 'var(--bg-card, #1A1A22)', border: '1px solid var(--border, #2A2A35)',
                      padding: '4px 10px', borderRadius: 999, display:'inline-flex', alignItems:'center', gap: 6,
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: accent, background: `${accent}18`, padding:'1px 5px', borderRadius: 3 }}>
                        {i + 1}
                      </span>
                      {name}
                    </span>
                    {i < approverRoles.length - 1 && <span style={{ color: 'var(--text-muted, #9090A8)', fontWeight: 700 }}>→</span>}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#FF9F0A' }}>
                ⚠️ No approvers configured on your profile — contact your administrator.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Project</label>
              <select style={inputStyle} value={form.project_name} onChange={e => set('project_name', e.target.value)}>
                {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Remarks</label>
              <input style={inputStyle} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Additional context..." />
            </div>
          </div>
        </div>

        {/* RIGHT: Contact Information */}
        <div style={{ ...cardStyle, flex: 1 }}>
          <div style={sectionTitleStyle}>Primary Contact</div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Contact Name *</label>
            <input style={req(form.contact_name)} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Mobile *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, width: 70, textAlign: 'center' }} placeholder="+91" />
              <input style={{ ...req(form.contact_mobile), flex: 1 }} value={form.contact_mobile} onChange={e => set('contact_mobile', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input style={req(form.contact_email)} value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          </div>
        </div>
      </div>

      {/* ITINERARY TABS */}
      <div style={{ ...cardStyle, marginBottom: 24, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #2A2A35', padding: '0 16px', background: 'var(--bg-input, #13131A)' }}>
          {['Flight', 'Bus', 'Hotel'].map(mode => (
            <div 
              key={mode} 
              onClick={() => setActiveTab(mode)}
              style={{ 
                padding: '16px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: activeTab === mode ? `3px solid ${accent}` : '3px solid transparent',
                color: activeTab === mode ? accent : 'var(--text-faint, #666)',
                fontWeight: activeTab === mode ? 600 : 500,
                transition: 'all .2s'
              }}
            >
              <div style={{ fontSize: 16 }}>{mode==='Flight'?'✈️':mode==='Bus'?'🚌':'🏨'}</div>
              <div>Add {mode}</div>
            </div>
          ))}
        </div>

        {/* DYNAMIC ITINERARY FORM */}
        <div style={{ padding: 24 }}>
          {activeTab === 'Flight' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                <div><label style={labelStyle}>Origin *</label><input style={req(itinerary.Flight.origin)} placeholder="DEL" value={itinerary.Flight.origin} onChange={e=>setItin('Flight', 'origin', e.target.value)} /></div>
                <div><label style={labelStyle}>Destination *</label><input style={req(itinerary.Flight.destination)} placeholder="BOM" value={itinerary.Flight.destination} onChange={e=>setItin('Flight', 'destination', e.target.value)} /></div>
                <div>
                  <label style={labelStyle}>Travel Type *</label>
                  <select style={req(itinerary.Flight.travel_type)} value={itinerary.Flight.travel_type} onChange={e=>setItin('Flight', 'travel_type', e.target.value)}>
                    <option value="">-- Select --</option>
                    <option value="One Way">One Way</option>
                    <option value="Round Trip">Round Trip</option>
                  </select>
                </div>
                <div><label style={labelStyle}>Departure Date *</label><input type="date" style={{...req(itinerary.Flight.departure_date), colorScheme: 'dark'}} value={itinerary.Flight.departure_date} onChange={e=>setItin('Flight', 'departure_date', e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Time Preference</label>
                  <select style={inputStyle} value={itinerary.Flight.time_pref} onChange={e=>setItin('Flight', 'time_pref', e.target.value)}>
                    <option value="">Any Time</option>
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Class</label>
                  <select style={inputStyle} value={itinerary.Flight.class_pref} onChange={e=>setItin('Flight', 'class_pref', e.target.value)}>
                    <option value="">Economy</option>
                    <option value="Business">Business</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Meals</label>
                  <select style={inputStyle} value={itinerary.Flight.meals_pref} onChange={e=>setItin('Flight', 'meals_pref', e.target.value)}>
                    <option value="">Not Required</option>
                    <option value="Veg">Vegetarian</option>
                    <option value="Non-Veg">Non-Vegetarian</option>
                  </select>
                </div>
                <div><label style={labelStyle}>Remarks</label><input style={inputStyle} placeholder="Seat preferences..." value={itinerary.Flight.remarks} onChange={e=>setItin('Flight', 'remarks', e.target.value)} /></div>
              </div>
            </>
          )}

          {activeTab === 'Bus' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                <div><label style={labelStyle}>From City *</label><input style={req(itinerary.Bus.from_city)} placeholder="e.g. Chennai" value={itinerary.Bus.from_city} onChange={e=>setItin('Bus', 'from_city', e.target.value)} /></div>
                <div><label style={labelStyle}>To City *</label><input style={req(itinerary.Bus.to_city)} placeholder="e.g. Bangalore" value={itinerary.Bus.to_city} onChange={e=>setItin('Bus', 'to_city', e.target.value)} /></div>
                <div><label style={labelStyle}>Date *</label><input type="date" style={{...req(itinerary.Bus.date), colorScheme: 'dark'}} value={itinerary.Bus.date} onChange={e=>setItin('Bus', 'date', e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Bus Types *</label>
                  <select style={req(itinerary.Bus.bus_type)} value={itinerary.Bus.bus_type} onChange={e=>setItin('Bus', 'bus_type', e.target.value)}>
                    <option value="">-- Select --</option>
                    <option value="AC Sleeper">AC Sleeper</option>
                    <option value="AC Semi-Sleeper">AC Semi-Sleeper</option>
                    <option value="AC Seater">AC Seater</option>
                    <option value="Non-AC Sleeper">Non-AC Sleeper</option>
                    <option value="Non-AC Semi-Sleeper">Non-AC Semi-Sleeper</option>
                    <option value="Non-AC Seater">Non-AC Seater</option>
                    <option value="Volvo AC">Volvo AC</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Departure Time Preferences</label>
                  <select style={inputStyle} value={itinerary.Bus.departure_time_pref} onChange={e=>setItin('Bus', 'departure_time_pref', e.target.value)}>
                    <option value="">Any Time</option>
                    <option value="Morning (6AM–12PM)">Morning (6AM–12PM)</option>
                    <option value="Afternoon (12PM–6PM)">Afternoon (12PM–6PM)</option>
                    <option value="Evening (6PM–10PM)">Evening (6PM–10PM)</option>
                    <option value="Night (10PM–6AM)">Night (10PM–6AM)</option>
                  </select>
                </div>
                <div><label style={labelStyle}>Remarks (Optional)</label><input style={inputStyle} placeholder="Seat preferences..." value={itinerary.Bus.remarks} onChange={e=>setItin('Bus', 'remarks', e.target.value)} /></div>
              </div>
            </>
          )}

          {activeTab === 'Hotel' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div><label style={labelStyle}>Location *</label><input style={req(itinerary.Hotel.city)} placeholder="e.g. Mumbai" value={itinerary.Hotel.city} onChange={e=>setItin('Hotel', 'city', e.target.value)} /></div>
                <div><label style={labelStyle}>Check-In Date *</label><input type="date" style={{...req(itinerary.Hotel.check_in), colorScheme: 'dark'}} value={itinerary.Hotel.check_in} onChange={e=>setItin('Hotel', 'check_in', e.target.value)} /></div>
                <div><label style={labelStyle}>Check-Out Date *</label><input type="date" style={{...req(itinerary.Hotel.check_out), colorScheme: 'dark'}} value={itinerary.Hotel.check_out} onChange={e=>setItin('Hotel', 'check_out', e.target.value)} /></div>
                <div><label style={labelStyle}>Remarks (Optional)</label><input style={inputStyle} placeholder="Room preferences..." value={itinerary.Hotel.remarks} onChange={e=>setItin('Hotel', 'remarks', e.target.value)} /></div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* PASSENGER DETAILS TABLE — switches by activeTab */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={sectionTitleStyle}>Passenger Roster</div>
          <button
            onClick={(e) => { e.preventDefault(); activeTab === 'Bus' ? addBusPax() : activeTab === 'Hotel' ? addHotelPax() : addPassenger() }}
            style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55`, borderRadius: 6, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            + Add Passenger
          </button>
        </div>

        {/* ── FLIGHT passengers ── */}
        {activeTab === 'Flight' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted, #9090A8)', borderBottom: '1px solid #2A2A35', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {['Type','Title','Firstname','Lastname','DOB','Passport','Nationality','Expiry',''].map(h => (
                    <th key={h} style={{ padding: '0 8px 12px', textAlign: h ? 'left' : 'center', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passengers.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: idx===passengers.length-1 ? 'none' : '1px solid #1f1f2a' }}>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding: '8px', fontSize: 13}} value={p.type} onChange={e => updatePassenger(idx, 'type', e.target.value)}><option>Adult</option><option>Child</option></select></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding: '8px', fontSize: 13}} value={p.title} onChange={e => updatePassenger(idx, 'title', e.target.value)}><option>Mr</option><option>Ms</option><option>Mrs</option></select></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.firstname), padding: '8px', fontSize: 13}} placeholder="John" value={p.firstname} onChange={e => updatePassenger(idx, 'firstname', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.lastname), padding: '8px', fontSize: 13}} placeholder="Doe" value={p.lastname} onChange={e => updatePassenger(idx, 'lastname', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input type="date" style={{...inputStyle, padding: '8px', fontSize: 13, colorScheme: 'dark'}} value={p.dob} onChange={e => updatePassenger(idx, 'dob', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13}} placeholder="A123..." value={p.passport} onChange={e => updatePassenger(idx, 'passport', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13}} placeholder="IN" value={p.nationality} onChange={e => updatePassenger(idx, 'nationality', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input type="date" style={{...inputStyle, padding: '8px', fontSize: 13, colorScheme: 'dark'}} value={p.passport_expiry} onChange={e => updatePassenger(idx, 'passport_expiry', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                      {passengers.length > 1 ? <button onClick={(e) => { e.preventDefault(); removePassenger(idx) }} style={{ border: 'none', background: 'none', color: '#FF453A', cursor: 'pointer', fontSize: 16 }}>×</button> : <span style={{ color: 'var(--text-dim, #666)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── BUS passengers ── */}
        {activeTab === 'Bus' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted, #9090A8)', borderBottom: '1px solid #2A2A35', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {['Type','Title','Firstname','Lastname','Age',''].map(h => (
                    <th key={h} style={{ padding: '0 8px 12px', textAlign: h ? 'left' : 'center', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {busPassengers.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: idx===busPassengers.length-1 ? 'none' : '1px solid #1f1f2a' }}>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding: '8px', fontSize: 13}} value={p.type} onChange={e => updateBusPax(idx, 'type', e.target.value)}><option>Adult</option><option>Child</option><option>Infant</option></select></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding: '8px', fontSize: 13}} value={p.title} onChange={e => updateBusPax(idx, 'title', e.target.value)}><option>Mr</option><option>Ms</option><option>Mrs</option></select></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.firstname), padding: '8px', fontSize: 13}} placeholder="John" value={p.firstname} onChange={e => updateBusPax(idx, 'firstname', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.lastname), padding: '8px', fontSize: 13}} placeholder="Doe" value={p.lastname} onChange={e => updateBusPax(idx, 'lastname', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13, width: 70}} placeholder="25" value={p.age} onChange={e => updateBusPax(idx, 'age', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                      {busPassengers.length > 1 ? <button onClick={(e) => { e.preventDefault(); removeBusPax(idx) }} style={{ border: 'none', background: 'none', color: '#FF453A', cursor: 'pointer', fontSize: 16 }}>×</button> : <span style={{ color: 'var(--text-dim, #666)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── HOTEL passengers ── */}
        {activeTab === 'Hotel' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted, #9090A8)', borderBottom: '1px solid #2A2A35', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {['Room No','Paxtype','Title','Firstname','Lastname','Address','Country','State','City','Postalcode','Area','PAN Number',''].map(h => (
                    <th key={h} style={{ padding: '0 8px 12px', textAlign: h ? 'left' : 'center', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hotelPassengers.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: idx===hotelPassengers.length-1 ? 'none' : '1px solid #1f1f2a' }}>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13, width: 60}} value={p.room_no} onChange={e => updateHotelPax(idx, 'room_no', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding: '8px', fontSize: 13}} value={p.paxtype} onChange={e => updateHotelPax(idx, 'paxtype', e.target.value)}><option>Adult</option><option>Child</option></select></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding: '8px', fontSize: 13}} value={p.title} onChange={e => updateHotelPax(idx, 'title', e.target.value)}><option>Mr</option><option>Ms</option><option>Mrs</option></select></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.firstname), padding: '8px', fontSize: 13}} placeholder="John" value={p.firstname} onChange={e => updateHotelPax(idx, 'firstname', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.lastname), padding: '8px', fontSize: 13}} placeholder="Doe" value={p.lastname} onChange={e => updateHotelPax(idx, 'lastname', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13}} placeholder="123 Street..." value={p.address} onChange={e => updateHotelPax(idx, 'address', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13, width: 60}} placeholder="IN" value={p.country} onChange={e => updateHotelPax(idx, 'country', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13}} placeholder="Tamil Nadu" value={p.state} onChange={e => updateHotelPax(idx, 'state', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13}} placeholder="Chennai" value={p.city} onChange={e => updateHotelPax(idx, 'city', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13, width: 80}} placeholder="600001" value={p.postalcode} onChange={e => updateHotelPax(idx, 'postalcode', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13}} placeholder="Anna Nagar" value={p.area} onChange={e => updateHotelPax(idx, 'area', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding: '8px', fontSize: 13}} placeholder="ABCDE1234F" value={p.pan_number} onChange={e => updateHotelPax(idx, 'pan_number', e.target.value)} /></td>
                    <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                      {hotelPassengers.length > 1 ? <button onClick={(e) => { e.preventDefault(); removeHotelPax(idx) }} style={{ border: 'none', background: 'none', color: '#FF453A', cursor: 'pointer', fontSize: 16 }}>×</button> : <span style={{ color: 'var(--text-dim, #666)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <Alert type="error" style={{ marginBottom: 24 }}>{error}</Alert>}

      {/* BOTTOM ACTION BAR */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 40 }}>
        <button 
          onClick={(e) => { e.preventDefault(); if(onSuccess) onSuccess() }}
          style={{ padding: '12px 28px', borderRadius: 8, background: 'var(--bg-input, #13131A)', color: 'var(--text-muted, #9090A8)', border: '1px solid var(--border, #2A2A35)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
        >Cancel</button>

        <button
          onClick={(e) => { e.preventDefault(); handleSubmit(true) }}
          style={{ padding: '12px 28px', borderRadius: 8, background: 'var(--bg-card, #1A1A22)', color: 'var(--text-primary, #F0F0F8)', border: '1px solid var(--border, #2A2A35)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
        >Save Draft</button>
        
        <button 
          disabled={loading}
          onClick={(e) => { e.preventDefault(); handleSubmit() }}
          style={{ padding: '12px 32px', borderRadius: 8, background: accent, color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {loading ? <Spinner size={16} /> : 'Submit Request'}
          {!loading && '→'}
        </button>
      </div>

    </div>
  )
}
