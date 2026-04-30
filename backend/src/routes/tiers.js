const express = require('express')
const pool    = require('../config/db')
const { authenticate, requirePermission } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

// ── Helpers ──────────────────────────────────────────────────
const BUDGET_PERIODS  = ['trip', 'day']
const APPROVAL_TYPES  = ['ANY_ONE', 'ALL']
const APPROVAL_FLOWS  = ['SEQUENTIAL', 'PARALLEL']

function arr(v) { return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [] }
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
function normaliseTier(body) {
  const out = {}
  if (body.name !== undefined)                      out.name = String(body.name).trim()
  if (body.rank !== undefined)                      out.rank = parseInt(body.rank, 10)
  if (body.description !== undefined)               out.description = body.description ? String(body.description) : null
  if (body.flight_classes !== undefined)            out.flight_classes = arr(body.flight_classes)
  if (body.train_classes !== undefined)             out.train_classes  = arr(body.train_classes)
  if (body.bus_types !== undefined)                 out.bus_types      = arr(body.bus_types)
  if (body.hotel_types !== undefined)               out.hotel_types    = arr(body.hotel_types)
  if (body.budget_limit !== undefined)              out.budget_limit   = num(body.budget_limit)
  if (body.budget_period !== undefined)             out.budget_period  = BUDGET_PERIODS.includes(body.budget_period) ? body.budget_period : 'trip'
  if (body.approver_roles !== undefined) {
    // Super Admin (manages users/sites) and Booking Admin (handles bookings after
    // approval) are never approvers — strip them even if the client sends them.
    const BLOCKED = new Set(['Super Admin', 'Booking Admin'])
    out.approver_roles = arr(body.approver_roles).filter(r => !BLOCKED.has(r))
  }
  if (body.approval_type !== undefined)             out.approval_type  = APPROVAL_TYPES.includes(body.approval_type) ? body.approval_type : 'ALL'
  if (body.approval_flow !== undefined)             out.approval_flow  = APPROVAL_FLOWS.includes(body.approval_flow) ? body.approval_flow : 'SEQUENTIAL'
  if (body.intl_flight_class_upgrade !== undefined) out.intl_flight_class_upgrade = !!body.intl_flight_class_upgrade
  // Extended policy fields
  if (body.max_hotel_per_night !== undefined)       out.max_hotel_per_night = num(body.max_hotel_per_night)
  if (body.meal_daily_limit !== undefined)          out.meal_daily_limit    = num(body.meal_daily_limit)
  if (body.cab_daily_limit !== undefined)           out.cab_daily_limit     = num(body.cab_daily_limit)
  if (body.advance_booking_days !== undefined)      out.advance_booking_days = Math.max(0, parseInt(body.advance_booking_days, 10) || 0)
  if (body.intl_budget_limit !== undefined)         out.intl_budget_limit   = num(body.intl_budget_limit)
  if (body.is_active !== undefined)                 out.is_active           = !!body.is_active
  return out
}

// ── GET /api/tiers ───────────────────────────────────────────
// Returns tiers (sorted by rank) plus designation mappings with:
//   - employee_count        : users.designation references
//   - chain_step_count      : employee_approvers.step_designation references
// Both are blockers for deletion. Visible to anyone with view rights on
// either the tiers or designations page (the response is shared between
// both UIs).
router.get('/', requirePermission('tiers', 'view'), async (req, res, next) => {
  try {
    const [{ rows: tiers }, { rows: designations }] = await Promise.all([
      pool.query('SELECT * FROM tiers ORDER BY rank ASC, id ASC'),
      pool.query(`
        SELECT dt.id, dt.designation, dt.tier_id, dt.role, dt.is_approver,
               t.name AS tier_name, t.rank AS tier_rank,
               t.approver_roles AS tier_approver_roles,
               (SELECT COUNT(*)::int FROM users u WHERE LOWER(u.designation) = LOWER(dt.designation)) AS employee_count,
               (SELECT COUNT(*)::int FROM employee_approvers ea WHERE LOWER(ea.step_designation) = LOWER(dt.designation)) AS chain_step_count
        FROM designation_tiers dt
        LEFT JOIN tiers t ON t.id = dt.tier_id
        ORDER BY t.rank ASC NULLS LAST, dt.designation ASC
      `),
    ])
    res.json({ success: true, data: { tiers, designations } })
  } catch (e) { next(e) }
})

