import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminUsersAPI, rolesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, PageTitle, Alert, Spinner, Button, Modal, Input, Select } from '../shared/UI'

/* Inline eye-toggle icons — same lucide-style stroke language used by the
   sidebar / login page so the affordance fits the rest of the app. */
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

/* Local password input — wraps the shared .input/.field styles so it
   stays visually identical to other modal inputs, plus an absolutely
   positioned toggle button on the right edge. */
function PasswordField({ label, value, onChange, error, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`input ${error ? 'input-error' : ''}`}
          style={{ width: '100%', paddingRight: 40 }}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          title={show ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            background: 'transparent',
            border: 0,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 6,
            padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}

/* Toast — fixed-corner popup notification used for create / edit / delete
   outcomes (success or error). Auto-dismisses after 3.8s. Themed via the
   same CSS variables as the rest of the app so it reads correctly in dark,
   light and ocean themes without per-theme overrides. */
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3800)
    return () => clearTimeout(t)
  }, [onClose])

  const accent =
    type === 'success' ? 'var(--success)' :
    type === 'error'   ? 'var(--danger)'  :
    type === 'warn'    ? 'var(--warning, var(--danger))' :
                         'var(--accent)'
  const icon =
    type === 'success' ? '✓' :
    type === 'error'   ? '✕' :
    type === 'warn'    ? '!' :
                         'i'

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 24, right: 24, zIndex: 9999,
        background: 'var(--bg-card)',
        border: `1px solid color-mix(in srgb, ${accent} 30%, var(--border))`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: '12px 14px 12px 14px',
        maxWidth: 420, minWidth: 280,
        boxShadow: '0 10px 32px rgba(0,0,0,0.28), 0 0 0 1px color-mix(in srgb, ' + accent + ' 12%, transparent)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        animation: 'fadeUp .22s ease',
      }}
    >
      <span style={{
        flexShrink: 0,
        width: 22, height: 22, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${accent} 14%, transparent)`,
        color: accent, fontSize: 13, fontWeight: 800,
      }}>{icon}</span>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>
        {message}
      </div>
      <button
        type="button" onClick={onClose} aria-label="Dismiss"
        style={{
          flexShrink: 0, background: 'transparent', border: 0,
          color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, padding: 4, marginTop: -2,
        }}>
        ✕
      </button>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Admin Users — Phase 1 of the RBAC feature.
   Lists users whose role != 'Employee', exposes create/edit, and
   lets a Super Admin edit the V/C/E/D permission matrix for the
   role attached to each admin user.
   ────────────────────────────────────────────────────────────── */

const ACTIONS = [
  { key: 'can_view',   label: 'View'   },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit',   label: 'Edit'   },
  { key: 'can_delete', label: 'Delete' },
]

export default function AdminUsers() {
  const { user: me } = useAuth()
  // The page itself is reachable by anyone whose role grants can_view on
  // 'admin-users'. Action gating below disables Create/Edit/Delete buttons
  // for roles that only have view rights — matches backend enforcement.
  const myPage = me?.pages?.find(p => p.id === 'admin-users') || {}
  const canCreate = !!myPage.can_create
  const canEdit   = !!myPage.can_edit
  const canDelete = !!myPage.can_delete

  const [admins,        setAdmins]        = useState([])
  const [adminRoles,    setAdminRoles]    = useState([])
  const [allPages,      setAllPages]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')

  // Toast popup — single-slot, replaces the in-page success Alert. Surfaces
  // both success and error outcomes from create / edit / deactivate.
  const [toast,         setToast]         = useState(null)
  const showToast = useCallback((message, type = 'info') => setToast({ message, type }), [])

  // Modal state
  const [modal,         setModal]         = useState(null) // null | { mode, data, errors, perms }
  const [saving,        setSaving]        = useState(false)
  const [confirmRow,    setConfirmRow]    = useState(null) // deactivate confirmation

  // Pagination — same pattern as Employees list (10 rows / page, prev/next +
  // page numbers with ellipsis collapse). Resets to page 1 on reload.
  const [page,          setPage]          = useState(1)
  const perPage = 10

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const [u, r, p] = await Promise.all([
        adminUsersAPI.list(),
        adminUsersAPI.roles(),
        rolesAPI.pages(), // master ALL_PAGES list (admin-only filtered client-side)
      ])
      setAdmins(u.data || [])
      setAdminRoles(r.data || [])
      // Show every registered page in the matrix — the matrix IS the complete
      // picture of what the role can access, so leaving employee-side pages
      // off the list would silently leak them through (untouched rows in
      // role_pages would survive a save). Backend now does full replacement.
      setAllPages(p.data || [])
      setError('')
    } catch (e) { setError(e.message) }
    finally   { setLoading(false) }
  }

  // ── Modal lifecycle ───────────────────────────────────────
  async function openCreate() {
    if (!canCreate) return
    setModal({
      mode: 'create',
      data: { name: '', email: '', password: '', role: '', is_active: true },
      errors: {},
      perms: emptyPermissionMatrix(allPages),
      permsRole: '',
      permsLoading: false,
    })
  }

  async function openEdit(adminUser) {
    if (!canEdit) return
    setModal({
      mode: 'edit',
      data: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        password: '',
        role: adminUser.role,
        is_active: !!adminUser.is_active,
      },
      errors: {},
      perms: emptyPermissionMatrix(allPages),
      permsRole: adminUser.role,
      permsLoading: true,
    })
    // Load the current role's permissions into the matrix.
    try {
      const r = await adminUsersAPI.getPermissions(adminUser.role)
      setModal(m => m && { ...m, perms: mergePermissions(allPages, r.data || []), permsLoading: false })
    } catch (e) {
      setModal(m => m && { ...m, perms: emptyPermissionMatrix(allPages), permsLoading: false })
    }
  }

  async function handleRoleChange(role) {
    setModal(m => m && { ...m, data: { ...m.data, role }, permsRole: role, permsLoading: true })
    if (!role) { return }
    try {
      const r = await adminUsersAPI.getPermissions(role)
      setModal(m => m && { ...m, perms: mergePermissions(allPages, r.data || []), permsLoading: false })
    } catch {
      setModal(m => m && { ...m, perms: emptyPermissionMatrix(allPages), permsLoading: false })
    }
  }

  function setPerm(pageId, key, value) {
    setModal(m => {
      if (!m) return m
      const next = m.perms.map(row => row.page_id === pageId ? { ...row, [key]: !!value } : row)
      return { ...m, perms: next }
    })
  }

  function setRowAll(pageId, value) {
    setModal(m => {
      if (!m) return m
      const next = m.perms.map(row => row.page_id === pageId
        ? { ...row, can_view: !!value, can_create: !!value, can_edit: !!value, can_delete: !!value }
        : row
      )
      return { ...m, perms: next }
    })
  }

  function validate(d) {
    const e = {}
    if (!d.name?.trim()) e.name = 'Name is required'
    const email = (d.email || '').trim().toLowerCase()
    if (!email)                              e.email = 'Email is required'
    else if (!/.+@.+\..+/.test(email))       e.email = 'Email looks invalid'
    if (modal?.mode === 'create' && (d.password || '').length < 6) {
      e.password = 'Password must be at least 6 characters'
    }
    if (d.password && d.password.length > 0 && d.password.length < 6) {
      e.password = 'Password must be at least 6 characters'
    }
    if (!d.role) e.role = 'Role is required'
    return e
  }

  async function save() {
    if (!modal) return
    const errs = validate(modal.data)
    setModal(m => m && { ...m, errors: errs })
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      // 1. Save the admin user (create or update).
      let userResp
      if (modal.mode === 'create') {
        userResp = await adminUsersAPI.create({
          name:      modal.data.name.trim(),
          email:     modal.data.email.trim().toLowerCase(),
          password:  modal.data.password,
          role:      modal.data.role,
          is_active: modal.data.is_active,
        })
      } else {
        const body = {
          name:      modal.data.name.trim(),
          role:      modal.data.role,
          is_active: modal.data.is_active,
        }
        if (modal.data.password) body.password = modal.data.password
        userResp = await adminUsersAPI.update(modal.data.id, body)
      }

      // 2. Save the permission matrix for the selected role.
      // The matrix is role-scoped — saving it updates permissions for everyone
      // with this role (existing architecture). The UI surfaces this via copy.
      if (modal.data.role) {
        await adminUsersAPI.setPermissions(modal.data.role, modal.perms.map(r => ({
          page_id:    r.page_id,
          page_label: r.page_label,
          page_icon:  r.page_icon,
          can_view:   r.can_view,
          can_create: r.can_create,
          can_edit:   r.can_edit,
          can_delete: r.can_delete,
        })))
      }

      showToast(modal.mode === 'create'
        ? `Admin user "${userResp.data?.name || modal.data.name}" created`
        : `Admin user "${userResp.data?.name || modal.data.name}" updated`,
        'success')
      setModal(null)
      await load()
    } catch (e) {
      // Surface the failure both inside the modal (so the user keeps their
      // typed values and sees what to fix) and as a toast popup (so the
      // failure is visible even if the modal is dismissed).
      setModal(m => m && { ...m, errors: { ...m.errors, _form: e.message } })
      showToast(e.message || 'Failed to save admin user', 'error')
    } finally { setSaving(false) }
  }

  function requestDeactivate(adminUser) {
    if (!canDelete) return
    setConfirmRow({
      title: `Deactivate "${adminUser.name}"?`,
      message: `${adminUser.email} will be unable to sign in until reactivated. Existing records and audit history are preserved.`,
      onConfirm: async () => {
        setSaving(true)
        try {
          await adminUsersAPI.remove(adminUser.id)
          showToast(`"${adminUser.name}" deactivated`, 'success')
          setConfirmRow(null)
          await load()
        } catch (e) {
          showToast(e.message || 'Failed to deactivate user', 'error')
        }
        finally   { setSaving(false) }
      },
    })
  }

  const filteredAdmins = useMemo(() => admins, [admins])

  // Recompute pagination from the current admin list. `safePage` clamps the
  // page when the dataset shrinks (e.g. after deactivating the only row on
  // the last page) so we never render an empty pagination slice.
  const totalPages = Math.max(1, Math.ceil(filteredAdmins.length / perPage))
  const safePage   = Math.min(page, totalPages)
  const paged      = filteredAdmins.slice((safePage - 1) * perPage, safePage * perPage)
  // If safePage clamped down (e.g. the last row on page 3 was deactivated),
  // sync the controlled state so the "Prev / Next" buttons stay accurate.
  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage, page])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle
        title="Admin Users"
        sub="Internal users who manage employees, roles, tiers, bookings — separate from raise-request employees."
      />
      {error && <Alert type="error" style={{ marginBottom: 12 }}>{error}</Alert>}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Toolbar */}
      <Card style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 10, flexWrap:'wrap' }}>
          <div style={{ fontSize: 11, color:'var(--text-muted)' }}>
            {admins.length} admin user{admins.length === 1 ? '' : 's'} · permissions enforced server-side
          </div>
          <Button onClick={openCreate} disabled={!canCreate} title={canCreate ? '' : 'You do not have create permission'}>
            + New Admin User
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg-card-deep)' }}>
                {['Name', 'Email', 'Role', 'Status', 'Last login', canEdit || canDelete ? 'Actions' : ''].filter(Boolean).map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding:'28px 16px', fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>
                    No admin users yet.
                  </td>
                </tr>
              )}
              {paged.map(a => (
                <tr key={a.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 13, fontWeight: 600, color:'var(--text-primary)' }}>{a.name}</div>
                    <div style={{ fontSize: 11, color:'var(--text-muted)', marginTop: 2 }}>{a.emp_id}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color:'var(--text-body)' }}>{a.email}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={chipStyle('var(--accent)')}>{a.role}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding:'3px 9px', borderRadius: 999,
                      background: a.is_active ? 'color-mix(in srgb, var(--success) 9%, transparent)' : 'color-mix(in srgb, var(--danger) 9%, transparent)',
                      color:      a.is_active ? 'var(--success)' : 'var(--danger)',
                      border:     `1px solid ${a.is_active ? 'color-mix(in srgb, var(--success) 25%, transparent)' : 'color-mix(in srgb, var(--danger) 25%, transparent)'}`,
                    }}>{a.is_active ? '● Active' : '● Inactive'}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, color:'var(--text-muted)' }}>
                      {a.last_login ? new Date(a.last_login).toLocaleString('en-IN') : 'Never'}
                    </span>
                  </td>
                  {(canEdit || canDelete) && (
                    <td style={tdStyle}>
                      <div style={{ display:'flex', gap: 6 }}>
                        {canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Edit</Button>
                        )}
                        {canDelete && a.is_active && (
                          <Button size="sm"
                            style={{ background:'color-mix(in srgb, var(--danger) 9%, transparent)', color: 'var(--text-danger)', border:'1px solid color-mix(in srgb, var(--danger) 19%, transparent)' }}
                            onClick={() => requestDeactivate(a)}>
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination — same look/behaviour as the Employees list */}
        {filteredAdmins.length > perPage && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim, var(--text-muted))' }}>
              Showing {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filteredAdmins.length)} of {filteredAdmins.length}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={{
                  background: 'none', border: '1px solid var(--border-input, var(--border))',
                  borderRadius: 6, padding: '5px 10px', fontSize: 12,
                  color: safePage <= 1 ? 'var(--text-dim, var(--text-muted))' : 'var(--text-muted)',
                  cursor: safePage <= 1 ? 'default' : 'pointer',
                }}>← Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) => p === '...' ? (
                  <span key={`dot-${i}`} style={{ color: 'var(--text-dim, var(--text-muted))', fontSize: 12, padding: '0 4px' }}>...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 30, height: 30, borderRadius: 6,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: p === safePage ? 'var(--accent)' : 'none',
                      border:     p === safePage ? 'none' : '1px solid var(--border-input, var(--border))',
                      color:      p === safePage ? '#fff' : 'var(--text-faint, var(--text-muted))',
                    }}>{p}</button>
                ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={{
                  background: 'none', border: '1px solid var(--border-input, var(--border))',
                  borderRadius: 6, padding: '5px 10px', fontSize: 12,
                  color: safePage >= totalPages ? 'var(--text-dim, var(--text-muted))' : 'var(--text-muted)',
                  cursor: safePage >= totalPages ? 'default' : 'pointer',
                }}>Next →</button>
            </div>
          </div>
        )}
      </Card>

      {/* Create / Edit modal */}
      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'New Admin User' : `Edit ${modal.data.name}`}
          onClose={() => !saving && setModal(null)}
          width={780}
        >
          {modal.errors._form && <Alert type="error" style={{ marginBottom: 12 }}>{modal.errors._form}</Alert>}

          {/* Basic fields */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
            <Input
              label="Name *"
              value={modal.data.name}
              onChange={e => setModal(m => m && { ...m, data: { ...m.data, name: e.target.value } })}
              error={modal.errors.name}
              placeholder="e.g. Aisha Khan"
            />
            <Input
              label="Email *"
              type="email"
              value={modal.data.email}
              onChange={e => setModal(m => m && { ...m, data: { ...m.data, email: e.target.value } })}
              error={modal.errors.email}
              placeholder="aisha@company.in"
              disabled={modal.mode === 'edit'}
            />
            <PasswordField
              label={modal.mode === 'create' ? 'Password *' : 'New password (leave blank to keep)'}
              value={modal.data.password}
              onChange={e => setModal(m => m && { ...m, data: { ...m.data, password: e.target.value } })}
              error={modal.errors.password}
              placeholder={modal.mode === 'create' ? 'Min 6 characters' : '••••••••'}
            />
            <Select
              label="Role *"
              value={modal.data.role}
              onChange={e => handleRoleChange(e.target.value)}
              error={modal.errors.role}
            >
              <option value="">Select a role</option>
              {adminRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
            </Select>

            <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius: 8, background:'var(--bg-input)', border:'1px solid var(--border)', marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={!!modal.data.is_active}
                onChange={e => setModal(m => m && { ...m, data: { ...m.data, is_active: e.target.checked } })}
                style={{ accentColor:'var(--accent)', cursor:'pointer', width:16, height:16 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color:'var(--text-primary)' }}>Active</span>
              <span style={{ fontSize: 11, color:'var(--text-muted)' }}>· uncheck to disable login without deleting the account</span>
            </div>
          </div>

          {/* Permission matrix */}
          <div style={{ marginTop: 6 }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color:'var(--text-primary)' }}>Permission Matrix</div>
                <div style={{ fontSize: 11, color:'var(--text-muted)', marginTop: 2 }}>
                  Permissions are scoped to <b>role</b>. Editing here updates every admin user holding the
                  <b> {modal.data.role || '—'}</b> role.
                </div>
              </div>
              <div style={{ display:'flex', gap: 6 }}>
                <Button size="sm" variant="ghost"
                  disabled={!modal.data.role || modal.permsLoading}
                  onClick={() => setModal(m => m && { ...m, perms: m.perms.map(r => ({ ...r, can_view:true, can_create:true, can_edit:true, can_delete:true })) })}>
                  Grant all
                </Button>
                <Button size="sm" variant="ghost"
                  disabled={!modal.data.role || modal.permsLoading}
                  onClick={() => setModal(m => m && { ...m, perms: m.perms.map(r => ({ ...r, can_view:false, can_create:false, can_edit:false, can_delete:false })) })}>
                  Clear all
                </Button>
              </div>
            </div>

            {!modal.data.role ? (
              <div style={{ padding: '20px 16px', borderRadius: 10, background: 'var(--bg-input)', border: '1px dashed var(--border)', textAlign:'center', fontSize: 12, color:'var(--text-muted)' }}>
                Select a role to view and edit its permission matrix.
              </div>
            ) : modal.permsLoading ? (
              <div style={{ display:'flex', justifyContent:'center', padding: 30 }}><Spinner size={24} /></div>
            ) : (
              <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius: 10 }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-card-deep)' }}>
                      <th style={{ ...thStyle, width:'40%' }}>Module / Page</th>
                      {ACTIONS.map(a => (
                        <th key={a.key} style={{ ...thStyle, textAlign:'center' }}>{a.label}</th>
                      ))}
                      <th style={{ ...thStyle, textAlign:'center' }}>All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modal.perms.map(row => {
                      const allOn = row.can_view && row.can_create && row.can_edit && row.can_delete
                      return (
                        <tr key={row.page_id} style={{ borderTop:'1px solid var(--border)' }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>
                            <div style={{ fontSize: 13, color:'var(--text-primary)' }}>{row.page_label}</div>
                            <div style={{ fontSize: 10, color:'var(--text-muted)', marginTop: 2 }}>{row.page_id}</div>
                          </td>
                          {ACTIONS.map(a => (
                            <td key={a.key} style={{ ...tdStyle, textAlign:'center' }}>
                              <input
                                type="checkbox"
                                checked={!!row[a.key]}
                                onChange={e => setPerm(row.page_id, a.key, e.target.checked)}
                                style={{ accentColor:'var(--accent)', cursor:'pointer', width:16, height:16 }}
                                aria-label={`${a.label} on ${row.page_label}`}
                              />
                            </td>
                          ))}
                          <td style={{ ...tdStyle, textAlign:'center' }}>
                            <input
                              type="checkbox"
                              checked={allOn}
                              onChange={e => setRowAll(row.page_id, e.target.checked)}
                              style={{ accentColor:'var(--accent)', cursor:'pointer', width:16, height:16 }}
                              aria-label={`Toggle all on ${row.page_label}`}
                            />
                          </td>
                        </tr>
                      )
                    })}
                    {modal.perms.length === 0 && (
                      <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', color:'var(--text-muted)' }}>No admin pages registered.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap: 10, marginTop: 18 }}>
            <Button variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : modal.mode === 'create' ? 'Create Admin User' : 'Save Changes'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Confirm deactivation */}
      {confirmRow && (
        <Modal title={confirmRow.title} onClose={() => !saving && setConfirmRow(null)} width={420}>
          <div style={{ fontSize: 13, color:'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
            {confirmRow.message}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmRow(null)} disabled={saving}>Cancel</Button>
            <Button
              style={{ background:'var(--danger)', color:'#fff', border:'none' }}
              onClick={confirmRow.onConfirm}
              disabled={saving}>
              {saving ? 'Working…' : 'Deactivate'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────
function emptyPermissionMatrix(allPages) {
  return (allPages || []).map(p => ({
    page_id:    p.id,
    page_label: p.label,
    page_icon:  p.icon,
    can_view:   false,
    can_create: false,
    can_edit:   false,
    can_delete: false,
  }))
}

function mergePermissions(allPages, existing) {
  const byId = new Map((existing || []).map(p => [p.page_id, p]))
  return (allPages || []).map(p => {
    const e = byId.get(p.id)
    return {
      page_id:    p.id,
      page_label: e?.page_label || p.label,
      page_icon:  e?.page_icon  || p.icon,
      can_view:   !!e?.can_view,
      can_create: !!e?.can_create,
      can_edit:   !!e?.can_edit,
      can_delete: !!e?.can_delete,
    }
  })
}

const thStyle = { textAlign:'left', padding:'12px 16px', fontSize: 10, fontWeight: 700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-muted)' }
const tdStyle = { padding:'12px 16px', fontSize: 12, color:'var(--text-primary)', verticalAlign:'middle' }
function chipStyle(color) {
  const c = color || 'var(--accent)'
  return {
    fontSize: 11, fontWeight: 600, padding:'3px 9px', borderRadius: 999,
    background: `color-mix(in srgb, ${c} 14%, transparent)`,
    color: c,
    border: `1px solid color-mix(in srgb, ${c} 35%, transparent)`,
  }
}
