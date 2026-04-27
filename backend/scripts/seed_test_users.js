// One-shot seeding script for development. Adds:
//   · 3 new designations (Software Developer, Tester, Content Creator) → Employee role / Tier 5
//   · Approvers (Tech Lead × 3, Manager × 3, Finance × 2, Super Admin × 1)
//   · Employees under those approvers, with primary + backup chains pre-wired
//
// Usage: node scripts/seed_test_users.js
// Idempotent: re-running skips existing emails.

const bcrypt = require('bcryptjs')
const pool   = require('../src/config/db')

const PASSWORD       = 'pass123'
const SUPER_PASSWORD = 'admin123'

// -------- designations to upsert --------
const designations = [
  // [designation, role, tierName]
  ['Software Developer', 'Employee',         'Tier 5'],
  ['Tester',             'Employee',         'Tier 5'],
  ['Content Creator',    'Employee',         'Tier 5'],
]

// -------- users to create --------
// Each block is one role/designation cohort. Approver chains are stitched after all rows exist.
const users = [
  // Tech Leads (Request Approver, Tier 4)
  { name: 'John Murphy',     email: 'john.murphy@company.in',     role: 'Request Approver', designation: 'Tech Lead', dept: 'Engineering', color: '#BF5AF2' },
  { name: 'Arjun Verma',     email: 'arjun.verma@company.in',     role: 'Request Approver', designation: 'Tech Lead', dept: 'Engineering', color: '#BF5AF2' },
  { name: 'Suresh Pillai',   email: 'suresh.pillai@company.in',   role: 'Request Approver', designation: 'Tech Lead', dept: 'Content',     color: '#BF5AF2' },

  // Managers (Request Approver, Tier 3)
  { name: 'Priya Mehta',     email: 'priya.mehta@company.in',     role: 'Request Approver', designation: 'Manager',   dept: 'Engineering', color: '#FF9F0A' },
  { name: 'Meena Joshi',     email: 'meena.joshi@company.in',     role: 'Request Approver', designation: 'Manager',   dept: 'Engineering', color: '#FF9F0A' },
  { name: 'Vikram Singh',    email: 'vikram.singh@company.in',    role: 'Request Approver', designation: 'Manager',   dept: 'Content',     color: '#FF9F0A' },

  // Finance (Tier 3)
  { name: 'Anjali Rao',      email: 'anjali.rao@company.in',      role: 'Finance',          designation: 'Finance',   dept: 'Finance',     color: '#40C8E0' },
  { name: 'Rakesh Iyer',     email: 'rakesh.iyer@company.in',     role: 'Finance',          designation: 'Finance',   dept: 'Finance',     color: '#40C8E0' },

  // Super Admin (Tier 1 — manages users; not in approval flow)
  { name: 'Karthik Reddy',   email: 'karthik.reddy@company.in',   role: 'Super Admin',      designation: 'Super Admin', dept: 'Admin',     color: '#30D158', superPwd: true },

  // Software Developers (Employee, Tier 5)
  { name: 'Rohan Kapoor',    email: 'rohan.kapoor@company.in',    role: 'Employee',         designation: 'Software Developer', dept: 'Engineering', color: '#0A84FF',
    chain: [['Tech Lead', 'John Murphy', 'Arjun Verma'], ['Manager', 'Priya Mehta', 'Meena Joshi']] },
  { name: 'Sanya Mishra',    email: 'sanya.mishra@company.in',    role: 'Employee',         designation: 'Software Developer', dept: 'Engineering', color: '#0A84FF',
    chain: [['Tech Lead', 'John Murphy', 'Arjun Verma'], ['Manager', 'Priya Mehta', 'Meena Joshi']] },

  // Testers (Employee, Tier 5)
  { name: 'Karan Bhat',      email: 'karan.bhat@company.in',      role: 'Employee',         designation: 'Tester',     dept: 'QA',          color: '#0A84FF',
    chain: [['Tech Lead', 'John Murphy', 'Arjun Verma'], ['Manager', 'Priya Mehta', 'Meena Joshi']] },
  { name: 'Divya Nair',      email: 'divya.nair@company.in',      role: 'Employee',         designation: 'Tester',     dept: 'QA',          color: '#0A84FF',
    chain: [['Tech Lead', 'Arjun Verma', 'John Murphy'], ['Manager', 'Meena Joshi', 'Priya Mehta']] },

  // Content Creators (Employee, Tier 5)
  { name: 'Nisha Patel',     email: 'nisha.patel@company.in',     role: 'Employee',         designation: 'Content Creator', dept: 'Content', color: '#0A84FF',
    chain: [['Tech Lead', 'Suresh Pillai', 'John Murphy'], ['Manager', 'Vikram Singh', 'Priya Mehta']] },
  { name: 'Aakash Bose',     email: 'aakash.bose@company.in',     role: 'Employee',         designation: 'Content Creator', dept: 'Content', color: '#0A84FF',
    chain: [['Tech Lead', 'Suresh Pillai', 'John Murphy'], ['Manager', 'Vikram Singh', 'Priya Mehta']] },
]

