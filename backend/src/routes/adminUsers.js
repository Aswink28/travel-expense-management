// ============================================================
// /api/admin-users — Admin User Management (Phase 1 RBAC)
// ────────────────────────────────────────────────────────────
// Admin Users are users in the existing `users` table whose role
// is anything OTHER than 'Employee'. We do NOT create a new table
// (Path A approved): the separation is logical, enforced by:
//   * filtering on role != 'Employee' for list/create
//   * the role_pages V/C/E/D permission matrix
//
// All endpoints require:
//   * authenticate     — caller must hold a valid JWT
//   * requirePermission — caller's role must have the matching
//                         can_view / can_create / can_edit grant
//                         on the 'admin-users' page.
// ============================================================
const express = require('express')
const bcrypt  = require('bcryptjs')
const pool    = require('../config/db')
const { authenticate, requirePermission } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

const NON_ADMIN_ROLES = new Set(['Employee'])

// Helper — generate the next emp_id (admin users still need one to satisfy
// the existing users.emp_id NOT NULL UNIQUE constraint). Pattern: ADM0001…
async function nextAdminEmpId() {
  const { rows } = await pool.query(
    `SELECT emp_id FROM users WHERE emp_id LIKE 'ADM%' ORDER BY emp_id DESC LIMIT 1`
  )
  if (!rows.length) return 'ADM0001'
  const n = parseInt(rows[0].emp_id.slice(3), 10) || 0
  return `ADM${String(n + 1).padStart(4, '0')}`
}

// ── GET /api/admin-users — list admin users (role != Employee) ─
router.get('/', requirePermission('admin-users', 'view'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, emp_id, name, email, role, is_active, last_login, created_at
         FROM users
        WHERE role::text <> 'Employee'
        ORDER BY is_active DESC, name ASC`
    )
    res.json({ success: true, data: rows })
  } catch (e) { next(e) }
})

// ── GET /api/admin-users/roles — roles eligible for admin user creation ─
// Returns active roles excluding 'Employee'. The permission matrix UI uses
// this to populate the Role dropdown.
router.get('/roles', requirePermission('admin-users', 'view'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, color, is_system, is_active
         FROM roles
        WHERE is_active = TRUE AND name <> 'Employee'
        ORDER BY name`
    )
    res.json({ success: true, data: rows })
  } catch (e) { next(e) }
})

// ── GET /api/admin-users/permissions/:role — V/C/E/D matrix for a role ─
// Returns the existing role_pages rows for this role. The frontend merges
// this against /api/roles/pages (the master ALL_PAGES list) so the matrix
// shows every admin-eligible page with the role's current grants or
// no-permission defaults if no row exists.
router.get('/permissions/:role', requirePermission('admin-users', 'view'), async (req, res, next) => {
  try {
    const role = req.params.role
    const { rows: roleRow } = await pool.query('SELECT 1 FROM roles WHERE name = $1', [role])
    if (!roleRow.length) return res.status(404).json({ success: false, message: 'Role not found' })

    const { rows } = await pool.query(
      `SELECT page_id, page_label, page_icon, sort_order,
              can_view, can_create, can_edit, can_delete
         FROM role_pages
        WHERE role_name = $1
        ORDER BY sort_order`,
      [role]
    )
    res.json({ success: true, data: rows })
  } catch (e) { next(e) }
})