// ── GET /api/tiers/preview/:designation ──────────────────────
// Any authenticated caller — used by employee form. Inactive tiers are excluded so
// retired tiers can't be auto-assigned onto new or edited employees. Returns the
// tier fields plus the designation's mapped role.
router.get('/preview/:designation', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, dt.role AS designation_role
      FROM designation_tiers dt
      JOIN tiers t ON t.id = dt.tier_id
      WHERE LOWER(dt.designation) = LOWER($1)
        AND t.is_active = TRUE
      LIMIT 1
    `, [req.params.designation])
    if (!rows.length) return res.json({ success: true, data: null })
    res.json({ success: true, data: rows[0] })
  } catch (e) { next(e) }
})

// ── Tier + Designation CRUD ──────────────────────────────────
// Each route declares its own permission so the 'tiers' and
// 'designations' grants can be assigned independently in the
// Admin User permission matrix.

// ── POST /api/tiers — create ─────────────────────────────────
router.post('/', requirePermission('tiers', 'create'), async (req, res, next) => {
  try {
    const t = normaliseTier(req.body)
    if (!t.name)                        return res.status(400).json({ success: false, message: 'Tier name is required' })
    if (!Number.isInteger(t.rank) || t.rank < 1) return res.status(400).json({ success: false, message: 'Tier rank must be a positive integer' })
    const { rows } = await pool.query(
      `INSERT INTO tiers (name, rank, description, flight_classes, train_classes, bus_types, hotel_types,
                          budget_limit, budget_period, approver_roles, approval_type, intl_flight_class_upgrade,
                          max_hotel_per_night, meal_daily_limit, cab_daily_limit,
                          advance_booking_days, intl_budget_limit, is_active, approval_flow)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [t.name, t.rank, t.description || null,
       t.flight_classes || [], t.train_classes || [], t.bus_types || [], t.hotel_types || [],
       t.budget_limit || 0, t.budget_period || 'trip',
       t.approver_roles || [], t.approval_type || 'ALL', !!t.intl_flight_class_upgrade,
       t.max_hotel_per_night || 0, t.meal_daily_limit || 0, t.cab_daily_limit || 0,
       t.advance_booking_days || 0, t.intl_budget_limit || 0,
       t.is_active === undefined ? true : !!t.is_active,
       t.approval_flow || 'SEQUENTIAL']
    )
    res.status(201).json({ success: true, message: 'Tier created', data: rows[0] })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Tier name or rank already exists' })
    next(e)
  }
})