function avatarOf(name) {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

(async () => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1) Upsert designations
    for (const [desg, role, tierName] of designations) {
      const { rows: t } = await client.query(`SELECT id FROM tiers WHERE name = $1`, [tierName])
      if (!t.length) { console.warn(`Tier "${tierName}" not found, skipping designation "${desg}"`); continue }
      await client.query(
        `INSERT INTO designation_tiers (designation, tier_id, role)
           VALUES ($1, $2, $3::user_role_enum)
         ON CONFLICT (designation) DO UPDATE
           SET tier_id = EXCLUDED.tier_id, role = EXCLUDED.role`,
        [desg, t[0].id, role]
      )
    }
    console.log(`✓ ${designations.length} designations upserted`)

    // 2) Find next emp_id starting number
    const { rows: maxRow } = await client.query(
      `SELECT emp_id FROM users WHERE emp_id LIKE 'EMP-%' ORDER BY LENGTH(emp_id) DESC, emp_id DESC LIMIT 1`
    )
    const m = (maxRow[0]?.emp_id || 'EMP-000').match(/(\d+)$/)
    let nextNum = m ? Number(m[1]) + 1 : 1

    // 3) Insert users (skip if email already exists)
    const passwordHash      = await bcrypt.hash(PASSWORD, 10)
    const superPasswordHash = await bcrypt.hash(SUPER_PASSWORD, 10)
    const createdMap = new Map() // name → user_id (for chain wiring)
    let inserted = 0, skipped = 0

    for (const u of users) {
      const { rows: existing } = await client.query(
        `SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)`,
        [u.email]
      )
      if (existing.length) {
        createdMap.set(u.name, existing[0].id)
        skipped++
        continue
      }

      const empId = `EMP-${String(nextNum).padStart(3, '0')}`
      nextNum++

      const tierIdRow = await client.query(`
        SELECT t.id AS tier_id FROM designation_tiers dt
        JOIN tiers t ON t.id = dt.tier_id
        WHERE LOWER(dt.designation) = LOWER($1) LIMIT 1
      `, [u.designation])
      const tierId = tierIdRow.rows[0]?.tier_id || null

      const { rows: [user] } = await client.query(
        `INSERT INTO users (
           emp_id, name, email, password_hash, role, department, avatar, color,
           reporting_to, mobile_number, designation, tier_id
         ) VALUES (
           $1, $2, $3, $4, $5::user_role_enum, $6, $7, $8,
           NULL, NULL, $9, $10
         ) RETURNING id`,
        [
          empId, u.name, u.email,
          u.superPwd ? superPasswordHash : passwordHash,
          u.role, u.dept, avatarOf(u.name), u.color,
          u.designation, tierId,
        ]
      )

      // Internal wallet (PPI is skipped — these are dev seed users)
      await client.query(
        `INSERT INTO wallets (user_id, balance, total_credited, total_debited, travel_balance, hotel_balance, allowance_balance)
         VALUES ($1, 0, 0, 0, 0, 0, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      )

      createdMap.set(u.name, user.id)
      inserted++
    }
    console.log(`✓ ${inserted} users inserted, ${skipped} skipped`)

    // 4) Wire approver chains for employees
    let chainsWritten = 0
    for (const u of users) {
      if (!u.chain) continue
      const employeeId = createdMap.get(u.name)
      if (!employeeId) continue
      await client.query('DELETE FROM employee_approvers WHERE user_id = $1', [employeeId])
      for (let i = 0; i < u.chain.length; i++) {
        const [stepDesg, primaryName, backupName] = u.chain[i]
        const primaryId = createdMap.get(primaryName) || null
        const backupId  = createdMap.get(backupName)  || null
        if (!primaryId) {
          console.warn(`! skip chain row for ${u.name}: primary "${primaryName}" not found`)
          continue
        }
        await client.query(
          `INSERT INTO employee_approvers (user_id, step_designation, step_order, primary_user_id, backup_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
          [employeeId, stepDesg, i + 1, primaryId, backupId]
        )
        chainsWritten++
      }
    }
    console.log(`✓ ${chainsWritten} approver chain rows written`)

    await client.query('COMMIT')

    console.log('\nLogin credentials:')
    for (const u of users) {
      console.log(`  ${u.email.padEnd(32)} ${u.designation.padEnd(20)} ${u.role.padEnd(18)} pwd: ${u.superPwd ? SUPER_PASSWORD : PASSWORD}`)
    }

    process.exit(0)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Seed failed:', e.message)
    process.exit(1)
  } finally {
    client.release()
  }
})()