// ── PUT /api/admin-users/permissions/:role — REPLACE the V/C/E/D matrix ─
// Body: { permissions: [{ page_id, can_view, can_create, can_edit, can_delete }, ...] }
//
// FULL REPLACEMENT semantics — the matrix is the complete picture of what
// pages this role can access. Any role_pages row NOT present in the body
// is removed, so toggling a page off in the UI actually hides it from
// every user holding the role. Rows with all four flags FALSE are skipped
// (treated as "deny" — no row inserted).
router.put('/permissions/:role',
  requirePermission('admin-users', 'edit'),
  async (req, res, next) => {
  const client = await pool.connect()
  try {
    const role = req.params.role
    const perms = Array.isArray(req.body?.permissions) ? req.body.permissions : []
    if (!perms.length) return res.status(400).json({ success: false, message: 'permissions array required' })

    const { rows: roleRow } = await pool.query('SELECT 1 FROM roles WHERE name = $1', [role])
    if (!roleRow.length) return res.status(404).json({ success: false, message: 'Role not found' })

    // Master page metadata — page_label / page_icon for any row whose UI
    // payload didn't supply its own (defensive — the modal sends labels,
    // but a stale client may not).
    const { rows: pageMeta } = await pool.query(
      `SELECT page_id, page_label, page_icon FROM role_pages WHERE role_name = 'Super Admin'`
    )
    const metaById = new Map(pageMeta.map(p => [p.page_id, p]))

    await client.query('BEGIN')

    // 1. Wipe the role's existing rows. Full replacement means orphaned
    //    page_ids (left over from previous seeds or earlier saves) get
    //    cleaned up automatically — the user only sees pages currently
    //    granted in the matrix.
    await client.query('DELETE FROM role_pages WHERE role_name = $1', [role])

    // 2. Re-insert only the rows the matrix actually grants. sort_order
    //    follows submission order so the sidebar respects whatever order
    //    the UI rendered the rows in.
    let nextOrder = 1
    for (const p of perms) {
      const page_id    = String(p.page_id || '').trim()
      if (!page_id) continue
      const can_view   = !!p.can_view
      const can_create = !!p.can_create
      const can_edit   = !!p.can_edit
      const can_delete = !!p.can_delete

      // Skip rows with no flags — equivalent to "denied".
      if (!can_view && !can_create && !can_edit && !can_delete) continue

      const meta = metaById.get(page_id) || {}
      const label = p.page_label || meta.page_label || page_id
      const icon  = p.page_icon  || meta.page_icon  || '◈'

      await client.query(
        `INSERT INTO role_pages
           (role_name, page_id, page_label, page_icon, sort_order, can_view, can_create, can_edit, can_delete)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [role, page_id, label, icon, nextOrder++, can_view, can_create, can_edit, can_delete]
      )
    }

    await client.query('COMMIT')
    const { rows } = await pool.query(
      `SELECT page_id, page_label, page_icon, sort_order,
              can_view, can_create, can_edit, can_delete
         FROM role_pages WHERE role_name = $1 ORDER BY sort_order`,
      [role]
    )
    res.json({ success: true, message: 'Permissions saved', data: rows })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    next(e)
  } finally { client.release() }
})

// ── POST /api/admin-users — create a new admin user ──────────
// Body: { name, email, password, role, is_active }
router.post('/',
  requirePermission('admin-users', 'create'),
  async (req, res, next) => {
  try {
    const name      = String(req.body?.name || '').trim()
    const email     = String(req.body?.email || '').trim().toLowerCase()
    const password  = String(req.body?.password || '')
    const role      = String(req.body?.role || '').trim()
    const is_active = req.body?.is_active === undefined ? true : !!req.body.is_active

    if (!name)              return res.status(400).json({ success: false, message: 'Name is required' })
    if (!email)             return res.status(400).json({ success: false, message: 'Email is required' })
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    if (!role)              return res.status(400).json({ success: false, message: 'Role is required' })

    if (NON_ADMIN_ROLES.has(role)) {
      return res.status(400).json({ success: false, message: `Role "${role}" is for employees, not admin users` })
    }

    // Ensure the role exists and is active.
    const { rows: roleRow } = await pool.query('SELECT 1 FROM roles WHERE name = $1 AND is_active = TRUE', [role])
    if (!roleRow.length) return res.status(400).json({ success: false, message: `Role "${role}" does not exist or is inactive` })

    // Email uniqueness — match the existing users.email constraint with a friendly message.
    const { rows: dup } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (dup.length) return res.status(409).json({ success: false, message: 'An account with this email already exists' })

    const empId  = await nextAdminEmpId()
    const hash   = await bcrypt.hash(password, 10)
    const avatar = name.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'AU'

    const { rows } = await pool.query(
      `INSERT INTO users (emp_id, name, email, password_hash, role, department, avatar, color, is_active)
         VALUES ($1, $2, $3, $4, $5::user_role_enum, 'Administration', $6, '#888', $7)
       RETURNING id, emp_id, name, email, role, is_active, created_at`,
      [empId, name, email, hash, role, avatar, is_active]
    )
    res.status(201).json({ success: true, message: 'Admin user created', data: rows[0] })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Email or emp_id already exists' })
    next(e)
  }
})

// ── PUT /api/admin-users/:id — update name / role / status / password ─
router.put('/:id',
  requirePermission('admin-users', 'edit'),
  async (req, res, next) => {
  try {
    const id = req.params.id
    const sets = []
    const vals = []
    let idx = 1

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim()
      if (!name) return res.status(400).json({ success: false, message: 'Name cannot be empty' })
      sets.push(`name = $${idx++}`); vals.push(name)
    }
    if (req.body?.role !== undefined) {
      const role = String(req.body.role).trim()
      if (NON_ADMIN_ROLES.has(role)) {
        return res.status(400).json({ success: false, message: `Role "${role}" is for employees, not admin users` })
      }
      const { rows: rr } = await pool.query('SELECT 1 FROM roles WHERE name = $1 AND is_active = TRUE', [role])
      if (!rr.length) return res.status(400).json({ success: false, message: `Role "${role}" does not exist or is inactive` })
      sets.push(`role = $${idx++}::user_role_enum`); vals.push(role)
    }
    if (req.body?.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`); vals.push(!!req.body.is_active)
    }
    if (req.body?.password) {
      if (String(req.body.password).length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
      }
      const hash = await bcrypt.hash(String(req.body.password), 10)
      sets.push(`password_hash = $${idx++}`); vals.push(hash)
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' })

    sets.push(`updated_at = NOW()`)
    vals.push(id)

    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')}
         WHERE id = $${idx} AND role::text <> 'Employee'
       RETURNING id, emp_id, name, email, role, is_active, last_login, created_at, updated_at`,
      vals
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Admin user not found' })
    res.json({ success: true, message: 'Admin user updated', data: rows[0] })
  } catch (e) { next(e) }
})

// ── DELETE /api/admin-users/:id — deactivate (soft delete) ────
// We never hard-delete users (foreign keys to requests/approvals/audit log)
// so this just flips is_active = false.
router.delete('/:id',
  requirePermission('admin-users', 'delete'),
  async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1 AND role::text <> 'Employee'
        RETURNING id, name, role, is_active`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Admin user not found' })
    res.json({ success: true, message: 'Admin user deactivated', data: rows[0] })
  } catch (e) { next(e) }
})

module.exports = router