// ── PUT /api/tiers/:id — update ──────────────────────────────
router.put('/:id', requirePermission('tiers', 'edit'), async (req, res, next) => {
  try {
    const t = normaliseTier(req.body)
    const sets = []
    const vals = []
    let idx = 1
    for (const [k, v] of Object.entries(t)) {
      sets.push(`${k} = $${idx++}`)
      vals.push(v)
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' })
    sets.push(`updated_at = NOW()`)
    vals.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE tiers SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Tier not found' })
    res.json({ success: true, message: 'Tier updated', data: rows[0] })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Tier name or rank already exists' })
    next(e)
  }
})

// ── DELETE /api/tiers/:id ────────────────────────────────────
router.delete('/:id', requirePermission('tiers', 'delete'), async (req, res, next) => {
  try {
    // Guard: block delete if any user is still assigned to this tier.
    const { rows: usersUsing } = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE tier_id = $1', [req.params.id])
    if (usersUsing[0].n > 0) {
      return res.status(409).json({ success: false, message: `Cannot delete — ${usersUsing[0].n} employee(s) are assigned to this tier` })
    }
    const { rowCount } = await pool.query('DELETE FROM tiers WHERE id = $1', [req.params.id])
    if (!rowCount) return res.status(404).json({ success: false, message: 'Tier not found' })
    res.json({ success: true, message: 'Tier deleted' })
  } catch (e) { next(e) }
})

// ── POST /api/tiers/designations — upsert one mapping ────────
// Body: { designation, tier_id, role?, is_approver? }
// Role is optional but recommended — it's what drives role auto-fill on the employee form.
// is_approver (default FALSE) decides whether this designation appears in
// Tier Config's approver picker.
router.post('/designations', requirePermission('designations', 'create'), async (req, res, next) => {
  try {
    const designation = String(req.body?.designation || '').trim()
    const tier_id     = parseInt(req.body?.tier_id, 10)
    const role        = req.body?.role ? String(req.body.role).trim() : null
    const is_approver = req.body?.is_approver === undefined ? false : !!req.body.is_approver
    if (!designation)               return res.status(400).json({ success: false, message: 'Designation is required' })
    if (!Number.isInteger(tier_id)) return res.status(400).json({ success: false, message: 'tier_id must be an integer' })

    const { rows: tierRows } = await pool.query('SELECT id FROM tiers WHERE id = $1', [tier_id])
    if (!tierRows.length) return res.status(404).json({ success: false, message: 'Tier not found' })

    if (role) {
      const { rows: roleRows } = await pool.query('SELECT 1 FROM roles WHERE name = $1', [role])
      if (!roleRows.length) return res.status(400).json({ success: false, message: `Role "${role}" does not exist. Create it in Role Manager first.` })
    }

    const { rows } = await pool.query(
      `INSERT INTO designation_tiers (designation, tier_id, role, is_approver)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (designation) DO UPDATE
         SET tier_id     = EXCLUDED.tier_id,
             role        = EXCLUDED.role,
             is_approver = EXCLUDED.is_approver
       RETURNING *`,
      [designation, tier_id, role, is_approver]
    )
    res.json({ success: true, message: 'Designation mapping saved', data: rows[0] })
  } catch (e) { next(e) }
})

// ── PUT /api/tiers/designations/:id — rename or remap by id ──
// Body: { designation?, tier_id?, role?, is_approver? }
router.put('/designations/:id', requirePermission('designations', 'edit'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Invalid id' })

    const designation = req.body?.designation !== undefined ? String(req.body.designation).trim() : undefined
    const tier_id     = req.body?.tier_id     !== undefined ? parseInt(req.body.tier_id, 10) : undefined
    const role        = req.body?.role        !== undefined
      ? (req.body.role ? String(req.body.role).trim() : null)
      : undefined
    const is_approver = req.body?.is_approver !== undefined ? !!req.body.is_approver : undefined

    if (designation === '') return res.status(400).json({ success: false, message: 'Designation cannot be empty' })

    if (tier_id !== undefined) {
      const { rows: tierRows } = await pool.query('SELECT id FROM tiers WHERE id = $1', [tier_id])
      if (!tierRows.length) return res.status(404).json({ success: false, message: 'Tier not found' })
    }
    if (role !== undefined && role !== null) {
      const { rows: roleRows } = await pool.query('SELECT 1 FROM roles WHERE name = $1', [role])
      if (!roleRows.length) return res.status(400).json({ success: false, message: `Role "${role}" does not exist` })
    }

    const sets = []
    const vals = []
    let idx = 1
    if (designation !== undefined) { sets.push(`designation = $${idx++}`); vals.push(designation) }
    if (tier_id     !== undefined) { sets.push(`tier_id = $${idx++}`);     vals.push(tier_id) }
    if (role        !== undefined) { sets.push(`role = $${idx++}`);        vals.push(role) }
    if (is_approver !== undefined) { sets.push(`is_approver = $${idx++}`); vals.push(is_approver) }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' })

    vals.push(id)

    // If renaming, propagate to users.designation for anyone using the old name.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: existing } = await client.query('SELECT designation FROM designation_tiers WHERE id = $1', [id])
      if (!existing.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Mapping not found' }) }
      const oldName = existing[0].designation

      const { rows } = await client.query(
        `UPDATE designation_tiers SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals
      )

      if (designation !== undefined && designation !== oldName) {
        await client.query(
          'UPDATE users SET designation = $1 WHERE LOWER(designation) = LOWER($2)',
          [designation, oldName]
        )
      }

      await client.query('COMMIT')
      res.json({ success: true, message: 'Designation updated', data: rows[0] })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      if (e.code === '23505') return res.status(409).json({ success: false, message: 'A designation with that name already exists' })
      throw e
    } finally { client.release() }
  } catch (e) { next(e) }
})

// ── DELETE /api/tiers/designations/:designation ──────────────
// Blocked if anything still references the designation:
//   - users.designation (employees on this designation)
//   - employee_approvers.step_designation (approval-chain steps)
// Returns 409 with a structured `blockers` object so the UI can render
// a precise "you can't delete this because…" message.
router.delete('/designations/:designation', requirePermission('designations', 'delete'), async (req, res, next) => {
  try {
    const designation = req.params.designation
    const [{ rows: u }, { rows: c }] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM users WHERE LOWER(designation) = LOWER($1)', [designation]),
      pool.query('SELECT COUNT(*)::int AS n FROM employee_approvers WHERE LOWER(step_designation) = LOWER($1)', [designation]),
    ])
    const employees   = u[0].n
    const chainSteps  = c[0].n

    if (employees > 0 || chainSteps > 0) {
      const parts = []
      if (employees  > 0) parts.push(`${employees} employee(s)`)
      if (chainSteps > 0) parts.push(`${chainSteps} approval-chain step(s)`)
      return res.status(409).json({
        success: false,
        message: `Cannot delete "${designation}" — still in use by ${parts.join(' and ')}. Reassign them first.`,
        blockers: { employees, chain_steps: chainSteps },
      })
    }

    const { rowCount } = await pool.query(
      'DELETE FROM designation_tiers WHERE LOWER(designation) = LOWER($1)',
      [designation]
    )
    if (!rowCount) return res.status(404).json({ success: false, message: 'Mapping not found' })
    res.json({ success: true, message: `Designation "${designation}" deleted` })
  } catch (e) { next(e) }
})

module.exports = router
