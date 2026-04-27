import { useState, useEffect } from 'react'
import { rolesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, Button, Input, Alert, Spinner, Modal, PageTitle } from '../shared/UI'

export default function RoleManagement() {
  const { user } = useAuth()
  const [roles, setRoles]           = useState([])
  const [allPages, setAllPages]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editRole, setEditRole]     = useState(null)
  const [form, setForm]             = useState({ name: '', description: '', color: '#0A84FF' })
  const [selectedPages, setSelectedPages] = useState([])
  const [formError, setFormError]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [expandedRole, setExpandedRole] = useState(null)

  const accent = user.color || '#30D158'

  useEffect(() => { load() }, [])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t) } }, [success])

  async function load() {
    try {
      setLoading(true)
      const [rolesRes, pagesRes] = await Promise.all([rolesAPI.list(), rolesAPI.pages()])
      setRoles(rolesRes.data)
      setAllPages(pagesRes.data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function openCreate() {
    setEditRole(null)
    setForm({ name: '', description: '', color: '#0A84FF' })
    setSelectedPages([])
    setFormError('')
    setShowModal(true)
  }

  function openEdit(role) {
    setEditRole(role)
    setForm({ name: role.name, description: role.description || '', color: role.color || '#888' })
    setSelectedPages(role.pages.map(p => p.page_id))
    setFormError('')
    setShowModal(true)
  }

  function togglePage(pageId) {
    setSelectedPages(prev =>
      prev.includes(pageId) ? prev.filter(p => p !== pageId) : [...prev, pageId]
    )
  }

  function selectGroup(group) {
    const groupPageIds = allPages.filter(p => p.group === group).map(p => p.id)
    const allSelected = groupPageIds.every(id => selectedPages.includes(id))
    if (allSelected) {
      setSelectedPages(prev => prev.filter(id => !groupPageIds.includes(id)))
    } else {
      setSelectedPages(prev => [...new Set([...prev, ...groupPageIds])])
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!editRole && !form.name.trim()) {
      return setFormError('Role name is required')
    }

    if (!selectedPages.length) {
      return setFormError('Select at least one page for this role')
    }

    setSaving(true)
    try {
      const pages = selectedPages.map((pageId, i) => {
        const info = allPages.find(p => p.id === pageId)
        return { page_id: pageId, label: info?.label || pageId, icon: info?.icon || '◈' }
      })

      if (editRole) {
        await rolesAPI.update(editRole.id, { description: form.description, color: form.color, pages })
        setSuccess(`Role "${editRole.name}" updated`)
      } else {
        await rolesAPI.create({ name: form.name.trim(), description: form.description, color: form.color, pages })
        setSuccess(`Role "${form.name.trim()}" created`)
      }
      setShowModal(false)
      load()
    } catch (err) {
      setFormError(err.message)
    } finally { setSaving(false) }
  }

  async function handleDelete(role) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return
    try {
      await rolesAPI.remove(role.id)
      setSuccess(`Role "${role.name}" deleted`)
      load()
    } catch (err) { setError(err.message) }
  }

  // Group pages by category
  const pageGroups = allPages.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = []
    acc[p.group].push(p)
    return acc
  }, {})

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title="Role Manager" sub="Create roles and assign page access" />

      {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}
      {success && <Alert type="success" style={{ marginBottom: 16 }}>{success}</Alert>}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: '#555' }}>{roles.length} role{roles.length !== 1 ? 's' : ''} configured</div>
        <Button onClick={openCreate}>+ New Role</Button>
      </div>

      {/* Role cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {roles.map(role => {
          const isExpanded = expandedRole === role.id
          return (
            <Card key={role.id} style={{ overflow: 'hidden' }}>
              {/* Role header */}
              <div
                onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: role.color + '22', border: `2px solid ${role.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: role.color,
                  }}>
                    {role.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#E2E2E8' }}>{role.name}</span>
                      {role.is_system && (
                        <span style={{ fontSize: 9, background: '#FFD60A18', color: '#FFD60A', padding: '1px 7px', borderRadius: 10, fontWeight: 500 }}>SYSTEM</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{role.description || 'No description'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 20,
                    background: role.color + '14', color: role.color, fontWeight: 500,
                  }}>
                    {role.pages?.length || 0} page{role.pages?.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: '#444', fontSize: 16, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                </div>
              </div>

              {/* Expanded: page list + used-by panel + actions */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #1E1E2A', padding: '16px 20px' }}>
                  {/* Pages grid */}
                  <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Allowed Pages</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {role.pages?.length ? role.pages.map(p => (
                      <span key={p.page_id} style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 8,
                        background: '#1A1A22', color: '#ccc', display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 12 }}>{p.page_icon}</span> {p.page_label}
                      </span>
                    )) : (
                      <span style={{ fontSize: 12, color: '#444' }}>No pages assigned</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(role)}>Edit Role</Button>
                    {!role.is_system && (
                      <Button size="sm" variant="danger" onClick={() => handleDelete(role)}>Delete</Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal title={editRole ? `Edit Role — ${editRole.name}` : 'Create New Role'} onClose={() => setShowModal(false)} width={600}>
          <form onSubmit={handleSubmit}>
            {formError && <Alert type="error">{formError}</Alert>}

            {!editRole && (
              <Input label="Role Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HR Manager" required />
            )}
            <Input label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this role" />

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 6 }}>Role Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['#0A84FF', '#BF5AF2', '#FF9F0A', '#40C8E0', '#FF6B6B', '#30D158', '#FFD60A', '#FF453A', '#5E5CE6', '#AC8E68'].map(c => (
                  <div
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: form.color === c ? '3px solid #fff' : '3px solid transparent',
                      transition: 'border .15s',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Page selection */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 10 }}>
                Page Access ({selectedPages.length} selected)
              </label>

              {Object.entries(pageGroups).map(([group, groupPages]) => {
                const allInGroup = groupPages.every(p => selectedPages.includes(p.id))
                const someInGroup = groupPages.some(p => selectedPages.includes(p.id))
                return (
                  <div key={group} style={{ marginBottom: 12 }}>
                    {/* Group header */}
                    <div
                      onClick={() => selectGroup(group)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 0', cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `2px solid ${allInGroup ? accent : '#3A3A4A'}`,
                        background: allInGroup ? accent : someInGroup ? accent + '44' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: '#fff', fontWeight: 700,
                      }}>
                        {allInGroup ? '✓' : someInGroup ? '—' : ''}
                      </div>
                      <span style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{group}</span>
                    </div>

                    {/* Page checkboxes */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, marginLeft: 24 }}>
                      {groupPages.map(page => {
                        const checked = selectedPages.includes(page.id)
                        return (
                          <div
                            key={page.id}
                            onClick={() => togglePage(page.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                              background: checked ? (form.color || accent) + '12' : 'transparent',
                              border: `1px solid ${checked ? (form.color || accent) + '30' : 'transparent'}`,
                              transition: 'all .15s',
                            }}
                          >
                            <div style={{
                              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                              border: `2px solid ${checked ? (form.color || accent) : '#3A3A4A'}`,
                              background: checked ? (form.color || accent) : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, color: '#fff', fontWeight: 700,
                            }}>
                              {checked ? '✓' : ''}
                            </div>
                            <span style={{ fontSize: 13 }}>{page.icon}</span>
                            <span style={{ fontSize: 12, color: checked ? '#E2E2E8' : '#666' }}>{page.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editRole ? 'Update Role' : 'Create Role'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

