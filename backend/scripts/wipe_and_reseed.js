// One-shot DB-level wipe + reseed.
// Truncates `users` (cascades wallets, employee_approvers, audit, requests, approvals)
// and recreates 4 users per designation with primary+backup approver chains for Employees.
// PPI wallet creation is intentionally skipped — ppi_* columns are NULL.
//
// Usage: node scripts/wipe_and_reseed.js
// DESTRUCTIVE — wipes all user data.

const bcrypt = require('bcryptjs')
const pool   = require('../src/config/db')

const PASSWORD       = 'pass123'
const SUPER_PASSWORD = 'admin123'

// 4 users per designation. Each tuple: [name, email, mobile]
const cohorts = [
  // CEO (Super Admin role, Tier 1)
  { designation: 'CEO',             role: 'Super Admin', dept: 'Admin',       color: '#30D158', superPwd: true,
    people: [
      ['Karthik Reddy',  'karthik.reddy@company.in',  '9000000101'],
      ['Sundar Pichai',  'sundar.pichai@company.in',  '9000000102'],
      ['Anita Roy',      'anita.roy@company.in',      '9000000103'],
      ['Manish Sinha',   'manish.sinha@company.in',   '9000000104'],
    ] },

  // Super Admin (Super Admin role, Tier 2) — admin@company.in is here for login
  { designation: 'Super Admin',     role: 'Super Admin', dept: 'Admin',       color: '#30D158', superPwd: true,
    people: [
      ['System Admin',   'admin@company.in',          '9000000201'],
      ['Ravi Kapoor',    'ravi.kapoor@company.in',    '9000000202'],
      ['Neha Sethi',     'neha.sethi@company.in',     '9000000203'],
      ['Arvind Menon',   'arvind.menon@company.in',   '9000000204'],
    ] },

  // Finance (Finance role, Tier 3)
  { designation: 'Finance',         role: 'Finance',     dept: 'Finance',     color: '#40C8E0',
    people: [
      ['Anjali Rao',     'anjali.rao@company.in',     '9000000301'],
      ['Rakesh Iyer',    'rakesh.iyer@company.in',    '9000000302'],
      ['Pooja Shah',     'pooja.shah@company.in',     '9000000303'],
      ['Deepak Bansal',  'deepak.bansal@company.in',  '9000000304'],
    ] },

  // Booking Admin (Booking Admin role, Tier 2)
  { designation: 'Booking Admin',   role: 'Booking Admin', dept: 'Admin',     color: '#FF6B6B',
    people: [
      ['Meena Iyer',     'meena.iyer@company.in',     '9000000401'],
      ['Suman Das',      'suman.das@company.in',      '9000000402'],
      ['Lakshmi Krishnan','lakshmi.krishnan@company.in','9000000403'],
      ['Vinod Pillai',   'vinod.pillai@company.in',   '9000000404'],
    ] },

  // Tech Lead (Request Approver role, Tier 4)
  { designation: 'Tech Lead',       role: 'Request Approver', dept: 'Engineering', color: '#BF5AF2',
    people: [
      ['John Murphy',    'john.murphy@company.in',    '9000000501'],
      ['Arjun Verma',    'arjun.verma@company.in',    '9000000502'],
      ['Suresh Pillai',  'suresh.pillai@company.in',  '9000000503'],
      ['Kavya Reddy',    'kavya.reddy@company.in',    '9000000504'],
    ] },

  // Manager (Request Approver role, Tier 3)
  { designation: 'Manager',         role: 'Request Approver', dept: 'Engineering', color: '#FF9F0A',
    people: [
      ['Priya Mehta',    'priya.mehta@company.in',    '9000000601'],
      ['Meena Joshi',    'meena.joshi@company.in',    '9000000602'],
      ['Vikram Singh',   'vikram.singh@company.in',   '9000000603'],
      ['Rohit Khanna',   'rohit.khanna@company.in',   '9000000604'],
    ] },

  // Software Engineer (Employee, Tier 5)
  { designation: 'Software Engineer', role: 'Employee',  dept: 'Engineering', color: '#0A84FF',
    people: [
      ['Rohan Kapoor',   'rohan.kapoor@company.in',   '9000000701'],
      ['Sanya Mishra',   'sanya.mishra@company.in',   '9000000702'],
      ['Aman Gupta',     'aman.gupta@company.in',     '9000000703'],
      ['Ishita Sen',     'ishita.sen@company.in',     '9000000704'],
    ] },

  // Tester (Employee, Tier 5)
  { designation: 'Tester',          role: 'Employee',    dept: 'QA',          color: '#0A84FF',
    people: [
      ['Karan Bhat',     'karan.bhat@company.in',     '9000000801'],
      ['Divya Nair',     'divya.nair@company.in',     '9000000802'],
      ['Tarun Joshi',    'tarun.joshi@company.in',    '9000000803'],
      ['Nidhi Agarwal',  'nidhi.agarwal@company.in',  '9000000804'],
    ] },

  // Content Creator (Employee, Tier 5)
  { designation: 'Content Creator', role: 'Employee',    dept: 'Content',     color: '#0A84FF',
    people: [
      ['Nisha Patel',    'nisha.patel@company.in',    '9000000901'],
      ['Aakash Bose',    'aakash.bose@company.in',    '9000000902'],
      ['Riya Kohli',     'riya.kohli@company.in',     '9000000903'],
      ['Mohit Saxena',   'mohit.saxena@company.in',   '9000000904'],
    ] },
]

