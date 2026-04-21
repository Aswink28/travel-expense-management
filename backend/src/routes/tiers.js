const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

// ── Helpers ──────────────────────────────────────────────────
const BUDGET_PERIODS  = ['trip', 'day']
const APPROVAL_TYPES  = ['ANY_ONE', 'ALL']

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
  if (body.approver_roles !== undefined)            out.approver_roles = arr(body.approver_roles)
  if (body.approval_type !== undefined)             out.approval_type  = APPROVAL_TYPES.includes(body.approval_type) ? body.approval_type : 'ALL'
  if (body.intl_flight_class_upgrade !== undefined) out.intl_flight_class_upgrade = !!body.intl_flight_class_upgrade
  return out
}

// ── GET /api/tiers ───────────────────────────────────────────
// Returns tiers (sorted by rank) plus designation mappings.
router.get('/', async (req, res, next) => {
  try {
    const [{ rows: tiers }, { rows: designations }] = await Promise.all([
      pool.query('SELECT * FROM tiers ORDER BY rank ASC, id ASC'),
      pool.query(`
        SELECT dt.id, dt.designation, dt.tier_id, t.name AS tier_name, t.rank AS tier_rank
        FROM designation_tiers dt
        LEFT JOIN tiers t ON t.id = dt.tier_id
        ORDER BY t.rank ASC NULLS LAST, dt.designation ASC
      `),
    ])
    res.json({ success: true, data: { tiers, designations } })
  } catch (e) { next(e) }
})

// ── GET /api/tiers/preview/:designation ──────────────────────
// Any authenticated caller — used by employee form.
router.get('/preview/:designation', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*
      FROM designation_tiers dt
      JOIN tiers t ON t.id = dt.tier_id
      WHERE LOWER(dt.designation) = LOWER($1)
      LIMIT 1
    `, [req.params.designation])
    if (!rows.length) return res.json({ success: true, data: null })
    res.json({ success: true, data: rows[0] })
  } catch (e) { next(e) }
})

// ── Super Admin–only CRUD ────────────────────────────────────
router.use(authorise('Super Admin'))

// ── POST /api/tiers — create ─────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const t = normaliseTier(req.body)
    if (!t.name)                        return res.status(400).json({ success: false, message: 'Tier name is required' })
    if (!Number.isInteger(t.rank) || t.rank < 1) return res.status(400).json({ success: false, message: 'Tier rank must be a positive integer' })
    const { rows } = await pool.query(
      `INSERT INTO tiers (name, rank, description, flight_classes, train_classes, bus_types, hotel_types,
                          budget_limit, budget_period, approver_roles, approval_type, intl_flight_class_upgrade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [t.name, t.rank, t.description || null,
       t.flight_classes || [], t.train_classes || [], t.bus_types || [], t.hotel_types || [],
       t.budget_limit || 0, t.budget_period || 'trip',
       t.approver_roles || [], t.approval_type || 'ALL', !!t.intl_flight_class_upgrade]
    )
    res.status(201).json({ success: true, message: 'Tier created', data: rows[0] })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Tier name or rank already exists' })
    next(e)
  }
})

// ── PUT /api/tiers/:id — update ──────────────────────────────
router.put('/:id', async (req, res, next) => {
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
router.delete('/:id', async (req, res, next) => {
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
router.post('/designations', async (req, res, next) => {
  try {
    const designation = String(req.body?.designation || '').trim()
    const tier_id     = parseInt(req.body?.tier_id, 10)
    if (!designation)               return res.status(400).json({ success: false, message: 'Designation is required' })
    if (!Number.isInteger(tier_id)) return res.status(400).json({ success: false, message: 'tier_id must be an integer' })

    const { rows: tierRows } = await pool.query('SELECT id FROM tiers WHERE id = $1', [tier_id])
    if (!tierRows.length) return res.status(404).json({ success: false, message: 'Tier not found' })

    const { rows } = await pool.query(
      `INSERT INTO designation_tiers (designation, tier_id)
         VALUES ($1, $2)
       ON CONFLICT (designation) DO UPDATE SET tier_id = EXCLUDED.tier_id
       RETURNING *`,
      [designation, tier_id]
    )
    res.json({ success: true, message: 'Designation mapping saved', data: rows[0] })
  } catch (e) { next(e) }
})

// ── DELETE /api/tiers/designations/:designation ──────────────
router.delete('/designations/:designation', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM designation_tiers WHERE LOWER(designation) = LOWER($1)',
      [req.params.designation]
    )
    if (!rowCount) return res.status(404).json({ success: false, message: 'Mapping not found' })
    res.json({ success: true, message: 'Mapping deleted' })
  } catch (e) { next(e) }
})

module.exports = router
