import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { tiersAPI, rolesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, Button, Input, Select, Alert, Spinner, Modal, PageTitle } from '../shared/UI'

// Authority ranks used to order the approval sequence (lowest authority first).
const ROLE_RANK = {
  'Super Admin': 1,
  'Booking Admin': 2,
  Manager: 3,
  Finance: 3,
  'Tech Lead': 4,
  'Software Engineer': 5,
}

export default function DesignationManagement() {
  const { user } = useAuth()
  const canEdit = user?.role === 'Super Admin'

  const [tiers,         setTiers]         = useState([])
  const [designations,  setDesignations]  = useState([])
  const [roles,         setRoles]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState('')
  const [search,        setSearch]        = useState('')
  const [roleFilter,    setRoleFilter]    = useState('')
  const [tierFilter,    setTierFilter]    = useState('')

  // Modal state: null | { mode:'create'|'edit', data:{...} }
  const [modal, setModal] = useState(null)
  const [errs,  setErrs]  = useState({})
  const [confirmRow, setConfirmRow] = useState(null)

  useEffect(() => { load() }, [])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(''), 3500); return () => clearTimeout(t) } }, [success])

  async function load() {
    try {
      setLoading(true)
      const [t, r] = await Promise.all([tiersAPI.list(), rolesAPI.list()])
      setTiers(t.data?.tiers || [])
      setDesignations(t.data?.designations || [])
      setRoles(r.data || [])
      setError('')
    } catch (e) { setError(e.message) }
    finally   { setLoading(false) }
  }

  function openCreate() {
    setModal({ mode: 'create', data: { designation: '', role: '', tier_id: '' } })
    setErrs({})
  }
  function openEdit(dt) {
    setModal({
      mode: 'edit',
      data: {
        id: dt.id,
        designation: dt.designation,
        role: dt.role || '',
        tier_id: dt.tier_id ? String(dt.tier_id) : '',
      },
    })
    setErrs({})
  }
  function closeModal() { setModal(null); setErrs({}) }

  function validate(data) {
    const e = {}
    const name = (data.designation || '').trim()
    if (!name) e.designation = 'Designation name is required'
    else {
      const dup = designations.find(d =>
        d.designation.toLowerCase() === name.toLowerCase() && d.id !== data.id
      )
      if (dup) e.designation = 'A designation with this name already exists'
    }
    if (!data.tier_id) e.tier_id = 'Select a tier'
    if (!data.role)    e.role    = 'Select a role'
    return e
  }

  async function save() {
    if (!modal) return
    const payload = {
      designation: modal.data.designation.trim(),
      tier_id:     Number(modal.data.tier_id),
      role:        modal.data.role || null,
    }
    const e = validate(modal.data)
    setErrs(e)
    if (Object.keys(e).length) return

    setSaving(true)
    try {
      if (modal.mode === 'edit') {
        await tiersAPI.updateDesignation(modal.data.id, payload)
        setSuccess(`Designation "${payload.designation}" updated`)
      } else {
        await tiersAPI.saveDesignation(payload)
        setSuccess(`Designation "${payload.designation}" added`)
      }
      closeModal()
      await load()
    } catch (err) {
      setErrs(prev => ({ ...prev, _form: err.message }))
    } finally { setSaving(false) }
  }

  function requestDelete(dt) {
    const employees  = Number(dt.employee_count   || 0)
    const chainSteps = Number(dt.chain_step_count || 0)
    const blockers   = []
    if (employees  > 0) blockers.push({ label: 'Employees on this designation', count: employees,  fixHint: 'Reassign them in Employee Management first.' })
    if (chainSteps > 0) blockers.push({ label: 'Approval-chain steps using this name', count: chainSteps, fixHint: 'Edit each affected employee\'s approver chain to remove this step.' })

    setConfirmRow({
      title: `Delete "${dt.designation}"?`,
      designation: dt.designation,
      blockers, // [] = clear to delete
      blocked: blockers.length > 0,
      onConfirm: async () => {
        setSaving(true)
        try {
          await tiersAPI.deleteDesignation(dt.designation)
          setSuccess(`Designation "${dt.designation}" deleted`)
          setConfirmRow(null)
          await load()
        } catch (e) {
          // Backend may have caught a race condition (someone added a user/chain step
          // between our list load and the delete). Surface the precise blockers.
          if (e.status === 409 && e.message) setError(e.message)
          else setError(e.message || 'Delete failed')
          await load() // refresh counts so the dialog reflects truth
        } finally { setSaving(false) }
      },
    })
  }

  // ── Filtered / sorted rows ──
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return designations
      .filter(d => !q || d.designation.toLowerCase().includes(q) || (d.role || '').toLowerCase().includes(q))
      .filter(d => !roleFilter || d.role === roleFilter)
      .filter(d => !tierFilter || String(d.tier_id) === tierFilter)
  }, [designations, search, roleFilter, tierFilter])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title="Designation Management" sub="Connects employees, roles, tiers, and approval flow" />
      {error   && <Alert type="error"   style={{ marginBottom: 12 }}>{error}</Alert>}
      {success && <Alert type="success" style={{ marginBottom: 12 }}>{success}</Alert>}

      {/* Relationship explainer */}
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color:'var(--text-muted)', fontWeight: 700, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom: 8 }}>
          How a designation flows through the system
        </div>
        <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap: 10, fontSize: 12, color:'var(--text-primary)' }}>
          <RelationChip label="Designation" accent />
          <Arrow />
          <RelationChip label="Role" hint="Role Manager" />
          <Arrow />
          <RelationChip label="Tier" hint="Tier Config" />
          <Arrow />
          <RelationChip label="Approval Flow" hint="sequential" />
          <Arrow />
          <RelationChip label="Employee" hint="onboarding auto-applies" />
        </div>
      </Card>

      {/* Toolbar */}
      <Card style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display:'flex', gap: 10, alignItems:'center', flexWrap:'wrap' }}>
          <input
            placeholder="Search by designation or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={toolbarInput({ flex: 1, minWidth: 220 })}
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={toolbarInput({ minWidth: 160 })}>
            <option value="">All roles</option>
            {roles.filter(r => r.is_active).map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} style={toolbarInput({ minWidth: 160 })}>
            <option value="">All tiers</option>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name} · rank {t.rank}</option>)}
          </select>
          <span style={{ marginLeft:'auto', fontSize: 11, color:'var(--text-muted)' }}>
            {rows.length} of {designations.length} designation{designations.length === 1 ? '' : 's'}
          </span>
          {canEdit && <Button onClick={openCreate}>+ New Designation</Button>}
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg-card-deep)' }}>
                {['Designation', 'Role', 'Tier', 'Approval Sequence', 'Employees', canEdit ? 'Actions' : ''].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} style={{ padding: '28px 16px', fontSize: 12, color:'var(--text-muted)', textAlign:'center' }}>
                    {designations.length === 0
                      ? 'No designations configured yet. Add one to get started.'
                      : 'No designations match the current filters.'}
                  </td>
                </tr>
              )}
              {rows.map(dt => {
                const role = roles.find(r => r.name === dt.role)
                const roleColor = role?.color || 'var(--accent)'
                const approverChain = Array.isArray(dt.tier_approver_roles) && dt.tier_approver_roles.length
                  ? [...dt.tier_approver_roles].sort((a, b) => (ROLE_RANK[b] ?? 99) - (ROLE_RANK[a] ?? 99))
                  : []
                return (
                  <tr key={dt.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 13, fontWeight: 600, color:'var(--text-primary)' }}>{dt.designation}</div>
                    </td>
                    <td style={tdStyle}>
                      {dt.role ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding:'3px 9px', borderRadius: 999,
                          background: roleColor + '18', color: roleColor, border: `1px solid ${roleColor}40`,
                        }}>{dt.role}</span>
                      ) : (
                        <span style={{ fontSize: 11, color:'#FF9F0A' }}>⚠ Not set</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {dt.tier_name ? (
                        <span style={{
                          fontSize: 11, fontWeight: 700, letterSpacing:'0.04em', padding:'3px 9px', borderRadius: 999,
                          color:'var(--accent)', background:'color-mix(in srgb, var(--accent) 14%, transparent)',
                          border:'1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                        }}>{dt.tier_name} · rank {dt.tier_rank}</span>
                      ) : <span style={{ fontSize: 11, color:'#FF9F0A' }}>⚠ Not set</span>}
                    </td>
                    <td style={tdStyle}>
                      {approverChain.length === 0
                        ? <span style={{ fontSize: 11, color:'var(--text-muted)' }}>No approval required</span>
                        : (
                          <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap: 4 }}>
                            {approverChain.map((name, i) => (
                              <span key={name} style={{ display:'inline-flex', alignItems:'center', gap: 4 }}>
                                <span style={chipStyle(roles.find(r => r.name === name)?.color)}>{name}</span>
                                {i < approverChain.length - 1 && <span style={{ color:'var(--text-muted)', fontWeight: 700 }}>→</span>}
                              </span>
                            ))}
                          </div>
                        )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding:'3px 9px', borderRadius: 999,
                        background: dt.employee_count > 0 ? '#30D15818' : 'var(--bg-input)',
                        color:      dt.employee_count > 0 ? '#30D158'   : 'var(--text-muted)',
                        border: `1px solid ${dt.employee_count > 0 ? '#30D15840' : 'var(--border)'}`,
                      }}>{dt.employee_count ?? 0}</span>
                    </td>
                    {canEdit && (
                      <td style={tdStyle}>
                        <div style={{ display:'flex', gap: 6 }}>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(dt)}>Edit</Button>
                          <Button size="sm"
                            style={{ background:'#FF453A18', color:'#FF453A', border:'1px solid #FF453A30' }}
                            title="Delete this designation mapping"
                            onClick={() => requestDelete(dt)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      {modal && (
        <Modal title={modal.mode === 'create' ? 'New Designation' : `Edit ${modal.data.designation}`} onClose={closeModal} width={520}>
          {errs._form && <Alert type="error" style={{ marginBottom: 12 }}>{errs._form}</Alert>}
          <Input
            label="Designation Name *"
            value={modal.data.designation}
            onChange={e => setModal(m => ({ ...m, data: { ...m.data, designation: e.target.value } }))}
            placeholder="e.g. Senior Software Engineer"
            error={errs.designation}
          />
          <Select
            label="Role *"
            value={modal.data.role}
            onChange={e => setModal(m => ({ ...m, data: { ...m.data, role: e.target.value } }))}
            error={errs.role}
          >
            <option value="">Select a role</option>
            {roles.filter(r => r.is_active).map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </Select>
          <Select
            label="Tier *"
            value={modal.data.tier_id}
            onChange={e => setModal(m => ({ ...m, data: { ...m.data, tier_id: e.target.value } }))}
            error={errs.tier_id}
          >
            <option value="">Select a tier</option>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name} · rank {t.rank} {t.is_active === false ? '· (inactive)' : ''}</option>)}
          </Select>

          {modal.data.tier_id && (() => {
            const selectedTier = tiers.find(t => String(t.id) === String(modal.data.tier_id))
            if (!selectedTier) return null
            const chain = Array.isArray(selectedTier.approver_roles) && selectedTier.approver_roles.length
              ? [...selectedTier.approver_roles].sort((a, b) => (ROLE_RANK[b] ?? 99) - (ROLE_RANK[a] ?? 99))
              : []
            return (
              <div style={{
                marginTop: 6, marginBottom: 12, padding:'10px 12px', borderRadius: 8,
                background:'color-mix(in srgb, var(--accent) 10%, transparent)',
                border:'1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--accent)', marginBottom: 6 }}>
                  Preview · Approval Flow
                </div>
                <div style={{ fontSize: 12, color:'var(--text-primary)' }}>
                  {chain.length === 0 ? 'No approval required for this tier.' : chain.join('  →  ')}
                </div>
              </div>
            )
          })()}

          <div style={{ display:'flex', justifyContent:'flex-end', gap: 10, marginTop: 8 }}>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : modal.mode === 'create' ? 'Create Designation' : 'Save Changes'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Confirm delete dialog */}
      {confirmRow && createPortal(
        <div style={{ position:'fixed', inset: 0, background:'rgba(0,0,0,.55)', zIndex: 9999, display:'flex', alignItems:'center', justifyContent:'center', padding: 20 }}>
          <div style={{ width:'100%', maxWidth: 480, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius: 12, padding: 22, boxShadow:'0 20px 50px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color:'var(--text-primary)', marginBottom: 10 }}>
              {confirmRow.title}
            </div>

            {confirmRow.blocked ? (
              <>
                <div style={{ fontSize: 13, color:'#FF9F0A', lineHeight: 1.5, marginBottom: 12 }}>
                  This designation cannot be deleted yet — it's still referenced elsewhere:
                </div>
                <div style={{
                  background:'color-mix(in srgb, #FF453A 8%, transparent)',
                  border:'1px solid color-mix(in srgb, #FF453A 25%, transparent)',
                  borderRadius: 8, padding:'10px 12px', marginBottom: 14,
                }}>
                  {confirmRow.blockers.map((b, i) => (
                    <div key={i} style={{ display:'flex', gap: 10, alignItems:'flex-start', padding:'4px 0' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding:'2px 8px', borderRadius: 999,
                        background:'#FF453A20', color:'#FF453A', minWidth: 32, textAlign:'center',
                      }}>{b.count}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color:'var(--text-primary)' }}>{b.label}</div>
                        <div style={{ fontSize: 11, color:'var(--text-muted)', marginTop: 2 }}>{b.fixHint}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color:'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
                This will remove the designation → role → tier mapping. No employees or approval chain steps reference it, so the delete is safe.
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setConfirmRow(null)} disabled={saving}>
                {confirmRow.blocked ? 'Close' : 'Cancel'}
              </Button>
              <Button
                style={{
                  background: confirmRow.blocked ? '#FF453A55' : '#FF453A',
                  color:'#fff', border:'none',
                  cursor: confirmRow.blocked ? 'not-allowed' : 'pointer',
                }}
                onClick={confirmRow.onConfirm}
                disabled={saving || confirmRow.blocked}
                title={confirmRow.blocked ? 'Resolve the blockers above first' : 'Permanently delete this mapping'}
              >
                {saving ? 'Working…' : confirmRow.blocked ? 'Blocked' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function RelationChip({ label, hint, accent }) {
  return (
    <span style={{
      display:'inline-flex', flexDirection:'column', padding:'6px 12px', borderRadius: 8,
      background: accent ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--bg-input)',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
      minWidth: 80,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{label}</span>
      {hint && <span style={{ fontSize: 9, color:'var(--text-muted)', marginTop: 2 }}>{hint}</span>}
    </span>
  )
}
function Arrow() { return <span style={{ fontSize: 16, color:'var(--text-muted)', fontWeight: 700 }}>→</span> }

const thStyle = { textAlign:'left', padding:'12px 16px', fontSize: 10, fontWeight: 700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-muted)' }
const tdStyle = { padding:'12px 16px', fontSize: 12, color:'var(--text-primary)', verticalAlign:'middle' }

function chipStyle(color) {
  const c = color || 'var(--accent)'
  return {
    fontSize: 10, fontWeight: 600, padding:'2px 8px', borderRadius: 999,
    background: `${c}18`, color: c, border: `1px solid ${c}40`,
  }
}

function toolbarInput(extra = {}) {
  return {
    background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius: 8,
    color:'var(--text-primary)', padding:'8px 12px', fontSize: 12, outline:'none',
    ...extra,
  }
}