function avatarOf(name) {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

;(async () => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1) Drop duplicate / lowercase designation rows so the master list is clean.
    const dupDel = await client.query(`
      DELETE FROM designation_tiers
      WHERE designation IN ('software developer','Software Developer')
      RETURNING designation
    `)
    console.log(`✓ removed duplicate designations: ${dupDel.rows.map(r=>r.designation).join(', ') || '(none)'}`)

    // 2) Wipe all user-derived data. CASCADE handles wallets, employee_approvers,
    //    approver_audit_log, travel_requests, approvals, wallet_transactions, etc.
    await client.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
    console.log('✓ users + dependent tables truncated')

    // 3) Pre-hash passwords once.
    const passwordHash      = await bcrypt.hash(PASSWORD, 10)
    const superPasswordHash = await bcrypt.hash(SUPER_PASSWORD, 10)

    // 4) Resolve tier_id per designation from designation_tiers.
    const tierMap = new Map()
    for (const c of cohorts) {
      const { rows } = await client.query(
        `SELECT t.id AS tier_id FROM designation_tiers dt
         JOIN tiers t ON t.id = dt.tier_id
         WHERE LOWER(dt.designation) = LOWER($1) LIMIT 1`,
        [c.designation]
      )
      tierMap.set(c.designation, rows[0]?.tier_id || null)
    }

    // 5) Insert all users. Track name → user_id for chain wiring.
    const idByName = new Map()
    let n = 1
    let inserted = 0

    for (const c of cohorts) {
      for (const [name, email, mobile] of c.people) {
        const empId = `EMP-${String(n).padStart(3, '0')}`; n++
        const tierId = tierMap.get(c.designation)
        const { rows: [u] } = await client.query(
          `INSERT INTO users (
             emp_id, name, email, password_hash, role, department, avatar, color,
             mobile_number, designation, tier_id
           ) VALUES (
             $1, $2, $3, $4, $5::user_role_enum, $6, $7, $8,
             $9, $10, $11
           ) RETURNING id`,
          [empId, name, email, c.superPwd ? superPasswordHash : passwordHash,
           c.role, c.dept, avatarOf(name), c.color, mobile, c.designation, tierId]
        )
        await client.query(
          `INSERT INTO wallets (user_id, balance, total_credited, total_debited, travel_balance, hotel_balance, allowance_balance)
           VALUES ($1, 0, 0, 0, 0, 0, 0)`,
          [u.id]
        )
        idByName.set(name, u.id)
        inserted++
      }
    }
    console.log(`✓ ${inserted} users inserted`)

    // 6) Wire approver chains: every Employee → Tech Lead step (primary TL#1, backup TL#2)
    //    → Manager step (primary M#1, backup M#2). Round-robin distributes load.
    const techLeads = cohorts.find(c => c.designation === 'Tech Lead').people.map(p => p[0])
    const managers  = cohorts.find(c => c.designation === 'Manager').people.map(p => p[0])
    const employeeDesgs = ['Software Engineer', 'Tester', 'Content Creator']

    let chains = 0
    let rr = 0
    for (const desg of employeeDesgs) {
      const cohort = cohorts.find(c => c.designation === desg)
      for (const [name] of cohort.people) {
        const empId = idByName.get(name)
        // Round-robin: pair (TL[i], TL[i+1]) and (M[i], M[i+1]) so primary/backup differ.
        const tlPrimary = techLeads[rr % techLeads.length]
        const tlBackup  = techLeads[(rr + 1) % techLeads.length]
        const mPrimary  = managers[rr % managers.length]
        const mBackup   = managers[(rr + 1) % managers.length]
        rr++

        await client.query(
          `INSERT INTO employee_approvers (user_id, step_designation, step_order, primary_user_id, backup_user_id)
             VALUES ($1, 'Tech Lead', 1, $2, $3)`,
          [empId, idByName.get(tlPrimary), idByName.get(tlBackup)]
        )
        await client.query(
          `INSERT INTO employee_approvers (user_id, step_designation, step_order, primary_user_id, backup_user_id)
             VALUES ($1, 'Manager', 2, $2, $3)`,
          [empId, idByName.get(mPrimary), idByName.get(mBackup)]
        )
        chains += 2
      }
    }
    console.log(`✓ ${chains} approver chain rows wired`)

    await client.query('COMMIT')

    // Summary
    const { rows: byRole } = await pool.query(
      `SELECT role::text AS role, COUNT(*)::int c FROM users GROUP BY role ORDER BY role`
    )
    console.log('\nFinal user count by role:')
    byRole.forEach(r => console.log(`  ${r.role.padEnd(20)} ${r.c}`))

    console.log('\nLogin credentials:')
    for (const c of cohorts) {
      const pwd = c.superPwd ? SUPER_PASSWORD : PASSWORD
      for (const [, email] of c.people) {
        console.log(`  ${email.padEnd(34)} ${c.designation.padEnd(20)} ${c.role.padEnd(18)} pwd: ${pwd}`)
      }
    }

    process.exit(0)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Wipe+reseed failed:', e.message)
    console.error(e.stack)
    process.exit(1)
  } finally {
    client.release()
  }
})()
