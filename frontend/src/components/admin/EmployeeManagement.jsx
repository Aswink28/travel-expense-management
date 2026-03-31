import { useState, useEffect } from 'react'
import { employeesAPI, rolesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, Button, Input, Select, Alert, Spinner, Modal, PageTitle } from '../shared/UI'

const INITIAL_FORM = {
  name:'', email:'', password:'', role:'Employee', department:'', reporting_to:'',
  mobile_number:'', kyc_type:'min_kyc',
  date_of_birth:'', gender:'', pan_number:'', aadhaar_number:'',
  address_line1:'', address_line2:'', city:'', state:'', pincode:'',
}

// ── Mandatory label helper ───────────────────────────────────
function MLabel({ text, required }) {
  return <>{text}{required && <span style={{ color:'#FF453A', marginLeft:2 }}>*</span>}</>
}

export default function EmployeeManagement() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [roles, setRoles]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage]           = useState(1)
  const perPage = 10

  // Result popup state
  const [popup, setPopup] = useState(null) // { type: 'success'|'error', title, message, details }

  const ROLE_COLORS = roles.reduce((acc, r) => { acc[r.name] = r.color; return acc }, {})
  const ROLE_NAMES = roles.filter(r => r.is_active).map(r => r.name)
  const accent = user.color || '#30D158'

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const [empRes, rolesRes] = await Promise.all([employeesAPI.list(), rolesAPI.list()])
      setEmployees(empRes.data)
      setRoles(rolesRes.data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function openCreate() {
    setEditId(null)
    setForm(INITIAL_FORM)
    setFieldErrors({})
    setShowModal(true)
  }

  function openEdit(emp) {
    setEditId(emp.id)
    setForm({
      name: emp.name, email: emp.email, password: '', role: emp.role,
      department: emp.department || '', reporting_to: emp.reporting_to || '',
      mobile_number: emp.mobile_number || '', kyc_type: emp.kyc_type || 'min_kyc',
      date_of_birth: emp.date_of_birth?.slice(0, 10) || '', gender: emp.gender || '',
      pan_number: emp.pan_number || '', aadhaar_number: emp.aadhaar_number || '',
      address_line1: emp.address_line1 || '', address_line2: emp.address_line2 || '',
      city: emp.city || '', state: emp.state || '', pincode: emp.pincode || '',
    })
    setFieldErrors({})
    setShowModal(true)
  }

  // ── Field-level validation ─────────────────────────────────
  function validate() {
    const e = {}
    const v = form

    if (!v.name.trim())           e.name = 'Full name is required'
    if (!v.email.trim())          e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Invalid email format'

    if (!editId && !v.password)   e.password = 'Password is required'
    else if (v.password && v.password.length < 6) e.password = 'Minimum 6 characters'

    if (!v.role)                  e.role = 'Role is required'

    if (!v.mobile_number)         e.mobile_number = 'Mobile number is required'
    else if (!/^\d{10}$/.test(v.mobile_number)) e.mobile_number = 'Must be 10 digits'

    if (v.kyc_type === 'full_kyc') {
      if (!v.date_of_birth)       e.date_of_birth = 'Date of birth is required'
      if (!v.gender)              e.gender = 'Gender is required'

      if (!v.pan_number)          e.pan_number = 'PAN number is required'
      else if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(v.pan_number)) e.pan_number = 'Invalid PAN (e.g. ABCDE1234F)'

      if (!v.aadhaar_number)      e.aadhaar_number = 'Aadhaar number is required'
      else if (!/^\d{12}$/.test(v.aadhaar_number)) e.aadhaar_number = 'Must be 12 digits'

      if (!v.address_line1.trim()) e.address_line1 = 'Address is required'
      if (!v.city.trim())         e.city = 'City is required'
      if (!v.state.trim())        e.state = 'State is required'
      if (!v.pincode)             e.pincode = 'Pincode is required'
      else if (!/^\d{6}$/.test(v.pincode)) e.pincode = 'Must be 6 digits'
    }

    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      const payload = { ...form }
      if (editId && !payload.password) delete payload.password
      if (!payload.department) delete payload.department
      if (!payload.reporting_to) delete payload.reporting_to

      let result
      if (editId) {
        result = await employeesAPI.update(editId, payload)
        setShowModal(false)
        setPopup({
          type: 'success',
          title: 'Employee Updated',
          message: result.message || 'Employee has been updated successfully.',
          details: { name: form.name, email: form.email, role: form.role },
        })
      } else {
        result = await employeesAPI.create(payload)
        setShowModal(false)
        setPopup({
          type: 'success',
          title: 'Employee Created',
          message: result.message || 'New employee has been created successfully.',
          details: {
            empId: result.data?.emp_id,
            name: form.name,
            email: form.email,
            role: form.role,
            kyc: form.kyc_type === 'full_kyc' ? 'Full KYC' : 'Min KYC',
          },
        })
      }
      load()
    } catch (err) {
      setPopup({
        type: 'error',
        title: editId ? 'Update Failed' : 'Creation Failed',
        message: err.message || 'Something went wrong. Please try again.',
      })
    } finally { setSaving(false) }
  }

  async function toggleStatus(emp) {
    try {
      await employeesAPI.toggleStatus(emp.id, !emp.is_active)
      setPopup({
        type: 'success',
        title: emp.is_active ? 'Employee Deactivated' : 'Employee Activated',
        message: `${emp.name} has been ${emp.is_active ? 'deactivated' : 'activated'} successfully.`,
      })
      load()
    } catch (err) {
      setPopup({ type: 'error', title: 'Action Failed', message: err.message })
    }
  }

  function f(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n })
  }

  // ── Demo data generator (unique every time) ────────────────
  function demoFill(kycType) {
    const uid = Date.now().toString(36).slice(-4)
    const rDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]

    const firstNames = ['Aarav','Vivaan','Aditya','Sai','Arjun','Reyansh','Krishna','Ishaan','Ananya','Diya','Meera','Pooja','Kavya','Riya','Neha','Priya','Lakshmi','Sneha']
    const lastNames  = ['Sharma','Patel','Reddy','Kumar','Nair','Iyer','Singh','Gupta','Joshi','Menon','Das','Rao','Pillai','Verma','Chauhan','Mishra']
    const depts      = ['Engineering','Finance','HR','Operations','Marketing','Design','QA','DevOps','Sales','Support']
    const cities     = ['Chennai','Mumbai','Bangalore','Hyderabad','Delhi','Pune','Kolkata','Ahmedabad','Jaipur','Kochi']
    const states     = ['Tamil Nadu','Maharashtra','Karnataka','Telangana','Delhi','Maharashtra','West Bengal','Gujarat','Rajasthan','Kerala']
    const streets    = ['MG Road','Anna Nagar','Banjara Hills','Koramangala','Connaught Place','Whitefield','Salt Lake','SG Highway','Malviya Nagar','Marine Drive']
    const managers   = ['Ravi Kumar','Deepa Krishnan','Anil Menon']

    const first = pick(firstNames)
    const last  = pick(lastNames)
    const name  = `${first} ${last}`
    const email = `${first.toLowerCase()}.${last.toLowerCase()}.${uid}@company.in`
    const mobile = `9${rDigits(9)}`
    const cityIdx = Math.floor(Math.random() * cities.length)

    const base = {
      ...INITIAL_FORM,
      name, email, password: 'pass123',
      role: pick(ROLE_NAMES.length ? ROLE_NAMES : ['Employee']),
      department: pick(depts),
      reporting_to: pick(managers),
      mobile_number: mobile,
      kyc_type: kycType,
    }

    if (kycType === 'full_kyc') {
      const panLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const pan = Array.from({ length: 5 }, () => pick([...panLetters])).join('') + rDigits(4) + pick([...panLetters])
      const year = 1980 + Math.floor(Math.random() * 25)
      const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')
      const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')
      Object.assign(base, {
        date_of_birth: `${year}-${month}-${day}`,
        gender: pick(['Male', 'Female']),
        pan_number: pan,
        aadhaar_number: rDigits(12),
        address_line1: `${Math.floor(Math.random() * 200) + 1}, ${pick(streets)}`,
        address_line2: `Near ${pick(['Bus Stop','Railway Station','Metro Station','Market','Temple','Park'])}`,
        city: cities[cityIdx],
        state: states[cityIdx],
        pincode: `${5 + Math.floor(Math.random() * 5)}${rDigits(5)}`,
      })
    }

    setForm(base)
    setFieldErrors({})
  }

  const isFullKyc = form.kyc_type === 'full_kyc'

  const filtered = employees.filter(emp => {
    const q = search.toLowerCase()
    const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q) || emp.emp_id.toLowerCase().includes(q)
    const matchRole = !roleFilter || emp.role === roleFilter
    return matchSearch && matchRole
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={36} /></div>

  const kycBadge = (emp) => {
    const colors = { verified: '#30D158', pending: '#FFD60A', rejected: '#FF453A' }
    const c = colors[emp.kyc_status] || '#888'
    return (
      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:c+'14', color:c, fontWeight:500 }}>
        {emp.kyc_type === 'full_kyc' ? 'Full' : 'Min'} · {emp.kyc_status}
      </span>
    )
  }

  const errCount = Object.keys(fieldErrors).length

  return (
    <div className="fade-up">
      <PageTitle title="Employee Management" sub="Create and manage employee accounts" />

      {error && <Alert type="error" style={{ marginBottom:16 }}>{error}</Alert>}

      {/* Toolbar */}
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <input
          placeholder="Search by name, email, or ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ flex:1, minWidth:200, background:'#1A1A22', border:'1px solid #2A2A35', borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'9px 12px', outline:'none' }}
        />
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          style={{ background:'#1A1A22', border:'1px solid #2A2A35', borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'9px 12px', outline:'none', cursor:'pointer' }}
        >
          <option value="">All Roles</option>
          {ROLE_NAMES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <Button onClick={openCreate} style={{ whiteSpace:'nowrap' }}>+ New Employee</Button>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 }}>
        {[
          ['Total', employees.length, accent],
          ['Active', employees.filter(e => e.is_active).length, '#30D158'],
          ['Full KYC', employees.filter(e => e.kyc_type === 'full_kyc').length, '#BF5AF2'],
          ['Min KYC', employees.filter(e => e.kyc_type === 'min_kyc').length, '#FFD60A'],
        ].map(([label, val, color]) => (
          <Card key={label} style={{ padding:'14px 18px' }}>
            <div style={{ fontSize:10, color:'#555', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{label}</div>
            <div className="syne" style={{ fontSize:22, fontWeight:800, color }}>{val}</div>
          </Card>
        ))}
      </div>

      {/* Employee table */}
      <Card style={{ overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1E1E2A' }}>
                {['Employee', 'Mobile', 'Role', 'KYC', 'Status', 'Wallet', 'Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', fontWeight:500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!paged.length ? (
                <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#444' }}>No employees found</td></tr>
              ) : paged.map(emp => (
                <tr key={emp.id} style={{ borderBottom:'1px solid #16161E' }}
                    onMouseEnter={e => e.currentTarget.style.background='#14141C'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{
                        width:32, height:32, borderRadius:'50%',
                        background:(ROLE_COLORS[emp.role]||'#0A84FF')+'22',
                        border:`1.5px solid ${(ROLE_COLORS[emp.role]||'#0A84FF')}44`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:700, color:ROLE_COLORS[emp.role]||'#0A84FF', flexShrink:0
                      }}>{emp.avatar || emp.name?.slice(0,2).toUpperCase()}</div>
                      <div>
                        <div style={{ color:'#E2E2E8', fontWeight:500 }}>{emp.name}</div>
                        <div style={{ fontSize:10, color:'#555' }}>{emp.emp_id} · {emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'10px 16px', color:'#888' }}>{emp.mobile_number || '—'}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:500,
                      background:(ROLE_COLORS[emp.role]||'#888')+'14', color:ROLE_COLORS[emp.role]||'#888' }}>
                      {emp.role}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px' }}>{kycBadge(emp)}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{
                      fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:500,
                      background: emp.is_active ? '#30D15814' : '#FF453A14',
                      color: emp.is_active ? '#30D158' : '#FF453A',
                      display:'inline-flex', alignItems:'center', gap:5
                    }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:emp.is_active?'#30D158':'#FF453A' }} />
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px', color:'#888' }}>₹{Number(emp.wallet_balance||0).toLocaleString('en-IN')}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(emp)}>Edit</Button>
                      {emp.id !== user.id && (
                        <Button size="sm" variant={emp.is_active ? 'danger' : 'success'} onClick={() => toggleStatus(emp)}>
                          {emp.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > perPage && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderTop:'1px solid #1E1E2A' }}>
            <div style={{ fontSize:12, color:'#555' }}>
              Showing {((safePage - 1) * perPage) + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              {/* Prev */}
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={{
                background:'none', border:'1px solid #2A2A35', borderRadius:6, color:safePage<=1?'#333':'#999',
                padding:'5px 10px', fontSize:12, cursor:safePage<=1?'default':'pointer',
              }}>← Prev</button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dot-${i}`} style={{ color:'#444', fontSize:12, padding:'0 4px' }}>...</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)} style={{
                      width:30, height:30, borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
                      background: p === safePage ? accent : 'none',
                      border: p === safePage ? 'none' : '1px solid #2A2A35',
                      color: p === safePage ? '#fff' : '#888',
                    }}>{p}</button>
                  )
                )
              }

              {/* Next */}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={{
                background:'none', border:'1px solid #2A2A35', borderRadius:6, color:safePage>=totalPages?'#333':'#999',
                padding:'5px 10px', fontSize:12, cursor:safePage>=totalPages?'default':'pointer',
              }}>Next →</button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Create / Edit Modal ─────────────────────────────── */}
      {showModal && (
        <Modal title={editId ? 'Edit Employee' : 'Create New Employee'} onClose={() => setShowModal(false)} width={600}>
          <form onSubmit={handleSubmit}>

            {/* Validation summary */}
            {errCount > 0 && (
              <Alert type="error" style={{ marginBottom:14 }}>
                Please fix {errCount} validation error{errCount > 1 ? 's' : ''} below
              </Alert>
            )}

            {/* Demo fill buttons */}
            {!editId && (
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                <button type="button" onClick={() => demoFill('min_kyc')} style={{
                  flex:1, padding:'8px 12px', borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:500,
                  background:'#FFD60A10', border:'1px solid #FFD60A30', color:'#FFD60A', transition:'opacity .15s',
                }} onMouseEnter={e=>e.currentTarget.style.opacity='.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                  ⚡ Demo Fill — Min KYC
                </button>
                <button type="button" onClick={() => demoFill('full_kyc')} style={{
                  flex:1, padding:'8px 12px', borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:500,
                  background:'#BF5AF210', border:'1px solid #BF5AF230', color:'#BF5AF2', transition:'opacity .15s',
                }} onMouseEnter={e=>e.currentTarget.style.opacity='.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                  ⚡ Demo Fill — Full KYC
                </button>
              </div>
            )}

            {/* KYC Type Toggle */}
            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:8 }}>KYC Type</label>
              <div style={{ display:'flex', gap:8 }}>
                {[['min_kyc', 'Min KYC', 'Basic — mobile verification (₹10,000 limit)'], ['full_kyc', 'Full KYC', 'Complete — PAN, Aadhaar, address (₹2,00,000 limit)']].map(([val, label, desc]) => (
                  <div key={val} onClick={() => f('kyc_type', val)} style={{
                    flex:1, padding:'12px 14px', borderRadius:10, cursor:'pointer',
                    background: form.kyc_type === val ? (val === 'full_kyc' ? '#BF5AF212' : '#FFD60A12') : '#1A1A22',
                    border: `1.5px solid ${form.kyc_type === val ? (val === 'full_kyc' ? '#BF5AF240' : '#FFD60A40') : '#2A2A35'}`,
                    transition: 'all .15s',
                  }}>
                    <div style={{ fontSize:13, fontWeight:600, color: form.kyc_type === val ? '#E2E2E8' : '#666' }}>{label}</div>
                    <div style={{ fontSize:10, color:'#555', marginTop:2 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Basic Info */}
            <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10, marginTop:4 }}>Basic Information</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
              <Input label={<MLabel text="Full Name" required />} value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Rahul Sharma" error={fieldErrors.name} />
              <Input label={<MLabel text="Mobile Number" required />} value={form.mobile_number} onChange={e => f('mobile_number', e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="e.g. 9876543210" error={fieldErrors.mobile_number} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
              <Input label={<MLabel text="Email" required />} type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="e.g. rahul@company.in" error={fieldErrors.email} />
              <Input label={<MLabel text={editId ? 'New Password' : 'Password'} required={!editId} />} type="password" value={form.password} onChange={e => f('password', e.target.value)} placeholder={editId ? 'Leave blank to keep' : 'Min 6 characters'} error={fieldErrors.password} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 12px' }}>
              <Select label={<MLabel text="Role" required />} value={form.role} onChange={e => f('role', e.target.value)} error={fieldErrors.role}>
                {ROLE_NAMES.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Input label="Department" value={form.department} onChange={e => f('department', e.target.value)} placeholder="e.g. Engineering" />
              <Input label="Reporting To" value={form.reporting_to} onChange={e => f('reporting_to', e.target.value)} placeholder="e.g. Manager name" />
            </div>

            {/* Full KYC Fields */}
            {isFullKyc && (
              <>
                <div style={{ fontSize:11, color:'#BF5AF2', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10, marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#BF5AF2' }} />
                  Full KYC Details
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 12px' }}>
                  <Input label={<MLabel text="Date of Birth" required />} type="date" value={form.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} error={fieldErrors.date_of_birth} />
                  <Select label={<MLabel text="Gender" required />} value={form.gender} onChange={e => f('gender', e.target.value)} error={fieldErrors.gender}>
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </Select>
                  <Input label={<MLabel text="PAN Number" required />} value={form.pan_number} onChange={e => f('pan_number', e.target.value.toUpperCase().slice(0,10))} placeholder="ABCDE1234F" error={fieldErrors.pan_number} />
                </div>
                <Input label={<MLabel text="Aadhaar Number" required />} value={form.aadhaar_number} onChange={e => f('aadhaar_number', e.target.value.replace(/\D/g,'').slice(0,12))} placeholder="12-digit Aadhaar number" error={fieldErrors.aadhaar_number} />

                <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10, marginTop:8 }}>Address</div>
                <Input label={<MLabel text="Address Line 1" required />} value={form.address_line1} onChange={e => f('address_line1', e.target.value)} placeholder="House/Flat No., Street" error={fieldErrors.address_line1} />
                <Input label="Address Line 2" value={form.address_line2} onChange={e => f('address_line2', e.target.value)} placeholder="Landmark (optional)" />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 12px' }}>
                  <Input label={<MLabel text="City" required />} value={form.city} onChange={e => f('city', e.target.value)} placeholder="e.g. Chennai" error={fieldErrors.city} />
                  <Input label={<MLabel text="State" required />} value={form.state} onChange={e => f('state', e.target.value)} placeholder="e.g. Tamil Nadu" error={fieldErrors.state} />
                  <Input label={<MLabel text="Pincode" required />} value={form.pincode} onChange={e => f('pincode', e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="e.g. 600001" error={fieldErrors.pincode} />
                </div>
              </>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:12 }}>
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update Employee' : 'Create Employee'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Result Popup (Success / Error) ──────────────────── */}
      {popup && (
        <Modal title="" onClose={() => setPopup(null)} width={420}>
          <div style={{ textAlign:'center', padding:'10px 0 6px' }}>
            {/* Icon */}
            <div style={{
              width:56, height:56, borderRadius:'50%', margin:'0 auto 16px',
              background: popup.type === 'success' ? '#30D15814' : '#FF453A14',
              border: `2px solid ${popup.type === 'success' ? '#30D15830' : '#FF453A30'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:28,
            }}>
              {popup.type === 'success' ? '✓' : '✕'}
            </div>

            {/* Title */}
            <div className="syne" style={{
              fontSize:18, fontWeight:700, marginBottom:8,
              color: popup.type === 'success' ? '#30D158' : '#FF453A',
            }}>
              {popup.title}
            </div>

            {/* Message */}
            <div style={{ fontSize:13, color:'#999', marginBottom:16, lineHeight:1.5 }}>
              {popup.message}
            </div>

            {/* Details card (success only) */}
            {popup.type === 'success' && popup.details && (
              <div style={{ background:'#1A1A22', borderRadius:10, padding:'14px 18px', textAlign:'left', marginBottom:16 }}>
                {Object.entries(popup.details).map(([k, v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #1E1E2A' }}>
                    <span style={{ fontSize:11, color:'#555', textTransform:'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span>
                    <span style={{ fontSize:12, color:'#ccc', fontWeight:500 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Close button */}
            <Button
              variant={popup.type === 'success' ? 'success' : 'danger'}
              onClick={() => setPopup(null)}
              style={{ width:'100%', justifyContent:'center' }}
            >
              {popup.type === 'success' ? 'Done' : 'Close'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
