const express = require('express')
const pool    = require('../config/db')
const { authenticate, pageGuard } = require('../middleware')
const router  = express.Router()

router.use(authenticate)
router.use(pageGuard('roles'))

// Master list of all available pages in the system.
// admin_only = true for pages that should appear in the Admin User permission
// matrix (i.e. system-management surfaces). Employee-side pages stay in the
// list so the existing role manager UI keeps working, but the Admin User
// matrix filters by admin_only.
const ALL_PAGES = [
  { id: 'dashboard',          label: 'Dashboard',       icon: '▦',  group: 'General',         admin_only: false },
  { id: 'my-requests',        label: 'My Requests',     icon: '◈',  group: 'Requests',        admin_only: false },
  { id: 'new-request',        label: 'New Request',     icon: '+',  group: 'Requests',        admin_only: false },
  { id: 'approvals',          label: 'Approvals',       icon: '◎',  group: 'Approvals',       admin_only: false },
  { id: 'my-wallet',          label: 'My Wallet',       icon: '◉',  group: 'Wallet',          admin_only: false },
  { id: 'book',               label: 'Book Travel',     icon: '🎫', group: 'Booking',         admin_only: false },
  { id: 'my-tickets',         label: 'My Tickets',      icon: '🎟', group: 'Booking',         admin_only: false },
  { id: 'transactions',       label: 'Transactions',    icon: '⊟',  group: 'Wallet',          admin_only: false },
  { id: 'admin-bookings-view',label: 'Booking History', icon: '◎',  group: 'Admin Booking',   admin_only: true  },
  { id: 'booking-panel',      label: 'Booking Panel',   icon: '◈',  group: 'Admin Booking',   admin_only: true  },
  { id: 'employees',          label: 'Employees',       icon: '◆',  group: 'Administration', admin_only: true  },
  { id: 'roles',              label: 'Role Manager',    icon: '⚙',  group: 'Administration', admin_only: true  },
  { id: 'tiers',              label: 'Tier Config',     icon: '◐',  group: 'Administration', admin_only: true  },
  { id: 'designations',       label: 'Designations',    icon: '◇',  group: 'Administration', admin_only: true  },
  { id: 'audit-log',          label: 'Approver Audit',  icon: '▤',  group: 'Administration', admin_only: true  },
  { id: 'admin-users',        label: 'Admin Users',     icon: '◈',  group: 'Administration', admin_only: true  },
]

// ── GET /api/roles/pages — master list of all pages ──────────
router.get('/pages', async (req, res) => {
  res.json({ success: true, data: ALL_PAGES })
})

// ── GET /api/roles — list all roles with their pages and approval flow ──
// The approval flow is NOT configured here anymore; it is derived from Tier Config
// by looking up designation_tiers where designation = role.name.
router.get('/', async (req, res, next) => {
  try {
    const [{ rows: roles }, { rows: pages }, { rows: designations }, { rows: tiers }, { rows: userCounts }] = await Promise.all([
      pool.query('SELECT * FROM roles ORDER BY id'),
      pool.query('SELECT * FROM role_pages ORDER BY role_name, sort_order'),
      pool.query(`
        SELECT dt.id, dt.designation, dt.role,
               t.id AS tier_id, t.name AS tier_name, t.rank AS tier_rank,
               t.approver_roles AS tier_approver_roles
        FROM designation_tiers dt
        LEFT JOIN tiers t ON t.id = dt.tier_id
      `),
      pool.query('SELECT id, name, rank, approver_roles FROM tiers'),
      pool.query(`SELECT role::text AS role, COUNT(*)::int AS n FROM users WHERE is_active = TRUE GROUP BY role`),
    ])

    const byDesignationName = new Map(designations.map(d => [d.designation.toLowerCase(), d]))
    const userCountByRole   = new Map(userCounts.map(u => [u.role, u.n]))

    const rolesWithRel = roles.map(r => {
      // Approval flow for this role's requesters (derived via same-name designation).
      const tierForRole = byDesignationName.get(r.name.toLowerCase()) || null

      // Reverse relationship — designations that declare this role.
      const linkedDesignations = designations
        .filter(d => d.role === r.name)
        .map(d => ({ id: d.id, designation: d.designation, tier_name: d.tier_name, tier_rank: d.tier_rank }))

      // Tiers where this role is part of the approval sequence.
      const actsAsApproverFor = tiers
        .filter(t => Array.isArray(t.approver_roles) && t.approver_roles.includes(r.name))
        .map(t => ({ id: t.id, name: t.name, rank: t.rank }))

      return {
        ...r,
        pages:        pages.filter(p => p.role_name === r.name),
        approvers:    Array.isArray(tierForRole?.tier_approver_roles) ? tierForRole.tier_approver_roles : [],
        approval_tier: tierForRole ? { id: tierForRole.tier_id, name: tierForRole.tier_name, rank: tierForRole.tier_rank } : null,
        linked_designations: linkedDesignations,
        acts_as_approver_for: actsAsApproverFor,
        employee_count:       userCountByRole.get(r.name) || 0,
      }
    })

    res.json({ success: true, data: rolesWithRel })
  } catch (e) { next(e) }
})

