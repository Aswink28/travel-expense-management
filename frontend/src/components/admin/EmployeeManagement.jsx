import { useState, useEffect } from 'react'
import { employeesAPI, rolesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, Button, Input, Select, Alert, Spinner, Modal, PageTitle, StatusPill } from '../shared/UI'

const INITIAL_FORM = { name:'', email:'', password:'', role:'Employee', department:'', reporting_to:'' }

export default function EmployeeManagement() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [roles, setRoles]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(INITIAL_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const ROLE_COLORS = roles.reduce((acc, r) => { acc[r.name] = r.color; return acc }, {})
  const ROLE_NAMES = roles.filter(r => r.is_active).map(r => r.name)
  const accent = user.color || '#30D158'

  useEffect(() => { load() }, [])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t) } }, [success])

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
    setFormError('')
    setShowModal(true)
  }

  function openEdit(emp) {
    setEditId(emp.id)
    setForm({ name: emp.name, email: emp.email, password: '', role: emp.role, department: emp.department || '', reporting_to: emp.reporting_to || '' })
    setFormError('')
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim() || !form.email.trim() || !form.role) {
      return setFormError('Name, email, and role are required')
    }
    if (!editId && !form.password) {
      return setFormError('Password is required for new employees')
    }
    if (form.password && form.password.length < 6) {
      return setFormError('Password must be at least 6 characters')
    }

    setSaving(true)
    try {
      const payload = { ...form }
      if (editId && !payload.password) delete payload.password
      if (!payload.department) delete payload.department
      if (!payload.reporting_to) delete payload.reporting_to

      if (editId) {
        await employeesAPI.update(editId, payload)
        setSuccess('Employee updated successfully')
      } else {
        await employeesAPI.create(payload)
        setSuccess('Employee created successfully')
      }
      setShowModal(false)
      load()
    } catch (err) {
      setFormError(err.message)
    } finally { setSaving(false) }
  }

  async function toggleStatus(emp) {
    try {
      await employeesAPI.toggleStatus(emp.id, !emp.is_active)
      setSuccess(`${emp.name} ${emp.is_active ? 'deactivated' : 'activated'}`)
      load()
    } catch (err) { setError(err.message) }
  }

  const filtered = employees.filter(emp => {
    const q = search.toLowerCase()
    const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q) || emp.emp_id.toLowerCase().includes(q)
    const matchRole = !roleFilter || emp.role === roleFilter
    return matchSearch && matchRole
  })

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title="Employee Management" sub="Create and manage employee accounts" />

      {error && <Alert type="error" style={{ marginBottom:16 }}>{error}</Alert>}
      {success && <Alert type="success" style={{ marginBottom:16 }}>{success}</Alert>}

      {/* Toolbar */}
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <input
          placeholder="Search by name, email, or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:200, background:'#1A1A22', border:'1px solid #2A2A35', borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'9px 12px', outline:'none' }}
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
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
          ['Inactive', employees.filter(e => !e.is_active).length, '#FF453A'],
          ['Roles', new Set(employees.map(e => e.role)).size, '#BF5AF2'],
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
                {['Employee', 'Email', 'Role', 'Department', 'Status', 'Wallet', 'Last Login', 'Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', fontWeight:500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!filtered.length ? (
                <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#444' }}>No employees found</td></tr>
              ) : filtered.map(emp => (
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
                        <div style={{ fontSize:10, color:'#555' }}>{emp.emp_id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'10px 16px', color:'#888' }}>{emp.email}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:500,
                      background:(ROLE_COLORS[emp.role]||'#888')+'14', color:ROLE_COLORS[emp.role]||'#888' }}>
                      {emp.role}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px', color:'#666' }}>{emp.department || '—'}</td>
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
      </Card>

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal title={editId ? 'Edit Employee' : 'Create New Employee'} onClose={() => setShowModal(false)} width={500}>
          <form onSubmit={handleSubmit}>
            {formError && <Alert type="error">{formError}</Alert>}

            <Input label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rahul Sharma" required />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. rahul@company.in" required />
            <Input label={editId ? 'New Password (leave blank to keep current)' : 'Password'} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editId ? 'Leave blank to keep current' : 'Min 6 characters'} />

            <Select label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLE_NAMES.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>

            <Input label="Department" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Engineering" />
            <Input label="Reporting To" value={form.reporting_to} onChange={e => setForm(f => ({ ...f, reporting_to: e.target.value }))} placeholder="e.g. Manager name or ID" />

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update Employee' : 'Create Employee'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
