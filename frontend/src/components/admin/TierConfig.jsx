import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { tiersAPI, rolesAPI } from '../../services/api'
import { Card, PageTitle, Alert, Spinner, Button, Modal, Input, Select } from '../shared/UI'
import { useAuth } from '../../context/AuthContext'

const FLIGHT_CLASSES = ['Economy', 'Premium Economy', 'Business', 'First Class']
const TRAIN_CLASSES  = ['Sleeper', '3AC', '2AC', '1AC', 'Executive']
const BUS_TYPES      = ['Non-AC', 'AC Seater', 'AC Sleeper', 'Sleeper', 'Volvo', 'Luxury']
const HOTEL_TYPES    = ['Budget', '3-Star', '4-Star', '5-Star', 'Luxury']

// Authority ranks used to sort the approval sequence (lowest authority first).
const ROLE_RANK = {
  'Super Admin':   1,
  'Booking Admin': 2,
  'Manager':       3,
  'Finance':       3,
  'Tech Lead':     4,
  'Software Engineer': 5,
}

const EMPTY_TIER = {
  name: '',
  rank: 1,
  description: '',
  flight_classes: [],
  train_classes: [],
  bus_types: [],
  hotel_types: [],
  budget_limit: 0,
  budget_period: 'trip',
  approver_roles: [],
  approval_type: 'ALL',
  max_hotel_per_night: 0,
  meal_daily_limit: 0,
  cab_daily_limit: 0,
  advance_booking_days: 0,
  intl_budget_limit: 0,
  is_active: true,
}

