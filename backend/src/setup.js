require('dotenv').config()
const { Pool } = require('pg')
const bcrypt   = require('bcryptjs')
const fs       = require('fs')
const path     = require('path')

const adminPool = new Pool({ host:process.env.DB_HOST, port:process.env.DB_PORT, database:'postgres',    user:process.env.DB_USER, password:process.env.DB_PASSWORD })
const pool      = new Pool({ host:process.env.DB_HOST, port:process.env.DB_PORT, database:process.env.DB_NAME, user:process.env.DB_USER, password:process.env.DB_PASSWORD })

const USERS = [
  { email:'arjun@company.in',  password:'pass123',  role:'Employee'      },
  { email:'priya@company.in',  password:'pass123',  role:'Employee'      },
  { email:'deepa@company.in',  password:'pass123',  role:'Tech Lead'     },
  { email:'ravi@company.in',   password:'pass123',  role:'Manager'       },
  { email:'anil@company.in',   password:'pass123',  role:'Finance'       },
  { email:'meena@company.in',  password:'pass123',  role:'Booking Admin' },
  { email:'admin@company.in',  password:'admin123', role:'Super Admin'   },
]

async function run() {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  TravelDesk v3 — Setup                   ║')
  console.log('╚══════════════════════════════════════════╝\n')

  // 1. Create DB
  console.log('1. Creating database...')
  try {
    await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME}`)
    console.log('   ✓ Created')
  } catch(e) {
    if (e.code === '42P04') console.log('   ✓ Already exists')
    else throw e
  }
  await adminPool.end()

  // 2. Run schema
  console.log('\n2. Running schema...')
  const sql = fs.readFileSync(path.join(__dirname,'..','sql','schema.sql'),'utf8')
  await pool.query(sql)
  console.log('   ✓ All tables, triggers, views created')

  // 2b. Run roles migration (roles + role_pages)
  console.log('\n2b. Running roles migration...')
  const rolesSql = fs.readFileSync(path.join(__dirname,'..','sql','roles_migration.sql'),'utf8')
  await pool.query(rolesSql)
  console.log('   ✓ Roles and page access seeded')

  // 2c. Run bulk onboarding migration (bulk_jobs, bulk_job_rows, emp_id_seq)
  console.log('\n2c. Running bulk onboarding migration...')
  const bulkSql = fs.readFileSync(path.join(__dirname,'..','sql','bulk_onboarding_migration.sql'),'utf8')
  await pool.query(bulkSql)
  console.log('   ✓ Bulk onboarding tables and sequence created')

  // 3. Create uploads directory
  const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive:true })
  console.log('\n3. Created uploads directory')

  // 4. Set passwords + create wallets
  console.log('\n4. Setting passwords + creating wallets...')
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10)
    await pool.query('UPDATE users SET password_hash=$1 WHERE email=$2', [hash, u.email])
    const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [u.email])
    if (rows.length) {
      await pool.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [rows[0].id])
    }
    console.log(`   ✓ ${u.email.padEnd(28)} role: ${u.role.padEnd(14)} pwd: ${u.password}`)
  }

  // 5. Insert sample data
  console.log('\n5. Inserting sample data...')

  const { rows: arjun }  = await pool.query("SELECT id FROM users WHERE email='arjun@company.in'")
  const { rows: priya }  = await pool.query("SELECT id FROM users WHERE email='priya@company.in'")
  const { rows: deepa }  = await pool.query("SELECT id FROM users WHERE email='deepa@company.in'")
  const { rows: ravi }   = await pool.query("SELECT id FROM users WHERE email='ravi@company.in'")
  const { rows: anil }   = await pool.query("SELECT id FROM users WHERE email='anil@company.in'")

  // ── Request 1: Arjun — Self Booking — Already approved + wallet loaded ──
  if (arjun.length) {
    const { rows: w1 } = await pool.query('SELECT id,balance FROM wallets WHERE user_id=$1', [arjun[0].id])
    const wid1 = w1[0]?.id

    await pool.query(`
      INSERT INTO travel_requests (
        id, user_id, user_name, user_role, department,
        from_location, to_location, distance_type, travel_mode, booking_type,
        start_date, end_date, purpose,
        estimated_travel_cost, estimated_hotel_cost, estimated_total,
        approved_travel_cost, approved_hotel_cost, approved_allowance, approved_total,
        status, hierarchy_approved, hierarchy_approved_by, hierarchy_approved_at,
        finance_approved, finance_approved_by, finance_approved_at,
        wallet_credited, wallet_credit_amount, wallet_credited_at, booking_status
      ) VALUES (
        'TR-DEMO1', $1, 'Arjun Sharma', 'Employee', 'Engineering',
        'Chennai', 'Bangalore', 'short', 'Train', 'self',
        CURRENT_DATE + 5, CURRENT_DATE + 7, 'Client Demo',
        1800, 3000, 6300,
        1800, 3000, 1500, 6300,
        'approved', TRUE, 'Deepa Krishnan', NOW()-INTERVAL '1 day',
        TRUE, 'Anil Menon', NOW()-INTERVAL '12 hours',
        TRUE, 6300, NOW()-INTERVAL '12 hours', 'pending'
      ) ON CONFLICT (id) DO NOTHING
    `, [arjun[0].id])

    if (wid1) {
      const b1 = Number(w1[0].balance)
      await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,'TR-DEMO1','credit','travel',1800,'Travel allowance — TR-DEMO1',$3) ON CONFLICT DO NOTHING`, [wid1, arjun[0].id, b1+1800])
      await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,'TR-DEMO1','credit','hotel',3000,'Hotel allowance — TR-DEMO1',$3) ON CONFLICT DO NOTHING`, [wid1, arjun[0].id, b1+4800])
      await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,'TR-DEMO1','credit','allowance',1500,'Daily allowance (3 days) — TR-DEMO1',$3) ON CONFLICT DO NOTHING`, [wid1, arjun[0].id, b1+6300])
    }

    if (deepa.length) await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO1',$1,'Deepa Krishnan','Tech Lead','approved','Valid trip') ON CONFLICT DO NOTHING`, [deepa[0].id])
    if (anil.length)  await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO1',$1,'Anil Menon','Finance','approved','Budget approved',1800,3000,1500) ON CONFLICT DO NOTHING`, [anil[0].id])
    console.log('   ✓ TR-DEMO1 — Arjun — Self Booking — approved + wallet ₹6,300 loaded')
  }

  // ── Request 2: Priya — COMPANY Booking — Approved + wallet loaded (Booking Admin can see this) ──
  if (priya.length) {
    const { rows: w2 } = await pool.query('SELECT id,balance FROM wallets WHERE user_id=$1', [priya[0].id])
    const wid2 = w2[0]?.id

    await pool.query(`
      INSERT INTO travel_requests (
        id, user_id, user_name, user_role, department,
        from_location, to_location, distance_type, travel_mode, booking_type,
        start_date, end_date, purpose,
        estimated_travel_cost, estimated_hotel_cost, estimated_total,
        approved_travel_cost, approved_hotel_cost, approved_allowance, approved_total,
        status, hierarchy_approved, hierarchy_approved_by, hierarchy_approved_at,
        finance_approved, finance_approved_by, finance_approved_at,
        wallet_credited, wallet_credit_amount, wallet_credited_at, booking_status
      ) VALUES (
        'TR-DEMO2', $1, 'Priya Nair', 'Employee', 'QA',
        'Chennai', 'Mumbai', 'long', 'Flight', 'company',
        CURRENT_DATE + 10, CURRENT_DATE + 13, 'Sprint Review',
        8500, 12000, 24500,
        8500, 12000, 4000, 24500,
        'approved', TRUE, 'Deepa Krishnan', NOW()-INTERVAL '2 days',
        TRUE, 'Anil Menon', NOW()-INTERVAL '1 day',
        TRUE, 24500, NOW()-INTERVAL '1 day', 'pending'
      ) ON CONFLICT (id) DO NOTHING
    `, [priya[0].id])

    if (wid2) {
      const b2 = Number(w2[0].balance)
      await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,'TR-DEMO2','credit','travel',8500,'Travel cost (flight) — TR-DEMO2',$3) ON CONFLICT DO NOTHING`, [wid2, priya[0].id, b2+8500])
      await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,'TR-DEMO2','credit','hotel',12000,'Hotel allowance (3 nights) — TR-DEMO2',$3) ON CONFLICT DO NOTHING`, [wid2, priya[0].id, b2+20500])
      await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,'TR-DEMO2','credit','allowance',4000,'Daily allowance (4 days) — TR-DEMO2',$3) ON CONFLICT DO NOTHING`, [wid2, priya[0].id, b2+24500])
    }

    if (deepa.length) await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO2',$1,'Deepa Krishnan','Tech Lead','approved','Approved for sprint review') ON CONFLICT DO NOTHING`, [deepa[0].id])
    if (anil.length)  await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO2',$1,'Anil Menon','Finance','approved','Finance approved',8500,12000,4000) ON CONFLICT DO NOTHING`, [anil[0].id])
    console.log('   ✓ TR-DEMO2 — Priya — COMPANY Booking — approved + wallet ₹24,500 loaded ← Booking Admin will see this')
  }

  // ── Request 3: Arjun — COMPANY Booking — Pending (needs approval) ──
  if (arjun.length) {
    await pool.query(`
      INSERT INTO travel_requests (
        id, user_id, user_name, user_role, department,
        from_location, to_location, distance_type, travel_mode, booking_type,
        start_date, end_date, purpose,
        estimated_travel_cost, estimated_hotel_cost, estimated_total,
        status, booking_status
      ) VALUES (
        'TR-DEMO3', $1, 'Arjun Sharma', 'Employee', 'Engineering',
        'Chennai', 'Delhi', 'long', 'Flight', 'company',
        CURRENT_DATE + 20, CURRENT_DATE + 23, 'Architecture Review',
        9000, 15000, 28000,
        'pending', 'pending'
      ) ON CONFLICT (id) DO NOTHING
    `, [arjun[0].id])
    console.log('   ✓ TR-DEMO3 — Arjun — Company Booking — Pending approval (TL/Finance queue)')
  }

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  Setup Complete!                         ║')
  console.log('╚══════════════════════════════════════════╝\n')
  console.log('Login credentials:')
  console.log('─────────────────────────────────────────────')
  console.log('  Employee      arjun@company.in    pass123')
  console.log('  Employee      priya@company.in    pass123')
  console.log('  Tech Lead     deepa@company.in    pass123')
  console.log('  Manager       ravi@company.in     pass123')
  console.log('  Finance       anil@company.in     pass123')
  console.log('  Booking Admin meena@company.in    pass123  ← books TR-DEMO2 (Priya\'s company booking)')
  console.log('  Super Admin   admin@company.in    admin123')
  console.log('\nStart: npm start\n')
  await pool.end()
}

run().catch(e => { console.error('Setup failed:', e.message); console.error(e.stack); process.exit(1) })
// Note: tickets table is added via schema.sql extension block at bottom
