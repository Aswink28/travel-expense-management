import { useState, useEffect } from 'react'
import { employeesAPI, rolesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, Button, Input, Select, Alert, Spinner, Modal, PageTitle } from '../shared/UI'
import { Eye, EyeOff } from 'lucide-react'

const PRODUCT_ID = 'cbad7cad-5bef-4289-9150-15d613fcb89b'

const INITIAL_FORM = {
  name:'', email:'', password:'', role:'Employee', department:'', reporting_to:'',
  mobile_number:'', date_of_birth:'', gender:'', pan_number:'', aadhaar_number:'',
}

function MLabel({ text, required }) {
  return <>{text}{required && <span style={{ color:'#FF453A', marginLeft:2 }}>*</span>}</>
}

export default function EmployeeManagement({ setTab }) {
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
  const [popup, setPopup] = useState(null)
  const [showPw, setShowPw] = useState(false)

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
    setShowPw(false)
    setShowModal(true)
  }

  function openEdit(emp) {
    setEditId(emp.id)
    setForm({
      name: emp.name, email: emp.email, password: '', role: emp.role,
      department: emp.department || '', reporting_to: emp.reporting_to || '',
      mobile_number: emp.mobile_number || '', date_of_birth: emp.date_of_birth?.slice(0, 10) || '',
      gender: emp.gender || '', pan_number: emp.pan_number || '', aadhaar_number: emp.aadhaar_number || '',
    })
    setFieldErrors({})
    setShowPw(false)
    setShowModal(true)
  }

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
    if (!v.date_of_birth)         e.date_of_birth = 'Date of birth is required'
    if (!v.gender)                e.gender = 'Gender is required'
    if (!v.pan_number)            e.pan_number = 'PAN number is required'
    else if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(v.pan_number)) e.pan_number = 'Invalid format (e.g. ABCDE1234F)'
    if (!v.aadhaar_number)        e.aadhaar_number = 'Aadhaar number is required'
    else if (!/^\d{12}$/.test(v.aadhaar_number)) e.aadhaar_number = 'Must be 12 digits'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      const payload = { ...form, productId: PRODUCT_ID }
      if (editId && !payload.password) delete payload.password
      if (!payload.department) delete payload.department
      if (!payload.reporting_to) delete payload.reporting_to

      let result
      if (editId) {
        result = await employeesAPI.update(editId, payload)
        setShowModal(false)
        setPopup({
          type: 'success', title: 'Employee Updated',
          message: result.message || 'Employee has been updated successfully.',
          details: { name: form.name, email: form.email, role: form.role },
        })
      } else {
        result = await employeesAPI.create(payload)
        setShowModal(false)
        setPopup({
          type: 'success', title: 'Employee Created',
          message: result.message || 'New employee has been created successfully.',
          details: { empId: result.data?.emp_id, name: form.name, email: form.email, role: form.role, mobile: form.mobile_number, walletId: result.data?.ppi_wallet_id || '—' },
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

  function demoFill() {
    const uid = Date.now().toString(36).slice(-4)
    const rDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]
    const firstNames = ['Aarav','Vivaan','Aditya','Sai','Arjun','Reyansh','Krishna','Ishaan','Ananya','Diya','Meera','Pooja','Kavya','Riya','Neha','Priya','Lakshmi','Sneha']
    const lastNames  = ['Sharma','Patel','Reddy','Kumar','Nair','Iyer','Singh','Gupta','Joshi','Menon','Das','Rao','Pillai','Verma','Chauhan','Mishra']
    const depts      = ['Engineering','Finance','HR','Operations','Marketing','Design','QA','DevOps','Sales','Support']
    const managers   = ['Ravi Kumar','Deepa Krishnan','Anil Menon']
    const panLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const first = pick(firstNames)
    const last  = pick(lastNames)
    const year = 1980 + Math.floor(Math.random() * 25)
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')
    const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')
    setForm({
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}.${uid}@company.in`,
      password: 'pass123',
      role: pick(ROLE_NAMES.length ? ROLE_NAMES : ['Employee']),
      department: pick(depts),
      reporting_to: pick(managers),
      mobile_number: `9${rDigits(9)}`,
      date_of_birth: `${year}-${month}-${day}`,
      gender: pick(['Male', 'Female']),
      pan_number: Array.from({ length: 5 }, () => pick([...panLetters])).join('') + rDigits(4) + pick([...panLetters]),
      aadhaar_number: rDigits(12),
    })
    setFieldErrors({})
  }

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

  const errCount = Object.keys(fieldErrors).length

  return (
    <div className="fade-up">
      <PageTitle title="Employee Management" sub="Create and manage employee accounts" />
      {error && <Alert type="error" style={{ marginBottom:16 }}>{error}</Alert>}

      {/* Toolbar */}
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <input placeholder="Search by name, email, or ID..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ flex:1, minWidth:200, background:'#1A1A22', border:'1px solid #2A2A35', borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'9px 12px', outline:'none' }} />
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          style={{ background:'#1A1A22', border:'1px solid #2A2A35', borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'9px 12px', outline:'none', cursor:'pointer' }}>
          <option value="">All Roles</option>
          {ROLE_NAMES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <Button variant="purple" onClick={() => setTab?.('bulk-employees')} style={{ whiteSpace:'nowrap' }}>Bulk Upload</Button>
        <Button onClick={openCreate} style={{ whiteSpace:'nowrap' }}>+ New Employee</Button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 }}>
        {[
          ['Total', employees.length, accent],
          ['Active', employees.filter(e => e.is_active).length, '#30D158'],
          ['Inactive', employees.filter(e => !e.is_active).length, '#FF453A'],
          ['Roles', new Set(employees.map(e => e.role)).size, '#BF5AF2'],
        ].map(([label, val, color]) => (
          <Card key={label} style={{ padding:'14px 18px' }}>
            <div style={{ fontSize:10, color:'#555', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{label}</div>
            <div className="syne" style={{ fontSize:22, fontWeight:800, color }}>{val}</div>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card style={{ overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1E1E2A' }}>
                {['Employee', 'Mobile', 'Role', 'Wallet ID', 'Status', 'Balance', 'Last Login', 'Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', fontWeight:500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!paged.length ? (
                <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#444' }}>No employees found</td></tr>
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
                  <td style={{ padding:'10px 16px' }}>
                    {emp.ppi_wallet_id ? (
                      <span style={{ fontSize:10, fontFamily:'monospace', color:'#0A84FF', background:'#0A84FF12', padding:'3px 8px', borderRadius:6 }}>
                        {emp.ppi_wallet_id.slice(0, 8)}...
                      </span>
                    ) : <span style={{ color:'#444' }}>—</span>}
                  </td>
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
                  <td style={{ padding:'10px 16px', color:'#555', fontSize:11 }}>
                    {emp.last_login ? new Date(emp.last_login).toLocaleDateString('en-IN') : 'Never'}
                  </td>
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
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={{
                background:'none', border:'1px solid #2A2A35', borderRadius:6, color:safePage<=1?'#333':'#999',
                padding:'5px 10px', fontSize:12, cursor:safePage<=1?'default':'pointer',
              }}>← Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i-1] > 1) acc.push('...'); acc.push(p); return acc }, [])
                .map((p, i) => p === '...'
                  ? <span key={`dot-${i}`} style={{ color:'#444', fontSize:12, padding:'0 4px' }}>...</span>
                  : <button key={p} onClick={() => setPage(p)} style={{
                      width:30, height:30, borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
                      background: p === safePage ? accent : 'none',
                      border: p === safePage ? 'none' : '1px solid #2A2A35',
                      color: p === safePage ? '#fff' : '#888',
                    }}>{p}</button>
                )}
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
        <Modal title={editId ? 'Edit Employee' : 'Create New Employee'} onClose={() => setShowModal(false)} width={560}>
          <form onSubmit={handleSubmit}>

            {errCount > 0 && (
              <Alert type="error" style={{ marginBottom:14 }}>
                Please fix {errCount} validation error{errCount > 1 ? 's' : ''} below
              </Alert>
            )}

            {!editId && (
              <button type="button" onClick={demoFill} style={{
                width:'100%', padding:'8px 12px', borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:500,
                background:'#0A84FF10', border:'1px solid #0A84FF30', color:'#0A84FF', transition:'opacity .15s', marginBottom:14,
              }} onMouseEnter={e=>e.currentTarget.style.opacity='.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                ⚡ Demo Fill — Auto-generate unique employee data
              </button>
            )}

            {/* Row 1: Name, Mobile */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
              <Input label={<MLabel text="Full Name" required />} value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Rahul Sharma" error={fieldErrors.name} />
              <Input label={<MLabel text="Mobile Number" required />} value={form.mobile_number} onChange={e => f('mobile_number', e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="e.g. 9876543210" error={fieldErrors.mobile_number} />
            </div>

            {/* Row 2: Email, Password */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
              <Input label={<MLabel text="Email" required />} type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="e.g. rahul@company.in" error={fieldErrors.email} />
              <div style={{ position:'relative' }}>
                <Input label={<MLabel text={editId ? 'New Password' : 'Password'} required={!editId} />} type={showPw ? 'text' : 'password'} value={form.password} onChange={e => f('password', e.target.value)} placeholder={editId ? 'Leave blank to keep' : 'Min 6 characters'} error={fieldErrors.password} style={{ paddingRight:36 }} />
                <button type="button" onClick={() => setShowPw(p => !p)} style={{
                  position:'absolute', right:10, top:30, background:'none', border:'none',
                  color:'#555', cursor:'pointer', fontSize:14, padding:2, lineHeight:1,
                }} title={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Row 3: DOB, Gender, PAN */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 12px' }}>
              <Input label={<MLabel text="Date of Birth" required />} type="date" value={form.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} error={fieldErrors.date_of_birth} />
              <Select label={<MLabel text="Gender" required />} value={form.gender} onChange={e => f('gender', e.target.value)} error={fieldErrors.gender}>
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
              <Input label={<MLabel text="PAN Number" required />} value={form.pan_number} onChange={e => f('pan_number', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10))} placeholder="ABCDE1234F" error={fieldErrors.pan_number} />
            </div>

            {/* Row 4: Aadhaar */}
            <Input label={<MLabel text="Aadhaar Number" required />} value={form.aadhaar_number} onChange={e => f('aadhaar_number', e.target.value.replace(/\D/g,'').slice(0,12))} placeholder="12-digit Aadhaar number" error={fieldErrors.aadhaar_number} />

            {/* Row 5: Role, Dept, Reporting */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 12px' }}>
              <Select label={<MLabel text="Role" required />} value={form.role} onChange={e => f('role', e.target.value)} error={fieldErrors.role}>
                {ROLE_NAMES.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Input label="Department" value={form.department} onChange={e => f('department', e.target.value)} placeholder="e.g. Engineering" />
              <Input label="Reporting To" value={form.reporting_to} onChange={e => f('reporting_to', e.target.value)} placeholder="e.g. Manager name" />
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update Employee' : 'Create Employee'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Result Popup ────────────────────────────────────── */}
      {popup && (
        <Modal title="" onClose={() => setPopup(null)} width={420}>
          <div style={{ textAlign:'center', padding:'10px 0 6px' }}>
            <div style={{
              width:56, height:56, borderRadius:'50%', margin:'0 auto 16px',
              background: popup.type === 'success' ? '#30D15814' : '#FF453A14',
              border: `2px solid ${popup.type === 'success' ? '#30D15830' : '#FF453A30'}`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:28,
            }}>
              {popup.type === 'success' ? '✓' : '✕'}
            </div>
            <div className="syne" style={{ fontSize:18, fontWeight:700, marginBottom:8, color: popup.type === 'success' ? '#30D158' : '#FF453A' }}>
              {popup.title}
            </div>
            <div style={{ fontSize:13, color:'#999', marginBottom:16, lineHeight:1.5 }}>{popup.message}</div>
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
            <Button variant={popup.type === 'success' ? 'success' : 'danger'} onClick={() => setPopup(null)} style={{ width:'100%', justifyContent:'center' }}>
              {popup.type === 'success' ? 'Done' : 'Close'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
