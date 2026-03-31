const express = require('express')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router  = express.Router()

router.use(authenticate)
router.use(authorise('Super Admin'))

// Master list of all available pages in the system
const ALL_PAGES = [
  { id: 'dashboard',          label: 'Dashboard',       icon: '▦',  group: 'General' },
  { id: 'my-requests',        label: 'My Requests',     icon: '◈',  group: 'Requests' },
  { id: 'requests',           label: 'All Requests',    icon: '◈',  group: 'Requests' },
  { id: 'new-request',        label: 'New Request',     icon: '+',  group: 'Requests' },
  { id: 'approvals',          label: 'Approvals',       icon: '◎',  group: 'Approvals' },
  { id: 'my-wallet',          label: 'My Wallet',       icon: '◉',  group: 'Wallet' },
  { id: 'book',               label: 'Book Travel',     icon: '🎫', group: 'Booking' },
  { id: 'my-tickets',         label: 'My Tickets',      icon: '🎟', group: 'Booking' },
  { id: 'booking-panel',      label: 'Booking Panel',   icon: '◈',  group: 'Admin Booking' },
  { id: 'booking-history',    label: 'Booking History',  icon: '◎',  group: 'Admin Booking' },
  { id: 'ad-hoc-booking',     label: 'Ad-Hoc Booking',  icon: '✈',  group: 'Admin Booking' },
  { id: 'admin-bookings-view',label: 'Admin Bookings',   icon: '📋', group: 'Admin Booking' },
  { id: 'employees',          label: 'Employees',        icon: '◆',  group: 'Administration' },
  { id: 'roles',              label: 'Role Manager',     icon: '⚙',  group: 'Administration' },
  { id: 'tiers',              label: 'Tier Config',      icon: '◐',  group: 'Administration' },
]

// ── GET /api/roles/pages — master list of all pages ──────────
router.get('/pages', async (req, res) => {
  res.json({ success: true, data: ALL_PAGES })
})

// ── GET /api/roles — list all roles with their pages ─────────
router.get('/', async (req, res, next) => {
  try {
    const { rows: roles } = await pool.query('SELECT * FROM roles ORDER BY id')
    const { rows: pages } = await pool.query('SELECT * FROM role_pages ORDER BY role_name, sort_order')

    const rolesWithPages = roles.map(r => ({
      ...r,
      pages: pages.filter(p => p.role_name === r.name),
    }))

    res.json({ success: true, data: rolesWithPages })
  } catch (e) { next(e) }
})

// ── POST /api/roles — create a new role ──────────────────────
router.post('/', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { name, description, color, pages } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required' })
    }

    const roleName = name.trim()

    // Check if role already exists in roles table
    const { rows: existing } = await pool.query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1)', [roleName])
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Role already exists' })
    }

    await client.query('BEGIN')

    // Add to PostgreSQL enum so it can be used in users.role column
    // ALTER TYPE ... ADD VALUE cannot run inside a transaction in PG < 12
    // So we do it outside the transaction
    await client.query('COMMIT')
    try {
      await client.query(`ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS '${roleName.replace(/'/g, "''")}'`)
    } catch (enumErr) {
      // Value might already exist in enum
      if (!enumErr.message.includes('already exists')) throw enumErr
    }

    await client.query('BEGIN')

    // Insert into roles table
    const { rows: [role] } = await client.query(
      'INSERT INTO roles (name, description, color) VALUES ($1, $2, $3) RETURNING *',
      [roleName, description || null, color || '#888']
    )

    // Insert page assignments
    if (pages && pages.length) {
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        const pageInfo = ALL_PAGES.find(ap => ap.id === p.page_id) || {}
        await client.query(
          'INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [roleName, p.page_id, p.label || pageInfo.label || p.page_id, p.icon || pageInfo.icon || '◈', i + 1]
        )
      }
    }

    // Also create a tier_config entry for the new role
    await client.query(
      `INSERT INTO tier_config (role, allowed_modes, max_trip_budget, daily_allowance, max_hotel_per_night, cab_daily_limit, food_daily_limit, color)
       VALUES ($1, $2, 0, 0, 0, 0, 0, $3)
       ON CONFLICT (role) DO NOTHING`,
      [roleName, '{}', color || '#888']
    )

    await client.query('COMMIT')

    // Fetch the role with pages
    const { rows: rolePages } = await pool.query('SELECT * FROM role_pages WHERE role_name = $1 ORDER BY sort_order', [roleName])
    role.pages = rolePages

    res.status(201).json({ success: true, message: 'Role created successfully', data: role })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'Role already exists' })
    next(e)
  } finally {
    client.release()
  }
})

// ── PUT /api/roles/:id — update role (description, color, pages) ──
router.put('/:id', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { id } = req.params
    const { description, color, pages } = req.body

    const { rows: [role] } = await pool.query('SELECT * FROM roles WHERE id = $1', [id])
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' })

    await client.query('BEGIN')

    // Update role metadata
    const sets = []
    const vals = []
    let idx = 1
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description) }
    if (color !== undefined)       { sets.push(`color = $${idx++}`);       vals.push(color) }

    if (sets.length) {
      vals.push(id)
      await client.query(`UPDATE roles SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
    }

    // Replace page assignments
    if (pages !== undefined) {
      await client.query('DELETE FROM role_pages WHERE role_name = $1', [role.name])
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        const pageInfo = ALL_PAGES.find(ap => ap.id === p.page_id) || {}
        await client.query(
          'INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [role.name, p.page_id, p.label || pageInfo.label || p.page_id, p.icon || pageInfo.icon || '◈', i + 1]
        )
      }
    }

    await client.query('COMMIT')

    // Return updated role with pages
    const { rows: [updated] } = await pool.query('SELECT * FROM roles WHERE id = $1', [id])
    const { rows: rolePages } = await pool.query('SELECT * FROM role_pages WHERE role_name = $1 ORDER BY sort_order', [updated.name])
    updated.pages = rolePages

    res.json({ success: true, message: 'Role updated', data: updated })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    next(e)
  } finally {
    client.release()
  }
})

// ── DELETE /api/roles/:id — delete a custom role ─────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: [role] } = await pool.query('SELECT * FROM roles WHERE id = $1', [req.params.id])
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' })
    if (role.is_system) return res.status(400).json({ success: false, message: 'Cannot delete system roles' })

    // Check if any users have this role
    const { rows: users } = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE role = $1', [role.name])
    if (parseInt(users[0].cnt) > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${users[0].cnt} user(s) still have this role. Reassign them first.` })
    }

    await pool.query('DELETE FROM roles WHERE id = $1', [req.params.id])
    res.json({ success: true, message: 'Role deleted' })
  } catch (e) { next(e) }
})

module.exports = router