// ── POST /api/roles — create a new role ──────────────────────
router.post('/', async (req, res, next) => {
  const client = await pool.connect()
  try {
    // `approvers` is intentionally ignored — approval flow is now sourced from Tier Config.
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

    // Insert page assignments — Dashboard is always first, regardless of what the
    // admin selected (or didn't select) in the modal.
    const dashboardInfo = ALL_PAGES.find(ap => ap.id === 'dashboard') || { label: 'Dashboard', icon: '▦' }
    const otherPages = (pages || []).filter(p => p.page_id !== 'dashboard')
    const orderedPages = [{ page_id: 'dashboard', label: dashboardInfo.label, icon: dashboardInfo.icon }, ...otherPages]
    for (let i = 0; i < orderedPages.length; i++) {
      const p = orderedPages[i]
      const pageInfo = ALL_PAGES.find(ap => ap.id === p.page_id) || {}
      await client.query(
        'INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [roleName, p.page_id, p.label || pageInfo.label || p.page_id, p.icon || pageInfo.icon || '◈', i + 1]
      )
    }

    // Approval flow is NOT configured here — it comes from Tier Config via
    // designation_tiers (designation = role.name). If the administrator wants this
    // new role to have an approval chain, they must add a mapping in Tier Config.

    // Also create a tier_config entry for the new role
    await client.query(
      `INSERT INTO tier_config (role, allowed_modes, max_trip_budget, daily_allowance, max_hotel_per_night, cab_daily_limit, food_daily_limit, color)
       VALUES ($1, $2, 0, 0, 0, 0, 0, $3)
       ON CONFLICT (role) DO NOTHING`,
      [roleName, '{}', color || '#888']
    )

    await client.query('COMMIT')

    // Fetch the role with pages + resolved tier-based approvers
    const { rows: rolePages } = await pool.query('SELECT * FROM role_pages WHERE role_name = $1 ORDER BY sort_order', [roleName])
    const { rows: tierRow }   = await pool.query(`
      SELECT t.id AS tier_id, t.name AS tier_name, t.rank AS tier_rank, t.approver_roles
      FROM designation_tiers dt
      JOIN tiers t ON t.id = dt.tier_id
      WHERE LOWER(dt.designation) = LOWER($1)
      LIMIT 1
    `, [roleName])
    role.pages         = rolePages
    role.approvers     = Array.isArray(tierRow[0]?.approver_roles) ? tierRow[0].approver_roles : []
    role.approval_tier = tierRow[0] ? { id: tierRow[0].tier_id, name: tierRow[0].tier_name, rank: tierRow[0].tier_rank } : null

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
    // `approvers` is intentionally ignored — approval flow is now sourced from Tier Config.
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

    // Replace page assignments — Dashboard is always pinned to position 1.
    if (pages !== undefined) {
      await client.query('DELETE FROM role_pages WHERE role_name = $1', [role.name])
      const dashboardInfo = ALL_PAGES.find(ap => ap.id === 'dashboard') || { label: 'Dashboard', icon: '▦' }
      const otherPages = pages.filter(p => p.page_id !== 'dashboard')
      const orderedPages = [{ page_id: 'dashboard', label: dashboardInfo.label, icon: dashboardInfo.icon }, ...otherPages]
      for (let i = 0; i < orderedPages.length; i++) {
        const p = orderedPages[i]
        const pageInfo = ALL_PAGES.find(ap => ap.id === p.page_id) || {}
        await client.query(
          'INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [role.name, p.page_id, p.label || pageInfo.label || p.page_id, p.icon || pageInfo.icon || '◈', i + 1]
        )
      }
    }

    await client.query('COMMIT')

    // Return updated role with pages + resolved tier-based approvers
    const { rows: [updated] } = await pool.query('SELECT * FROM roles WHERE id = $1', [id])
    const { rows: rolePages } = await pool.query('SELECT * FROM role_pages WHERE role_name = $1 ORDER BY sort_order', [updated.name])
    const { rows: tierRow }   = await pool.query(`
      SELECT t.id AS tier_id, t.name AS tier_name, t.rank AS tier_rank, t.approver_roles
      FROM designation_tiers dt
      JOIN tiers t ON t.id = dt.tier_id
      WHERE LOWER(dt.designation) = LOWER($1)
      LIMIT 1
    `, [updated.name])
    updated.pages         = rolePages
    updated.approvers     = Array.isArray(tierRow[0]?.approver_roles) ? tierRow[0].approver_roles : []
    updated.approval_tier = tierRow[0] ? { id: tierRow[0].tier_id, name: tierRow[0].tier_name, rank: tierRow[0].tier_rank } : null

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

    // Guard 1: any active users still assigned to this role?
    const { rows: users } = await pool.query('SELECT COUNT(*)::int AS cnt FROM users WHERE role::text = $1', [role.name])
    if (users[0].cnt > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${users[0].cnt} user(s) still have this role. Reassign them first.` })
    }

    // Guard 2: any designation_tiers row referencing this role?
    const { rows: desg } = await pool.query('SELECT COUNT(*)::int AS cnt FROM designation_tiers WHERE role::text = $1', [role.name])
    if (desg[0].cnt > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${desg[0].cnt} designation(s) are mapped to this role. Open the Designations page and re-assign them first.` })
    }

    // Guard 3: any tier listing this role as an approver?
    const { rows: tiers } = await pool.query('SELECT COUNT(*)::int AS cnt FROM tiers WHERE $1 = ANY(approver_roles)', [role.name])
    if (tiers[0].cnt > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${tiers[0].cnt} tier(s) use this role in their approval sequence. Remove it from those tiers first.` })
    }

    await pool.query('DELETE FROM roles WHERE id = $1', [req.params.id])
    res.json({ success: true, message: 'Role deleted' })
  } catch (e) { next(e) }
})

module.exports = router