export default function TierConfig() {
  const { user }  = useAuth()
  const canEdit   = user?.role === 'Super Admin'
  const [tiers, setTiers]                = useState([])
  const [roles, setRoles]                = useState([])
  const [designations, setDesignations]  = useState([])
  const [loading, setLoading]            = useState(true)
  const [error, setError]                = useState('')
  const [saving, setSaving]              = useState(false)
  const [confirmRow, setConfirmRow]      = useState(null)     // { title, message, onConfirm }

  // Tier modal
  const [tierModal, setTierModal] = useState(null)  // null | { mode:'create'|'edit', data:{...} }
  const [tierErrors, setTierErrors] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const [tres, rres] = await Promise.all([tiersAPI.list(), rolesAPI.list()])
      setTiers(tres.data?.tiers || [])
      setDesignations(tres.data?.designations || [])
      setRoles(rres.data || [])
      setError('')
    } catch (e) { setError(e.message) }
    finally   { setLoading(false) }
  }

  // Approver-pickable designations: exclude designations whose role is non-approver
  // (Employee, Booking Admin, Super Admin). Tier.approver_roles entries are
  // designation names, so the picker should show designations.
  const NON_APPROVER_ROLES = new Set(['Employee', 'Super Admin', 'Booking Admin'])
  const activeRoleNames = designations
    .filter(d => d.role && !NON_APPROVER_ROLES.has(d.role))
    .map(d => d.designation)

  // ── Tier CRUD ──────────────────────────────────────────────
  function openCreateTier() {
    const nextRank = (tiers.reduce((m, t) => Math.max(m, t.rank), 0) || 0) + 1
    setTierModal({ mode: 'create', data: { ...EMPTY_TIER, rank: nextRank } })
    setTierErrors({})
  }
  function openEditTier(t) {
    setTierModal({
      mode: 'edit',
      data: {
        id: t.id,
        name: t.name || '',
        rank: Number(t.rank) || 1,
        description: t.description || '',
        flight_classes: Array.isArray(t.flight_classes) ? t.flight_classes : [],
        train_classes:  Array.isArray(t.train_classes)  ? t.train_classes  : [],
        bus_types:      Array.isArray(t.bus_types)      ? t.bus_types      : [],
        hotel_types:    Array.isArray(t.hotel_types)    ? t.hotel_types    : [],
        budget_limit:   Number(t.budget_limit) || 0,
        budget_period:  t.budget_period || 'trip',
        approver_roles: Array.isArray(t.approver_roles) ? t.approver_roles : [],
        approval_type:  t.approval_type || 'ALL',
        max_hotel_per_night:  Number(t.max_hotel_per_night)  || 0,
        meal_daily_limit:     Number(t.meal_daily_limit)     || 0,
        cab_daily_limit:      Number(t.cab_daily_limit)      || 0,
        advance_booking_days: Number(t.advance_booking_days) || 0,
        intl_budget_limit:    Number(t.intl_budget_limit)    || 0,
        is_active:            t.is_active !== false,
      },
    })
    setTierErrors({})
  }
  function validateTier(d) {
    const e = {}
    if (!d.name?.trim())                         e.name = 'Name is required'
    if (!Number.isInteger(d.rank) || d.rank < 1) e.rank = 'Rank must be a positive integer'
    // approver_roles may be empty for the highest tier (no one above) — no validation here.
    return e
  }
  async function saveTier() {
    const d = tierModal.data
    const errs = validateTier(d)
    setTierErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      if (tierModal.mode === 'create') await tiersAPI.create(d)
      else                             await tiersAPI.update(d.id, d)
      setTierModal(null)
      await load()
    } catch (e) { setError(e.message) }
    finally   { setSaving(false) }
  }
  function requestDeleteTier(t) {
    setConfirmRow({
      title: `Delete ${t.name}?`,
      message: `Employees still mapped to this tier will prevent deletion. You may need to re-assign them first.`,
      onConfirm: async () => {
        setSaving(true)
        try { await tiersAPI.remove(t.id); await load() }
        catch (e) { setError(e.message) }
        finally   { setSaving(false); setConfirmRow(null) }
      },
    })
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title="Tier Configuration" sub="Travel classes, budgets, caps, and approval sequence per tier. Designations live on the Designations page." />
      {error && <Alert type="error" style={{ marginBottom: 12 }}>{error}</Alert>}

      {/* ── Tiers ─────────────────────────────────────────────── */}
      <Card style={{ padding: 22, marginBottom: 18 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color:'var(--text-primary)' }}>Tiers</div>
            <div style={{ fontSize: 11, color:'var(--text-muted)', marginTop: 2 }}>
              Rank 1 is highest. Travel classes, budget, and approval flow per tier.
            </div>
          </div>
          {canEdit && <Button onClick={openCreateTier}>+ New Tier</Button>}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
          {tiers.length === 0 && (
            <div style={{ fontSize: 12, color:'var(--text-muted)', padding: '20px 0', textAlign:'center' }}>
              No tiers yet. Create one to get started.
            </div>
          )}
          {tiers.map(t => {
            const inactive = t.is_active === false
            return (
              <div key={t.id} style={{
                background:'var(--bg-card-deep)',
                border: inactive ? '1px dashed var(--border)' : '1px solid var(--border)',
                borderRadius: 10, padding: 14,
                opacity: inactive ? 0.6 : 1,
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 10, flexWrap:'wrap', marginBottom: 10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 10, flexWrap:'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing:'0.08em',
                      color:'var(--accent)', background:'color-mix(in srgb, var(--accent) 16%, transparent)',
                      padding:'3px 8px', borderRadius: 999,
                    }}>RANK {t.rank}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color:'var(--text-primary)' }}>{t.name}</span>
                    {inactive && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing:'0.08em', textTransform:'uppercase',
                        color:'#FF9F0A', background:'#FF9F0A18', border:'1px solid #FF9F0A40',
                        padding:'2px 7px', borderRadius: 999,
                      }}>Inactive</span>
                    )}
                    {t.description && <span style={{ fontSize: 11, color:'var(--text-muted)' }}>· {t.description}</span>}
                  </div>
                  {canEdit && (
                    <div style={{ display:'flex', gap: 6 }}>
                      <Button size="sm" variant="ghost" onClick={() => openEditTier(t)}>Edit</Button>
                      <Button size="sm"
                        style={{ background:'#FF453A18', color:'#FF453A', border:'1px solid #FF453A30' }}
                        onClick={() => requestDeleteTier(t)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 10 }}>
                  <InfoCell label="Flight"   value={(t.flight_classes || []).join(', ') || '—'} />
                  <InfoCell label="Train"    value={(t.train_classes  || []).join(', ') || '—'} />
                  <InfoCell label="Bus"      value={(t.bus_types      || []).join(', ') || '—'} />
                  <InfoCell label="Hotel"    value={(t.hotel_types    || []).join(', ') || '—'} />
                  <InfoCell label="Budget (Dom.)"
                    value={`₹${Number(t.budget_limit || 0).toLocaleString('en-IN')} / ${t.budget_period === 'day' ? 'day' : 'trip'}`} />
                  <InfoCell label="Budget (Intl.)"
                    value={Number(t.intl_budget_limit || 0) > 0
                      ? `₹${Number(t.intl_budget_limit).toLocaleString('en-IN')} / ${t.budget_period === 'day' ? 'day' : 'trip'}`
                      : 'Same as domestic'} />
                  <InfoCell label="Hotel/Night cap"
                    value={Number(t.max_hotel_per_night || 0) > 0 ? `₹${Number(t.max_hotel_per_night).toLocaleString('en-IN')}` : 'No cap'} />
                  <InfoCell label="Meals/day"
                    value={Number(t.meal_daily_limit || 0) > 0 ? `₹${Number(t.meal_daily_limit).toLocaleString('en-IN')}` : '—'} />
                  <InfoCell label="Cab/day"
                    value={Number(t.cab_daily_limit || 0) > 0 ? `₹${Number(t.cab_daily_limit).toLocaleString('en-IN')}` : '—'} />
                  <InfoCell label="Advance booking"
                    value={Number(t.advance_booking_days || 0) > 0 ? `${t.advance_booking_days} day(s) ahead` : 'No minimum'} />
                  <InfoCell label="Approval Sequence"
                    value={(t.approver_roles || []).length
                      ? [...t.approver_roles].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]).join(' → ')
                      : 'No approval required'} />
                  <InfoCell label="Flight access"
                    value={Array.isArray(t.flight_classes) && t.flight_classes.length
                      ? t.flight_classes.join(', ')
                      : 'Not allowed'} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Tier modal ────────────────────────────────────────── */}
      {tierModal && (
        <Modal title={tierModal.mode === 'create' ? 'New Tier' : `Edit ${tierModal.data.name}`} onClose={() => setTierModal(null)} width={720}>
          <TierForm data={tierModal.data}
            errors={tierErrors}
            activeRoleNames={activeRoleNames}
            setData={d => setTierModal(m => ({ ...m, data: d }))} />
          <div style={{ display:'flex', justifyContent:'flex-end', gap: 10, marginTop: 14 }}>
            <Button variant="ghost" onClick={() => setTierModal(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveTier} disabled={saving}>{saving ? 'Saving…' : (tierModal.mode === 'create' ? 'Create Tier' : 'Save')}</Button>
          </div>
        </Modal>
      )}

      {/* ── Confirm dialog (portaled to escape transformed ancestors) ── */}
      {confirmRow && createPortal(
        <div style={{
          position:'fixed', inset: 0, background:'rgba(0,0,0,.55)', zIndex: 9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding: 20,
        }}>
          <div style={{
            width:'100%', maxWidth: 420, background:'var(--bg-card)', border:'1px solid var(--border)',
            borderRadius: 12, padding: 20, boxShadow:'0 20px 50px rgba(0,0,0,.5)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color:'var(--text-primary)', marginBottom: 8 }}>{confirmRow.title}</div>
            <div style={{ fontSize: 13, color:'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>{confirmRow.message}</div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setConfirmRow(null)} disabled={saving}>Cancel</Button>
              <Button style={{ background:'#FF453A', color:'#fff', border:'none' }} onClick={confirmRow.onConfirm} disabled={saving}>
                {saving ? 'Working…' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function InfoCell({ label, value }) {
  return (
    <div style={{ background:'var(--bg-card)', borderRadius: 8, padding: '9px 10px' }}>
      <div style={{ fontSize: 9, color:'var(--text-muted)', fontWeight: 700, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color:'var(--text-primary)', lineHeight: 1.4 }}>{value}</div>
    </div>
  )
}

function TierForm({ data, setData, errors, activeRoleNames }) {
  function field(k, v) { setData({ ...data, [k]: v }) }
  function toggleFrom(listKey, value) {
    const list = Array.isArray(data[listKey]) ? data[listKey] : []
    field(listKey, list.includes(value) ? list.filter(x => x !== value) : [...list, value])
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
      <Input label="Name *" value={data.name} onChange={e => field('name', e.target.value)} error={errors.name} placeholder="e.g. Tier 3" />
      <Input label="Rank * (1 = highest)" type="number" min={1} value={data.rank}
        onChange={e => field('rank', parseInt(e.target.value, 10) || 1)} error={errors.rank} />

      <div style={{ gridColumn:'1 / -1' }}>
        <Input label="Description" value={data.description}
          onChange={e => field('description', e.target.value)} placeholder="Short description shown on the tier card" />
      </div>

      <PickerBlock label="Flight Class" options={FLIGHT_CLASSES} selected={data.flight_classes} onToggle={v => toggleFrom('flight_classes', v)} />
      <PickerBlock label="Train Class"  options={TRAIN_CLASSES}  selected={data.train_classes}  onToggle={v => toggleFrom('train_classes', v)} />
      <PickerBlock label="Bus Type"     options={BUS_TYPES}      selected={data.bus_types}      onToggle={v => toggleFrom('bus_types', v)} />
      <PickerBlock label="Hotel Type"   options={HOTEL_TYPES}    selected={data.hotel_types}    onToggle={v => toggleFrom('hotel_types', v)} />

      <Input label="Domestic Budget (₹)" type="number" min={0} value={data.budget_limit}
        onChange={e => field('budget_limit', Number(e.target.value) || 0)} />
      <Select label="Budget Period" value={data.budget_period} onChange={e => field('budget_period', e.target.value)}>
        <option value="trip">Per trip</option>
        <option value="day">Per day</option>
      </Select>

      <Input label="International Budget (₹)" type="number" min={0} value={data.intl_budget_limit}
        onChange={e => field('intl_budget_limit', Number(e.target.value) || 0)}
        placeholder="0 = same as domestic" />
      <Input label="Hotel / Night Cap (₹)" type="number" min={0} value={data.max_hotel_per_night}
        onChange={e => field('max_hotel_per_night', Number(e.target.value) || 0)}
        placeholder="0 = no cap" />

      <Input label="Meal Allowance / Day (₹)" type="number" min={0} value={data.meal_daily_limit}
        onChange={e => field('meal_daily_limit', Number(e.target.value) || 0)} />
      <Input label="Cab / Local Transport / Day (₹)" type="number" min={0} value={data.cab_daily_limit}
        onChange={e => field('cab_daily_limit', Number(e.target.value) || 0)} />

      <Input label="Advance Booking (days)" type="number" min={0} value={data.advance_booking_days}
        onChange={e => field('advance_booking_days', parseInt(e.target.value, 10) || 0)}
        placeholder="Minimum days before travel" />
      <div style={{ display:'flex', alignItems:'flex-end', paddingBottom: 6 }}>
        <label style={{ display:'flex', alignItems:'center', gap: 8, fontSize: 13, color:'var(--text-primary)', cursor:'pointer' }}>
          <input type="checkbox" checked={data.is_active !== false}
            onChange={e => field('is_active', e.target.checked)}
            style={{ accentColor:'var(--accent)', cursor:'pointer' }} />
          Tier is active (uncheck to retire without deleting)
        </label>
      </div>

      <div style={{ gridColumn:'1 / -1' }}>
        <PickerBlock label="Approvers" options={activeRoleNames.length ? activeRoleNames : ['Tech Lead','Manager','Finance']}
          selected={data.approver_roles} onToggle={v => toggleFrom('approver_roles', v)} error={errors.approver_roles} />
      </div>

      {/* Sequence preview — approval runs lowest-authority first */}
      <div style={{ gridColumn:'1 / -1', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color:'var(--text-muted)', fontWeight: 600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom: 6 }}>
          Sequential Approval Order
        </div>
        <div style={{
          padding:'10px 12px', borderRadius: 8,
          background:'color-mix(in srgb, var(--accent) 10%, transparent)',
          border:'1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          fontSize: 13, fontWeight: 600, color:'var(--accent)',
        }}>
          {data.approver_roles?.length
            ? [...data.approver_roles].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]).join('  →  ')
            : 'No approval required (highest tier)'}
        </div>
      </div>

    </div>
  )
}

function PickerBlock({ label, options, selected, onToggle, error }) {
  return (
    <div style={{ gridColumn:'1 / -1', marginBottom: 12 }}>
      <div style={{ fontSize: 11, color:'var(--text-muted)', fontWeight: 600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap: 6 }}>
        {options.map(v => {
          const on = Array.isArray(selected) && selected.includes(v)
          return (
            <label key={v} style={{
              padding:'5px 10px', borderRadius: 8, cursor:'pointer', userSelect:'none',
              background: on ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'var(--bg-input)',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              display:'flex', alignItems:'center', gap: 6,
            }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(v)}
                style={{ accentColor:'var(--accent)', cursor:'pointer' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: on ? 'var(--accent)' : 'var(--text-primary)' }}>{v}</span>
            </label>
          )
        })}
      </div>
      {error && <div style={{ fontSize: 11, color:'#FF453A', marginTop: 4 }}>{error}</div>}
    </div>
  )
}
