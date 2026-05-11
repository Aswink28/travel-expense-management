import { useState } from 'react'
import { employeesAPI, requestsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Alert, Spinner } from '../shared/UI'

const PROJECTS = ['Not Applicable', 'Project Alpha', 'Project Beta', 'Internal Operations']

export default function AdminCreateRequest() {
  const { user: admin } = useAuth()
  const accent = admin?.color || 'var(--accent)'

  // ── Phase state ──
  const [employee, setEmployee] = useState(null)   // fetched employee data
  const [empSearch, setEmpSearch] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')

  // ── Form state ──
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ── Employee Lookup ──
  const handleLookup = async () => {
    const q = empSearch.trim()
    if (!q) return setLookupError('Please enter an Employee ID')
    try {
      setLookupLoading(true)
      setLookupError('')
      const res = await employeesAPI.lookup(q)
      setEmployee(res.data)
    } catch (e) {
      setLookupError(e.message || 'Employee not found')
      setEmployee(null)
    } finally {
      setLookupLoading(false)
    }
  }

  const handleChangeEmployee = () => {
    setEmployee(null)
    setEmpSearch('')
    setLookupError('')
    setError('')
    setSuccess('')
  }

  // ── Derive tier policy + approval from fetched employee ──
  const tierPolicy = employee?.tier_policy || null
  const approverRoles = (Array.isArray(employee?.approver_roles) ? employee.approver_roles : [])
  const approverChain = employee?.approver_chain || []
  const canAddPassenger = !!tierPolicy?.allow_extra_passenger
  const modeAllowed = (mode) => {
    if (!tierPolicy?.allowed_modes) return true
    return !!tierPolicy.allowed_modes[mode]
  }
  const allowedFlightClasses = tierPolicy?.flight_classes || ['Economy', 'Premium Economy', 'Business', 'First Class']
  const allowedTrainClasses  = tierPolicy?.train_classes  || ['Sleeper', '3AC', '2AC', '1AC', 'Executive']
  const allowedBusTypes      = tierPolicy?.bus_types      || ['Volvo', 'Luxury', 'Sleeper', 'AC Sleeper', 'AC Seater', 'Non-AC Seater']

  const effectiveFlow = (employee?.effective_approval_flow || 'SEQUENTIAL').toUpperCase()
  const effectiveType = (employee?.effective_approval_type || 'ALL').toUpperCase()
  const isParallel = effectiveFlow === 'PARALLEL'
  const isAnyOne   = isParallel && effectiveType === 'ANY_ONE'

  // ── Trip Form State ──
  const [form, setForm] = useState({
    trip_name: '', trip_type: 'Domestic', project_name: 'Not Applicable', remarks: '',
    contact_name: '', contact_mobile: '', contact_email: '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Reset contact fields when employee changes
  const resetFormForEmployee = (emp) => {
    setForm(f => ({
      ...f,
      contact_name:   emp.name   || '',
      contact_mobile: emp.mobile_number || '',
      contact_email:  emp.email  || '',
    }))
  }

  // ── Itinerary State ──
  const firstAllowed = employee ? (['Flight', 'Train', 'Bus', 'Hotel'].find(modeAllowed) || 'Flight') : 'Flight'
  const [activeTab, setActiveTab] = useState(firstAllowed)
  const [itinerary, setItinerary] = useState({
    Flight: { origin: '', destination: '', travel_type: '', departure_date: '', time_pref: '', class_pref: '', meals_pref: '', remarks: '' },
    Train:  { origin: '', destination: '', travel_type: '', departure_date: '', time_pref: '', class_pref: '', remarks: '' },
    Bus:    { from_city: '', to_city: '', date: '', bus_type: '', departure_time_pref: '', remarks: '' },
    Hotel:  { city: '', check_in: '', check_out: '', remarks: '' },
  })
  const setItin = (tab, k, v) => setItinerary(p => ({ ...p, [tab]: { ...p[tab], [k]: v } }))

  // ── Passenger States ──
  const [passengers, setPassengers] = useState([
    { type: 'Adult', title: 'Mr', firstname: '', lastname: '', dob: '', passport: '', nationality: 'IN', issuing_country: 'IN', passport_expiry: '' }
  ])
  const updatePassenger = (i, k, v) => setPassengers(p => { const n=[...p]; n[i][k]=v; return n })
  const addPassenger    = () => setPassengers(p => [...p, { type:'Adult', title:'Mr', firstname:'', lastname:'', dob:'', passport:'', nationality:'IN', issuing_country:'IN', passport_expiry:'' }])
  const removePassenger = (i) => setPassengers(p => p.filter((_,x)=>x!==i))

  const [busPassengers, setBusPassengers] = useState([
    { type: 'Adult', title: 'Mr', firstname: '', lastname: '', age: '' }
  ])
  const updateBusPax = (i, k, v) => setBusPassengers(p => { const n=[...p]; n[i][k]=v; return n })
  const addBusPax    = () => setBusPassengers(p => [...p, { type:'Adult', title:'Mr', firstname:'', lastname:'', age:'' }])
  const removeBusPax = (i) => setBusPassengers(p => p.filter((_,x)=>x!==i))

  const [hotelPassengers, setHotelPassengers] = useState([
    { room_no: 1, paxtype: 'Adult', title: 'Mr', firstname: '', lastname: '', address: '', country: 'IN', state: '', city: '', postalcode: '', area: '', pan_number: '' }
  ])
  const updateHotelPax = (i, k, v) => setHotelPassengers(p => { const n=[...p]; n[i][k]=v; return n })
  const addHotelPax    = () => setHotelPassengers(p => [...p, { room_no: p.length+1, paxtype:'Adult', title:'Mr', firstname:'', lastname:'', address:'', country:'IN', state:'', city:'', postalcode:'', area:'', pan_number:'' }])
  const removeHotelPax = (i) => setHotelPassengers(p => p.filter((_,x)=>x!==i))

  // ── Validation ──
  const [submitted, setSubmitted] = useState(false)
  const validate = () => {
    const errs = []
    const itin = itinerary[activeTab] || {}
    if (!form.trip_name.trim()) errs.push('Trip Name is required')
    if (!modeAllowed(activeTab)) errs.push(`${activeTab} is not allowed for the employee's tier.`)
    if (activeTab === 'Flight') {
      if (!itin.origin.trim())      errs.push('Flight: Origin is required')
      if (!itin.destination.trim()) errs.push('Flight: Destination is required')
      if (!itin.travel_type)        errs.push('Flight: Travel Type is required')
      if (!itin.departure_date)     errs.push('Flight: Departure Date is required')
    }
    if (activeTab === 'Train') {
      if (!itin.origin.trim())      errs.push('Train: Origin is required')
      if (!itin.destination.trim()) errs.push('Train: Destination is required')
      if (!itin.travel_type)        errs.push('Train: Travel Type is required')
      if (!itin.departure_date)     errs.push('Train: Departure Date is required')
      if (!itin.class_pref)         errs.push('Train: Class is required')
    }
    if (activeTab === 'Bus') {
      if (!itin.from_city.trim())   errs.push('Bus: From City is required')
      if (!itin.to_city.trim())     errs.push('Bus: To City is required')
      if (!itin.date)               errs.push('Bus: Travel Date is required')
      if (!itin.bus_type)           errs.push('Bus: Bus Type is required')
    }
    if (activeTab === 'Hotel') {
      if (!itin.city.trim())        errs.push('Hotel: Location is required')
      if (!itin.check_in)           errs.push('Hotel: Check-In Date is required')
      if (!itin.check_out)          errs.push('Hotel: Check-Out Date is required')
      if (itin.check_in && itin.check_out && itin.check_out <= itin.check_in)
        errs.push('Hotel: Check-Out must be after Check-In')
    }
    if (canAddPassenger) {
      const paxList = (activeTab === 'Bus' || activeTab === 'Train') ? busPassengers : activeTab === 'Hotel' ? hotelPassengers : passengers
      paxList.forEach((p, i) => {
        if (!p.firstname?.trim()) errs.push(`Passenger ${i + 1}: First Name is required`)
        if (!p.lastname?.trim())  errs.push(`Passenger ${i + 1}: Last Name is required`)
      })
    }
    return errs
  }

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitted(true)
    const errs = validate()
    if (errs.length) {
      setError(errs.join(' · '))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    try {
      setLoading(true)
      setError('')
      const activeItin = itinerary[activeTab] || {}
      const from_loc = activeItin.origin || activeItin.from_city || activeItin.city || 'TBD'
      const to_loc   = activeItin.destination || activeItin.to_city || activeItin.city || 'TBD'
      const start    = activeItin.departure_date || activeItin.date || activeItin.check_in || new Date().toISOString().split('T')[0]
      const end      = activeItin.check_out || start
      const paxList  = !canAddPassenger ? []
                     : (activeTab === 'Bus' || activeTab === 'Train') ? busPassengers
                     : activeTab === 'Hotel' ? hotelPassengers
                     : passengers

      const payload = {
        from_location: from_loc,
        to_location:   to_loc,
        travel_mode:   activeTab,
        booking_type:  'company',
        start_date:    start,
        end_date:      end,
        purpose:       form.trip_name || 'Business Travel',
        notes:         form.remarks,
        estimated_travel_cost: 0,
        estimated_hotel_cost:  0,
        ...form,
        itinerary,
        passengers: paxList,
        on_behalf_of: employee.id,
      }
      await requestsAPI.create(payload)
      setSuccess(`Request submitted successfully on behalf of ${employee.name} (${employee.emp_id})!`)
    } catch (err) {
      setError(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Styles (matching NewRequestForm velocity design) ──
  const sectionTitleStyle = {
    fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700,
    color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 20,
    display: 'flex', alignItems: 'center', gap: 10,
  }
  const labelStyle = {
    fontSize: 11, color: 'var(--text-muted)', marginBottom: 6,
    display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  }
  const inputStyle = {
    width: '100%', padding: '11px 13px', borderRadius: 8,
    border: '1px solid var(--border-input)', background: 'var(--bg-input)',
    outline: 'none', fontSize: 14, color: 'var(--text-primary)',
    fontFamily: "'Inter', sans-serif", transition: 'border-color 0.18s, box-shadow 0.18s',
  }
  const cardStyle = {
    background: 'var(--bg-card)', borderRadius: 16, padding: 28,
    border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)',
    transition: 'border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease',
  }
  const req = (val) => submitted && !String(val || '').trim()
    ? { ...inputStyle, border: '1px solid var(--danger)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--danger) 13%, transparent)' }
    : inputStyle

  // ── Success screen ──
  if (success) return (
    <div style={{ ...cardStyle, textAlign: 'center', padding: 80, maxWidth: 600, margin: '40px auto' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>&#10004;&#65039;</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-success)', marginBottom: 8 }}>Success</div>
      <div style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{success}</div>
      <button onClick={handleChangeEmployee} style={{ padding: '10px 24px', borderRadius: 8, background: accent, color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
        Create Another Request
      </button>
    </div>
  )

  // ════════════════════════════════════════════════════════════
  //  PHASE 1 — Employee Lookup
  // ════════════════════════════════════════════════════════════
  if (!employee) return (
    <div className="fade-up page-admin page-admin-create" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="page-hero" style={{ marginBottom: 24 }}>
        <div className="page-hero-content">
          <h1 className="page-hero-title">Create Request On Behalf</h1>
          <p className="page-hero-sub">Look up an employee to create a travel request on their behalf</p>
        </div>
      </div>

      <div className="form-card" style={cardStyle}>
        <div style={sectionTitleStyle}>Employee Lookup</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={empSearch}
            onChange={e => setEmpSearch(e.target.value)}
            placeholder="Enter Employee ID (e.g. EMP001)"
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            autoFocus
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading}
            style={{
              padding: '11px 24px', borderRadius: 8, background: accent, color: '#fff',
              border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              opacity: lookupLoading ? 0.7 : 1, whiteSpace: 'nowrap',
            }}
          >
            {lookupLoading ? <Spinner size={16} /> : 'Search'}
          </button>
        </div>
        {lookupError && <Alert type="error">{lookupError}</Alert>}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Enter the employee's unique ID to fetch their profile, tier policy, and approval chain.
          The request will be owned by the employee and routed through their configured approvers.
        </div>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════
  //  PHASE 2 — Request Form (employee selected)
  // ════════════════════════════════════════════════════════════

  // Ensure contact fields are synced when employee first loads
  if (form.contact_name === '' && employee.name) {
    resetFormForEmployee(employee)
  }

  return (
    <div className="fade-up page-admin page-admin-create" style={{ maxWidth: 1200, margin: '0 auto', color: 'var(--text-body)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button onClick={handleChangeEmployee}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
          &larr;
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>Create Request On Behalf</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Creating for <strong style={{ color: accent }}>{employee.name}</strong> ({employee.emp_id}) &middot; {employee.department}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: accent, background: `${accent}18`, border: `1px solid ${accent}40`,
          padding: '5px 12px', borderRadius: 999,
        }}>On Behalf</span>
      </div>

      {/* Employee Summary Card */}
      <div className="form-card" style={{ ...cardStyle, marginBottom: 24, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `${accent}18`, color: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700,
          }}>
            {employee.avatar || employee.name?.charAt(0) || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{employee.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {employee.emp_id} &middot; {employee.designation || employee.role} &middot; {employee.department}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {tierPolicy && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {tierPolicy.tier_name}
              </span>
            )}
            {employee.wallet_balance != null && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)', color: 'var(--text-success)' }}>
                Wallet: &#8377;{Number(employee.wallet_balance).toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <button onClick={handleChangeEmployee}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }}>
            Change Employee
          </button>
        </div>
      </div>

      {/* Trip Information + Contact */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div className="form-card" style={{ ...cardStyle, flex: 2 }}>
          <div style={sectionTitleStyle}>Trip Information</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Trip Name *</label>
              <input style={req(form.trip_name)} value={form.trip_name} onChange={e => set('trip_name', e.target.value)} placeholder="e.g. Q3 Client Summit" />
            </div>
            <div>
              <label style={labelStyle}>Trip Type</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {['Domestic', 'International'].map(t => (
                  <label key={t} style={{ flex: 1, padding: 12, background: form.trip_type === t ? `${accent}15` : 'var(--bg-input)', border: `1px solid ${form.trip_type === t ? accent : 'var(--border-input)'}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}>
                    <input type="radio" checked={form.trip_type === t} onChange={() => set('trip_type', t)} style={{ accentColor: accent }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: form.trip_type === t ? accent : 'var(--text-body)' }}>{t}</div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Approval Flow — employee's chain */}
          <div style={{
            marginBottom: 20, padding: '12px 14px', borderRadius: 8,
            background: 'var(--bg-input)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: approverChain.length ? 10 : 0, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14 }}>{isParallel ? '\u21F6' : '\uD83D\uDD00'}</span>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
                  {isParallel ? 'Parallel' : 'Sequential'} Approval Flow
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  (Employee's chain)
                </span>
              </div>
              {approverChain.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: accent, background: `${accent}18`, border: `1px solid ${accent}40`, padding: '3px 8px', borderRadius: 999 }}>
                  {approverChain.length}-step flow
                </span>
              )}
            </div>
            {approverChain.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {approverChain.map((step, i) => (
                  <span key={step.id || i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      padding: '4px 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: accent, background: `${accent}18`, padding: '1px 5px', borderRadius: 3 }}>
                        {i + 1}
                      </span>
                      {step.primary_name || step.step_designation}
                    </span>
                    {i < approverChain.length - 1 && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{isParallel ? '\u00B7' : '\u2192'}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : approverRoles.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {approverRoles.map((name, i) => (
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: accent, background: `${accent}18`, padding: '1px 5px', borderRadius: 3 }}>{i + 1}</span>
                      {name}
                    </span>
                    {i < approverRoles.length - 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{isParallel ? '\u00B7' : '\u2192'}</span>}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-warning)' }}>
                No approvers configured for this employee.
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

        {/* Contact Information — from employee profile, read-only */}
        <div className="form-card" style={{ ...cardStyle, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={sectionTitleStyle}>Primary Contact</div>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: 999 }}>
              employee profile &middot; read-only
            </span>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Contact Name</label>
            <input style={{ ...inputStyle, opacity: 0.85, cursor: 'not-allowed' }} value={form.contact_name} readOnly tabIndex={-1} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Mobile</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, width: 70, textAlign: 'center', opacity: 0.85, cursor: 'not-allowed' }} value="+91" readOnly tabIndex={-1} />
              <input style={{ ...inputStyle, flex: 1, opacity: 0.85, cursor: 'not-allowed' }} value={form.contact_mobile} readOnly tabIndex={-1} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={{ ...inputStyle, opacity: 0.85, cursor: 'not-allowed' }} value={form.contact_email} readOnly tabIndex={-1} />
          </div>
        </div>
      </div>

      {/* Itinerary Tabs */}
      <div className="form-card" style={{ ...cardStyle, marginBottom: 24, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-input)', padding: '0 16px', background: 'var(--bg-input)' }}>
          {['Flight', 'Train', 'Bus', 'Hotel'].map(mode => {
            const allowed = modeAllowed(mode)
            const isActive = activeTab === mode
            return (
              <div key={mode} onClick={() => allowed && setActiveTab(mode)}
                title={allowed ? '' : `${mode} is not allowed for this employee's tier.`}
                style={{
                  padding: '16px 24px', cursor: allowed ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: isActive && allowed ? `3px solid ${accent}` : '3px solid transparent',
                  color: !allowed ? 'var(--text-faint)' : isActive ? accent : 'var(--text-faint)',
                  fontWeight: isActive ? 600 : 500, opacity: allowed ? 1 : 0.45, transition: 'all .2s', position: 'relative',
                }}>
                <div>Book {mode}</div>
                {!allowed && <span style={{ fontSize: 11, marginLeft: 4 }}>&#128274;</span>}
              </div>
            )
          })}
        </div>

        <div style={{ padding: 24 }}>
          {activeTab === 'Flight' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                <div><label style={labelStyle}>Origin *</label><input style={req(itinerary.Flight.origin)} placeholder="DEL" value={itinerary.Flight.origin} onChange={e=>setItin('Flight','origin',e.target.value)} /></div>
                <div><label style={labelStyle}>Destination *</label><input style={req(itinerary.Flight.destination)} placeholder="BOM" value={itinerary.Flight.destination} onChange={e=>setItin('Flight','destination',e.target.value)} /></div>
                <div><label style={labelStyle}>Travel Type *</label><select style={req(itinerary.Flight.travel_type)} value={itinerary.Flight.travel_type} onChange={e=>setItin('Flight','travel_type',e.target.value)}><option value="">-- Select --</option><option value="One Way">One Way</option><option value="Round Trip">Round Trip</option></select></div>
                <div><label style={labelStyle}>Departure Date *</label><input type="date" style={{...req(itinerary.Flight.departure_date), colorScheme:'dark'}} value={itinerary.Flight.departure_date} onChange={e=>setItin('Flight','departure_date',e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div><label style={labelStyle}>Time Preference</label><select style={inputStyle} value={itinerary.Flight.time_pref} onChange={e=>setItin('Flight','time_pref',e.target.value)}><option value="">Any Time</option><option value="Morning">Morning</option><option value="Evening">Evening</option></select></div>
                <div><label style={labelStyle}>Class</label><select style={inputStyle} value={itinerary.Flight.class_pref} onChange={e=>setItin('Flight','class_pref',e.target.value)}><option value="">&#8212; Any allowed &#8212;</option>{allowedFlightClasses.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={labelStyle}>Meals</label><select style={inputStyle} value={itinerary.Flight.meals_pref} onChange={e=>setItin('Flight','meals_pref',e.target.value)}><option value="">Not Required</option><option value="Veg">Vegetarian</option><option value="Non-Veg">Non-Vegetarian</option></select></div>
                <div><label style={labelStyle}>Remarks</label><input style={inputStyle} placeholder="Seat preferences..." value={itinerary.Flight.remarks} onChange={e=>setItin('Flight','remarks',e.target.value)} /></div>
              </div>
            </>
          )}

          {activeTab === 'Train' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                <div><label style={labelStyle}>Origin *</label><input style={req(itinerary.Train.origin)} placeholder="MAS" value={itinerary.Train.origin} onChange={e=>setItin('Train','origin',e.target.value)} /></div>
                <div><label style={labelStyle}>Destination *</label><input style={req(itinerary.Train.destination)} placeholder="SBC" value={itinerary.Train.destination} onChange={e=>setItin('Train','destination',e.target.value)} /></div>
                <div><label style={labelStyle}>Travel Type *</label><select style={req(itinerary.Train.travel_type)} value={itinerary.Train.travel_type} onChange={e=>setItin('Train','travel_type',e.target.value)}><option value="">-- Select --</option><option value="One Way">One Way</option><option value="Round Trip">Round Trip</option></select></div>
                <div><label style={labelStyle}>Departure Date *</label><input type="date" style={{...req(itinerary.Train.departure_date), colorScheme:'dark'}} value={itinerary.Train.departure_date} onChange={e=>setItin('Train','departure_date',e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div><label style={labelStyle}>Class *</label><select style={req(itinerary.Train.class_pref)} value={itinerary.Train.class_pref} onChange={e=>setItin('Train','class_pref',e.target.value)}><option value="">-- Select --</option>{allowedTrainClasses.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={labelStyle}>Time Preference</label><select style={inputStyle} value={itinerary.Train.time_pref} onChange={e=>setItin('Train','time_pref',e.target.value)}><option value="">Any Time</option><option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Evening">Evening</option><option value="Night">Night</option></select></div>
                <div><label style={labelStyle}>Remarks</label><input style={inputStyle} placeholder="Berth preferences..." value={itinerary.Train.remarks} onChange={e=>setItin('Train','remarks',e.target.value)} /></div>
              </div>
            </>
          )}

          {activeTab === 'Bus' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                <div><label style={labelStyle}>From City *</label><input style={req(itinerary.Bus.from_city)} placeholder="e.g. Chennai" value={itinerary.Bus.from_city} onChange={e=>setItin('Bus','from_city',e.target.value)} /></div>
                <div><label style={labelStyle}>To City *</label><input style={req(itinerary.Bus.to_city)} placeholder="e.g. Bangalore" value={itinerary.Bus.to_city} onChange={e=>setItin('Bus','to_city',e.target.value)} /></div>
                <div><label style={labelStyle}>Date *</label><input type="date" style={{...req(itinerary.Bus.date), colorScheme:'dark'}} value={itinerary.Bus.date} onChange={e=>setItin('Bus','date',e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div><label style={labelStyle}>Bus Type *</label><select style={req(itinerary.Bus.bus_type)} value={itinerary.Bus.bus_type} onChange={e=>setItin('Bus','bus_type',e.target.value)}><option value="">-- Select --</option>{allowedBusTypes.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                <div><label style={labelStyle}>Departure Time Preferences</label><select style={inputStyle} value={itinerary.Bus.departure_time_pref} onChange={e=>setItin('Bus','departure_time_pref',e.target.value)}><option value="">Any Time</option><option value="Morning (6AM-12PM)">Morning (6AM-12PM)</option><option value="Afternoon (12PM-6PM)">Afternoon (12PM-6PM)</option><option value="Evening (6PM-10PM)">Evening (6PM-10PM)</option><option value="Night (10PM-6AM)">Night (10PM-6AM)</option></select></div>
                <div><label style={labelStyle}>Remarks (Optional)</label><input style={inputStyle} placeholder="Seat preferences..." value={itinerary.Bus.remarks} onChange={e=>setItin('Bus','remarks',e.target.value)} /></div>
              </div>
            </>
          )}

          {activeTab === 'Hotel' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div><label style={labelStyle}>Location *</label><input style={req(itinerary.Hotel.city)} placeholder="e.g. Mumbai" value={itinerary.Hotel.city} onChange={e=>setItin('Hotel','city',e.target.value)} /></div>
              <div><label style={labelStyle}>Check-In Date *</label><input type="date" style={{...req(itinerary.Hotel.check_in), colorScheme:'dark'}} value={itinerary.Hotel.check_in} onChange={e=>setItin('Hotel','check_in',e.target.value)} /></div>
              <div><label style={labelStyle}>Check-Out Date *</label><input type="date" style={{...req(itinerary.Hotel.check_out), colorScheme:'dark'}} value={itinerary.Hotel.check_out} onChange={e=>setItin('Hotel','check_out',e.target.value)} /></div>
              <div><label style={labelStyle}>Remarks (Optional)</label><input style={inputStyle} placeholder="Room preferences..." value={itinerary.Hotel.remarks} onChange={e=>setItin('Hotel','remarks',e.target.value)} /></div>
            </div>
          )}
        </div>
      </div>

      {/* Passenger Roster — hidden entirely when the tier disables extra passengers */}
      {canAddPassenger ? (
      <div className="form-card" style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={sectionTitleStyle}>Passenger Roster</div>
          <button onClick={e => { e.preventDefault(); (activeTab === 'Bus' || activeTab === 'Train') ? addBusPax() : activeTab === 'Hotel' ? addHotelPax() : addPassenger() }}
            style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55`, borderRadius: 6, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
            + Add Passenger
          </button>
        </div>

        {/* Flight passengers */}
        {activeTab === 'Flight' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-input)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {['Type','Title','Firstname','Lastname','DOB','Passport','Nationality','Expiry',''].map(h => (
                    <th key={h} style={{ padding: '0 8px 12px', textAlign: h ? 'left' : 'center', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passengers.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: idx===passengers.length-1 ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding:'8px', fontSize:13}} value={p.type} onChange={e=>updatePassenger(idx,'type',e.target.value)}><option>Adult</option><option>Child</option></select></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding:'8px', fontSize:13}} value={p.title} onChange={e=>updatePassenger(idx,'title',e.target.value)}><option>Mr</option><option>Ms</option><option>Mrs</option></select></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.firstname), padding:'8px', fontSize:13}} placeholder="John" value={p.firstname} onChange={e=>updatePassenger(idx,'firstname',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.lastname), padding:'8px', fontSize:13}} placeholder="Doe" value={p.lastname} onChange={e=>updatePassenger(idx,'lastname',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input type="date" style={{...inputStyle, padding:'8px', fontSize:13, colorScheme:'dark'}} value={p.dob} onChange={e=>updatePassenger(idx,'dob',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13}} placeholder="A123..." value={p.passport} onChange={e=>updatePassenger(idx,'passport',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13}} placeholder="IN" value={p.nationality} onChange={e=>updatePassenger(idx,'nationality',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input type="date" style={{...inputStyle, padding:'8px', fontSize:13, colorScheme:'dark'}} value={p.passport_expiry} onChange={e=>updatePassenger(idx,'passport_expiry',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                      {passengers.length > 1 ? <button onClick={e=>{e.preventDefault();removePassenger(idx)}} style={{ border:'none', background:'none', color:'var(--text-danger)', cursor:'pointer', fontSize:16 }}>&times;</button> : <span style={{ color:'var(--text-faint)' }}>&mdash;</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bus / Train passengers */}
        {(activeTab === 'Bus' || activeTab === 'Train') && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-input)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {['Type','Title','Firstname','Lastname','Age',''].map(h => (
                    <th key={h} style={{ padding: '0 8px 12px', textAlign: h ? 'left' : 'center', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {busPassengers.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: idx===busPassengers.length-1 ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding:'8px', fontSize:13}} value={p.type} onChange={e=>updateBusPax(idx,'type',e.target.value)}><option>Adult</option><option>Child</option><option>Infant</option></select></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding:'8px', fontSize:13}} value={p.title} onChange={e=>updateBusPax(idx,'title',e.target.value)}><option>Mr</option><option>Ms</option><option>Mrs</option></select></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.firstname), padding:'8px', fontSize:13}} placeholder="John" value={p.firstname} onChange={e=>updateBusPax(idx,'firstname',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.lastname), padding:'8px', fontSize:13}} placeholder="Doe" value={p.lastname} onChange={e=>updateBusPax(idx,'lastname',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13, width:70}} placeholder="25" value={p.age} onChange={e=>updateBusPax(idx,'age',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                      {busPassengers.length > 1 ? <button onClick={e=>{e.preventDefault();removeBusPax(idx)}} style={{ border:'none', background:'none', color:'var(--text-danger)', cursor:'pointer', fontSize:16 }}>&times;</button> : <span style={{ color:'var(--text-faint)' }}>&mdash;</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hotel passengers */}
        {activeTab === 'Hotel' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-input)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {['Room No','Paxtype','Title','Firstname','Lastname','Address','Country','State','City','Postalcode','Area','PAN Number',''].map(h => (
                    <th key={h} style={{ padding: '0 8px 12px', textAlign: h ? 'left' : 'center', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hotelPassengers.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: idx===hotelPassengers.length-1 ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13, width:60}} value={p.room_no} onChange={e=>updateHotelPax(idx,'room_no',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding:'8px', fontSize:13}} value={p.paxtype} onChange={e=>updateHotelPax(idx,'paxtype',e.target.value)}><option>Adult</option><option>Child</option></select></td>
                    <td style={{ padding: '12px 6px' }}><select style={{...inputStyle, padding:'8px', fontSize:13}} value={p.title} onChange={e=>updateHotelPax(idx,'title',e.target.value)}><option>Mr</option><option>Ms</option><option>Mrs</option></select></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.firstname), padding:'8px', fontSize:13}} placeholder="John" value={p.firstname} onChange={e=>updateHotelPax(idx,'firstname',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...req(p.lastname), padding:'8px', fontSize:13}} placeholder="Doe" value={p.lastname} onChange={e=>updateHotelPax(idx,'lastname',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13}} placeholder="123 Street..." value={p.address} onChange={e=>updateHotelPax(idx,'address',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13, width:60}} placeholder="IN" value={p.country} onChange={e=>updateHotelPax(idx,'country',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13}} placeholder="Tamil Nadu" value={p.state} onChange={e=>updateHotelPax(idx,'state',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13}} placeholder="Chennai" value={p.city} onChange={e=>updateHotelPax(idx,'city',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13, width:80}} placeholder="600001" value={p.postalcode} onChange={e=>updateHotelPax(idx,'postalcode',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13}} placeholder="Anna Nagar" value={p.area} onChange={e=>updateHotelPax(idx,'area',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px' }}><input style={{...inputStyle, padding:'8px', fontSize:13}} placeholder="ABCDE1234F" value={p.pan_number} onChange={e=>updateHotelPax(idx,'pan_number',e.target.value)} /></td>
                    <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                      {hotelPassengers.length > 1 ? <button onClick={e=>{e.preventDefault();removeHotelPax(idx)}} style={{ border:'none', background:'none', color:'var(--text-danger)', cursor:'pointer', fontSize:16 }}>&times;</button> : <span style={{ color:'var(--text-faint)' }}>&mdash;</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : (
      <div className="form-card" style={{ ...cardStyle, marginBottom: 24, opacity: 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>&#128274;</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Passenger Roster Disabled</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              This employee's tier does not allow extra passengers. Update Tier Config to enable multi-passenger bookings.
            </div>
          </div>
        </div>
      </div>
      )}

      {error && <Alert type="error" style={{ marginBottom: 24 }}>{error}</Alert>}

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 40 }}>
        <button onClick={e => { e.preventDefault(); handleChangeEmployee() }}
          style={{ padding: '12px 28px', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
          Cancel
        </button>
        <button disabled={loading} onClick={e => { e.preventDefault(); handleSubmit() }}
          style={{ padding: '12px 32px', borderRadius: 8, background: accent, color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading ? <Spinner size={16} /> : `Submit for ${employee.name.split(' ')[0]}`}
          {!loading && '\u2192'}
        </button>
      </div>
    </div>
  )
}
