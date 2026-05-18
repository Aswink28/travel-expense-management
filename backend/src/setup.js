require('./config/env')
const { Pool } = require('pg')
const bcrypt   = require('bcryptjs')
const fs       = require('fs')
const path     = require('path')

const adminPool = new Pool({ host:process.env.DB_HOST, port:process.env.DB_PORT, database:'postgres',    user:process.env.DB_USER, password:process.env.DB_PASSWORD })
const pool      = new Pool({ host:process.env.DB_HOST, port:process.env.DB_PORT, database:process.env.DB_NAME, user:process.env.DB_USER, password:process.env.DB_PASSWORD })

const USERS = [
  { email:'arjun@company.in',  password:'pass123',  role:'Employee' },
  { email:'priya@company.in',  password:'pass123',  role:'Employee' },
  { email:'deepa@company.in',  password:'pass123',  role:'Request Approver'     },
  { email:'ravi@company.in',   password:'pass123',  role:'Request Approver'       },
  { email:'anil@company.in',   password:'pass123',  role:'Finance'       },
  { email:'meena@company.in',  password:'pass123',  role:'Booking Admin' },
  { email:'admin@company.in',  password:'admin123', role:'Super Admin'   },
  // Additional demo employees
  { email:'sanjay@company.in', password:'pass123',  role:'Employee' },
  { email:'kavitha@company.in',password:'pass123',  role:'Employee' },
  { email:'vikram@company.in', password:'pass123',  role:'Employee' },
  { email:'anjali@company.in', password:'pass123',  role:'Employee' },
  { email:'rahul@company.in',  password:'pass123',  role:'Employee' },
  { email:'nisha@company.in',  password:'pass123',  role:'Employee' },
  { email:'suresh@company.in', password:'pass123',  role:'Request Approver' },
  { email:'lakshmi@company.in',password:'pass123',  role:'Employee' },
  { email:'amit@company.in',   password:'pass123',  role:'Employee' },
  { email:'divya@company.in',  password:'pass123',  role:'Employee' },
  { email:'karthik@company.in',password:'pass123',  role:'Employee' },
  { email:'pooja@company.in',  password:'pass123',  role:'Employee' },
  { email:'mohan@company.in',  password:'pass123',  role:'Employee' },
]

async function run() {
  const forceReset = process.argv.includes('--reset')

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  TravelDesk v3 — Setup                   ║')
  console.log('╚══════════════════════════════════════════╝\n')

  if (forceReset) {
    console.log('⚠  --reset flag detected: will DROP and recreate all tables\n')
  }

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

  // 2. Check if tables already exist
  const { rows: tableCheck } = await pool.query(
    "SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema='public' AND table_name='users'"
  )
  const tablesExist = Number(tableCheck[0].c) > 0

  if (!tablesExist || forceReset) {
    // Fresh install or forced reset — run full schema (DROP + CREATE)
    // Drop migration-created tables first (schema.sql only drops its own tables)
    console.log('\n2. Running schema (fresh install)...')
    await pool.query(`
      DROP TABLE IF EXISTS approver_audit_log   CASCADE;
      DROP TABLE IF EXISTS employee_approvers    CASCADE;
      DROP TABLE IF EXISTS designation_tiers     CASCADE;
      DROP TABLE IF EXISTS tiers                 CASCADE;
      DROP TABLE IF EXISTS role_pages            CASCADE;
      DROP TABLE IF EXISTS role_approvers        CASCADE;
      DROP TABLE IF EXISTS roles                 CASCADE;
      DROP TABLE IF EXISTS bulk_employees        CASCADE;
    `)
    const sql = fs.readFileSync(path.join(process.cwd(),'sql','schema.sql'),'utf8')
    await pool.query(sql)
    console.log('   ✓ All tables, triggers, views created')
  } else {
    console.log('\n2. Tables already exist — skipping schema (data preserved)')
    console.log('   ℹ  Use "node src/setup.js --reset" to force DROP + recreate')
  }

  // 2b. Run roles migration (safe — uses IF NOT EXISTS + ON CONFLICT DO NOTHING)
  console.log('\n2b. Running roles migration...')
  const rolesSql = fs.readFileSync(path.join(process.cwd(),'sql','roles_migration.sql'),'utf8')
  await pool.query(rolesSql)
  console.log('   ✓ Roles and page access seeded')

  // 2c. Run bulk onboarding migration (safe — uses IF NOT EXISTS)
  console.log('\n2c. Running bulk onboarding migration...')
  const bulkSql = fs.readFileSync(path.join(process.cwd(),'sql','bulk_onboarding_migration.sql'),'utf8')
  await pool.query(bulkSql)
  console.log('   ✓ Bulk onboarding tables and sequence created')

  // 2d. Run employee approval config migration (safe — uses IF NOT EXISTS)
  console.log('\n2d. Running employee approval config migration...')
  const approvalSql = fs.readFileSync(path.join(process.cwd(),'sql','employee_approval_config_migration.sql'),'utf8')
  await pool.query(approvalSql)
  console.log('   ✓ Per-employee approval config columns added')

  // 2e. Run tier system migration (safe — uses IF NOT EXISTS)
  console.log('\n2e. Running tier system migration...')
  const tierSql = fs.readFileSync(path.join(process.cwd(),'sql','tier_system_migration.sql'),'utf8')
  await pool.query(tierSql)
  console.log('   ✓ Tiers and designation mappings created')

  // 2f. Run tier system extension migration (hotel/meal/cab caps, advance-booking, is_active)
  console.log('\n2f. Running tier system extension migration...')
  const tierExtSql = fs.readFileSync(path.join(process.cwd(),'sql','tier_system_extended_migration.sql'),'utf8')
  await pool.query(tierExtSql)
  console.log('   ✓ Tier policy fields extended')

  // 2g. Role consolidation migration — collapses job-title roles (Tech Lead, Manager,
  //     Software Engineer) into permission classes (Employee, Request Approver).
  //     Runs in two phases because Postgres won't let a newly-added enum value be
  //     used in the same transaction it was created in.
  console.log('\n2g. Running role consolidation migration (phase 1: enum)...')
  const roleEnumSql = fs.readFileSync(path.join(process.cwd(),'sql','role_consolidation_enum.sql'),'utf8')
  await pool.query(roleEnumSql)
  console.log('   ✓ Enum values added')

  console.log('\n2g. Running role consolidation migration (phase 2: data)...')
  const roleConsSql = fs.readFileSync(path.join(process.cwd(),'sql','role_consolidation_migration.sql'),'utf8')
  await pool.query(roleConsSql)
  console.log('   ✓ Roles, users, and designations consolidated')

  // 2h. Per-employee primary + backup approvers + audit log
  console.log('\n2h. Running employee approvers migration...')
  const empApproversSql = fs.readFileSync(path.join(process.cwd(),'sql','employee_approvers_migration.sql'),'utf8')
  await pool.query(empApproversSql)
  console.log('   ✓ employee_approvers + approver_audit_log tables ready')

  // 2i. Designation-level "Is Approver" flag — drives Tier Config approver picker
  console.log('\n2i. Running designation is_approver migration...')
  const desigApproverSql = fs.readFileSync(path.join(process.cwd(),'sql','designation_is_approver_migration.sql'),'utf8')
  await pool.query(desigApproverSql)
  console.log('   ✓ designation_tiers.is_approver column ready')

  // 2j. Role-level V/C/E/D permissions on role_pages — Phase 1 of Admin User RBAC.
  console.log('\n2j. Running role permissions migration...')
  const rolePermsSql = fs.readFileSync(path.join(process.cwd(),'sql','role_permissions_migration.sql'),'utf8')
  await pool.query(rolePermsSql)
  console.log('   ✓ role_pages permission columns ready (View/Create/Edit/Delete)')

  // 2k. Parallel approval flow — adds approval_flow to users + tiers.
  console.log('\n2k. Running parallel approval migration...')
  const parallelApprovalSql = fs.readFileSync(path.join(process.cwd(),'sql','parallel_approval_migration.sql'),'utf8')
  await pool.query(parallelApprovalSql)
  console.log('   ✓ approval_flow column ready on users + tiers (SEQUENTIAL default)')

  // 2k-2. Admin "Create On Behalf" — adds page entry + request columns.
  console.log('\n2k-2. Running admin on-behalf migration...')
  const onBehalfSql = fs.readFileSync(path.join(process.cwd(),'sql','admin_on_behalf_migration.sql'),'utf8')
  await pool.query(onBehalfSql)
  console.log('   ✓ admin-create-request page + created_by columns ready')

  // 2l. Assign designation + tier_id to all seed users.
  //     The schema.sql INSERT doesn't include these columns (added by migration).
  //     Map from known emp_ids to the original job-title designations, then link
  //     tier_id from the designation_tiers table.
  console.log('\n2l. Assigning designations + tier_ids to seed users...')
  await pool.query(`
    UPDATE users SET designation = 'Tech Lead'         WHERE emp_id IN ('EMP-003','EMP-014') AND designation IS NULL;
    UPDATE users SET designation = 'Manager'            WHERE emp_id = 'EMP-004'              AND designation IS NULL;
    UPDATE users SET designation = 'Finance'             WHERE emp_id = 'EMP-005'              AND designation IS NULL;
    UPDATE users SET designation = 'Booking Admin'       WHERE emp_id = 'EMP-006'              AND designation IS NULL;
    UPDATE users SET designation = 'Super Admin'         WHERE emp_id = 'EMP-007'              AND designation IS NULL;
    UPDATE users SET designation = 'Software Engineer'   WHERE designation IS NULL;
  `)
  await pool.query(`
    UPDATE users u
       SET tier_id = dt.tier_id
      FROM designation_tiers dt
     WHERE u.designation = dt.designation
       AND u.tier_id IS NULL
  `)
  const { rows: tierCheck } = await pool.query(
    `SELECT COUNT(*) AS total, COUNT(tier_id) AS linked FROM users`
  )
  console.log(`   ✓ ${tierCheck[0].linked}/${tierCheck[0].total} users linked to tiers`)

  // 2m. Copy tier's approver_roles to each user so the New Request form shows the
  //     approval chain instead of "No approvers configured" warning.
  console.log('\n2m. Syncing approver_roles + personal data to seed users...')
  await pool.query(`
    UPDATE users u
       SET approver_roles = t.approver_roles
      FROM tiers t
     WHERE t.id = u.tier_id
       AND (u.approver_roles IS NULL OR u.approver_roles = '{}')
  `)
  console.log('   ✓ approver_roles synced from tier config')

  // Personal data for all seed users (Aadhaar, PAN, Gender, DOB, Mobile)
  const personalData = [
    { empId:'EMP-001', mobile:'9876543201', dob:'1995-06-15', gender:'Male',   pan:'ABCPK1234A', aadhaar:'234567890101' },
    { empId:'EMP-002', mobile:'9876543202', dob:'1996-03-22', gender:'Female', pan:'BCDPN5678B', aadhaar:'234567890102' },
    { empId:'EMP-003', mobile:'9876543203', dob:'1990-11-08', gender:'Female', pan:'CDEPD9012C', aadhaar:'234567890103' },
    { empId:'EMP-004', mobile:'9876543204', dob:'1988-01-30', gender:'Male',   pan:'DEFPR3456D', aadhaar:'234567890104' },
    { empId:'EMP-005', mobile:'9876543205', dob:'1987-09-14', gender:'Male',   pan:'EFGPM7890E', aadhaar:'234567890105' },
    { empId:'EMP-006', mobile:'9876543206', dob:'1992-07-25', gender:'Female', pan:'FGHPM2345F', aadhaar:'234567890106' },
    { empId:'EMP-007', mobile:'9876543207', dob:'1985-04-10', gender:'Male',   pan:'GHIPA6789G', aadhaar:'234567890107' },
    { empId:'EMP-008', mobile:'9876543208', dob:'1994-02-18', gender:'Male',   pan:'HIJPG1234H', aadhaar:'234567890108' },
    { empId:'EMP-009', mobile:'9876543209', dob:'1993-12-05', gender:'Female', pan:'IJKPR5678I', aadhaar:'234567890109' },
    { empId:'EMP-010', mobile:'9876543210', dob:'1991-08-20', gender:'Male',   pan:'JKLPS9012J', aadhaar:'234567890110' },
    { empId:'EMP-011', mobile:'9876543211', dob:'1995-05-12', gender:'Female', pan:'KLMPD3456K', aadhaar:'234567890111' },
    { empId:'EMP-012', mobile:'9876543212', dob:'1994-10-28', gender:'Male',   pan:'LMNPV7890L', aadhaar:'234567890112' },
    { empId:'EMP-013', mobile:'9876543213', dob:'1993-07-03', gender:'Female', pan:'MNOPN2345M', aadhaar:'234567890113' },
    { empId:'EMP-014', mobile:'9876543214', dob:'1989-03-16', gender:'Male',   pan:'NOPPS6789N', aadhaar:'234567890114' },
    { empId:'EMP-015', mobile:'9876543215', dob:'1992-11-22', gender:'Female', pan:'OPQPR1234O', aadhaar:'234567890115' },
    { empId:'EMP-016', mobile:'9876543216', dob:'1993-01-09', gender:'Male',   pan:'PQRPJ5678P', aadhaar:'234567890116' },
    { empId:'EMP-017', mobile:'9876543217', dob:'1996-06-30', gender:'Female', pan:'QRSPN9012Q', aadhaar:'234567890117' },
    { empId:'EMP-018', mobile:'9876543218', dob:'1994-04-14', gender:'Male',   pan:'RSTPS3456R', aadhaar:'234567890118' },
    { empId:'EMP-019', mobile:'9876543219', dob:'1995-09-07', gender:'Female', pan:'STUPP7890S', aadhaar:'234567890119' },
    { empId:'EMP-020', mobile:'9876543220', dob:'1991-12-25', gender:'Male',   pan:'TUVPD2345T', aadhaar:'234567890120' },
  ]
  for (const p of personalData) {
    await pool.query(`
      UPDATE users SET mobile_number=$1, date_of_birth=$2, gender=$3, pan_number=$4, aadhaar_number=$5
      WHERE emp_id=$6 AND (mobile_number IS NULL OR date_of_birth IS NULL)
    `, [p.mobile, p.dob, p.gender, p.pan, p.aadhaar, p.empId])
  }
  console.log('   ✓ Personal data (mobile, DOB, gender, PAN, Aadhaar) set for all 20 users')

  // 3. Create uploads directory
  const uploadsDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive:true })
  console.log('\n3. Created uploads directory')

  // 4. Set passwords + create wallets (only for seed users that exist)
  console.log('\n4. Setting passwords + creating wallets...')
  for (const u of USERS) {
    const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [u.email])
    if (rows.length) {
      const hash = await bcrypt.hash(u.password, 10)
      await pool.query('UPDATE users SET password_hash=$1 WHERE email=$2', [hash, u.email])
      await pool.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [rows[0].id])
      console.log(`   ✓ ${u.email.padEnd(28)} role: ${u.role.padEnd(14)} pwd: ${u.password}`)
    } else if (!tablesExist || forceReset) {
      // Seed users only exist after fresh schema — skip if they don't exist in an existing DB
      console.log(`   ⚠ ${u.email.padEnd(28)} not found (skipped)`)
    }
  }

  // 5. Insert sample data (ON CONFLICT DO NOTHING — safe to re-run)
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

    if (deepa.length) await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO1',$1,'Deepa Krishnan','Request Approver','approved','Valid trip') ON CONFLICT DO NOTHING`, [deepa[0].id])
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

    if (deepa.length) await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO2',$1,'Deepa Krishnan','Request Approver','approved','Approved for sprint review') ON CONFLICT DO NOTHING`, [deepa[0].id])
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

  // ── Sample admin bookings — populates the AdminBookingsView page ──
  // Booked by Meena (Booking Admin) on behalf of Arjun & Priya. Idempotent:
  // gated by AH-DEMO-FLIGHT presence, so re-running setup never duplicates.
  // txn_id is left NULL so we don't disturb existing wallet balances via the
  // wallet_transactions trigger; the page doesn't show transaction info anyway.
  const todayMinus = (n) => {
    const d = new Date(); d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const { rows: meena } = await pool.query("SELECT id FROM users WHERE email='meena@company.in'")
  if (meena.length && arjun.length && priya.length) {
    const { rows: alreadySeeded } = await pool.query("SELECT 1 FROM travel_requests WHERE id = 'AH-DEMO-FLIGHT'")
    if (!alreadySeeded.length) {
      const { rows: priyaWallet } = await pool.query('SELECT id FROM wallets WHERE user_id=$1', [priya[0].id])
      const { rows: arjunWallet } = await pool.query('SELECT id FROM wallets WHERE user_id=$1', [arjun[0].id])
      const meenaId = meena[0].id

      const samples = [
        { reqId:'AH-DEMO-FLIGHT', forUserId: priya[0].id, forName: 'Priya Nair', forRole: 'Employee', dept: 'QA',
          walletId: priyaWallet[0]?.id, mode: 'Flight', category: 'travel',
          from: 'Mumbai', to: 'Delhi', daysAgo: 5, amount: 8500,
          pnr: 'PNR-DEMOFL', ref: 'BK-DEMOFL', passenger: 'Priya Nair' },
        { reqId:'AH-DEMO-HOTEL', forUserId: arjun[0].id, forName: 'Arjun Sharma', forRole: 'Employee', dept: 'Engineering',
          walletId: arjunWallet[0]?.id, mode: 'Hotel', category: 'hotel',
          from: 'Bangalore', to: 'Hilton Bangalore', daysAgo: 3, amount: 9000,
          pnr: 'PNR-DEMOHT', ref: 'BK-DEMOHT', passenger: 'Arjun Sharma',
          checkIn: 3, checkOut: 0 },
        { reqId:'AH-DEMO-CAB', forUserId: priya[0].id, forName: 'Priya Nair', forRole: 'Employee', dept: 'QA',
          walletId: priyaWallet[0]?.id, mode: 'Cab', category: 'travel',
          from: 'Mumbai Office', to: 'Mumbai Airport', daysAgo: 5, amount: 650,
          pnr: 'PNR-DEMOCB', ref: 'BK-DEMOCB', passenger: 'Priya Nair' },
        { reqId:'AH-DEMO-TRAIN', forUserId: arjun[0].id, forName: 'Arjun Sharma', forRole: 'Employee', dept: 'Engineering',
          walletId: arjunWallet[0]?.id, mode: 'Train', category: 'travel',
          from: 'Chennai', to: 'Bangalore', daysAgo: 7, amount: 1200,
          pnr: 'PNR-DEMOTR', ref: 'BK-DEMOTR', passenger: 'Arjun Sharma' },
      ]

      for (const s of samples) {
        if (!s.walletId) continue

        const isHotel    = s.mode === 'Hotel'
        const startMinus = s.daysAgo
        const endMinus   = Math.max(s.daysAgo - 2, 0)
        const checkIn    = isHotel ? s.checkIn  : null
        const checkOut   = isHotel ? s.checkOut : null

        await pool.query(`
          INSERT INTO travel_requests (
            id, user_id, user_name, user_role, department,
            from_location, to_location, travel_mode, booking_type,
            start_date, end_date, purpose,
            estimated_travel_cost, estimated_total, approved_total,
            status, booking_status
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8::travel_mode_enum, 'company',
            CURRENT_DATE - $9::int, CURRENT_DATE - $10::int, 'Ad-Hoc Admin Booking',
            $11, $11, $11,
            'approved', 'booked'
          ) ON CONFLICT (id) DO NOTHING
        `, [s.reqId, s.forUserId, s.forName, s.forRole, s.dept,
            s.from, s.to, s.mode, startMinus, endMinus, s.amount])

        await pool.query(`
          INSERT INTO bookings (
            request_id, wallet_id, booked_by_id, booked_for_id,
            booking_type, category, travel_mode,
            from_location, to_location, travel_date,
            check_in_date, check_out_date,
            amount, pnr_number, booking_ref, status, created_at
          ) VALUES (
            $1, $2, $3, $4,
            'company', $5::txn_category_enum, $6::travel_mode_enum,
            $7, $8,
            $9::date,
            $10::date, $11::date,
            $12, $13, $14, 'booked',
            NOW() - ($15 || ' days')::interval
          )
          ON CONFLICT DO NOTHING
        `, [s.reqId, s.walletId, meenaId, s.forUserId,
            s.category, s.mode, s.from, s.to,
            isHotel ? null : todayMinus(startMinus),
            checkIn  != null ? todayMinus(checkIn)  : null,
            checkOut != null ? todayMinus(checkOut) : null,
            s.amount, s.pnr, s.ref, startMinus])

        const { rows: bookingRow } = await pool.query(
          'SELECT id FROM bookings WHERE pnr_number=$1 LIMIT 1', [s.pnr]
        )
        if (bookingRow.length) {
          await pool.query(`
            INSERT INTO tickets (
              booking_id, user_id, request_id,
              pnr_number, booking_ref, ticket_type, travel_mode,
              passenger_name, from_location, to_location,
              travel_date, amount, ticket_data
            ) VALUES (
              $1, $2, $3,
              $4, $5, $6, $7,
              $8, $9, $10,
              $11::date, $12,
              $13::jsonb
            ) ON CONFLICT (pnr_number) DO NOTHING
          `, [bookingRow[0].id, s.forUserId, s.reqId,
              s.pnr, s.ref,
              isHotel ? 'hotel' : 'transport', s.mode,
              s.passenger, s.from, s.to,
              todayMinus(startMinus), s.amount,
              JSON.stringify({ passenger: s.passenger, delivered_via: ['email','sms','in-app'] })])
        }
      }
      console.log('   ✓ Sample admin bookings — Flight / Hotel / Cab / Train (Booking History page)')
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. COMPREHENSIVE DEMO DATA — covers every screen for every role
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n6. Inserting comprehensive demo data...')

  const { rows: adminUser } = await pool.query("SELECT id FROM users WHERE email='admin@company.in'")
  const { rows: sanjay }  = await pool.query("SELECT id FROM users WHERE email='sanjay@company.in'")
  const { rows: kavitha } = await pool.query("SELECT id FROM users WHERE email='kavitha@company.in'")
  const { rows: vikram }  = await pool.query("SELECT id FROM users WHERE email='vikram@company.in'")
  const { rows: anjali }  = await pool.query("SELECT id FROM users WHERE email='anjali@company.in'")
  const { rows: rahul }   = await pool.query("SELECT id FROM users WHERE email='rahul@company.in'")
  const { rows: suresh }  = await pool.query("SELECT id FROM users WHERE email='suresh@company.in'")
  const { rows: nisha }   = await pool.query("SELECT id FROM users WHERE email='nisha@company.in'")
  const { rows: lakshmi } = await pool.query("SELECT id FROM users WHERE email='lakshmi@company.in'")
  const { rows: amit }    = await pool.query("SELECT id FROM users WHERE email='amit@company.in'")
  const { rows: divya }   = await pool.query("SELECT id FROM users WHERE email='divya@company.in'")
  const { rows: karthik } = await pool.query("SELECT id FROM users WHERE email='karthik@company.in'")
  const { rows: pooja }   = await pool.query("SELECT id FROM users WHERE email='pooja@company.in'")
  const { rows: mohan }   = await pool.query("SELECT id FROM users WHERE email='mohan@company.in'")

  // ── 6a. Employee Approver Chain ──────────────────────────────────────────
  if (arjun.length && priya.length && deepa.length && ravi.length && anil.length) {
    const approverChains = [
      // Employees → Tech Lead (Deepa) → Manager (Ravi)
      { userId: arjun[0].id, steps: [{ desig:'Tech Lead', order:1, primary: deepa[0].id }, { desig:'Manager', order:2, primary: ravi[0].id }] },
      { userId: priya[0].id, steps: [{ desig:'Tech Lead', order:1, primary: deepa[0].id }, { desig:'Manager', order:2, primary: ravi[0].id }] },
      // Deepa (TL) → Manager (Ravi)
      { userId: deepa[0].id, steps: [{ desig:'Manager', order:1, primary: ravi[0].id }] },
    ]
    // All Software Engineers → Tech Lead (Deepa) → Manager (Ravi)
    const seEmployees = [sanjay, kavitha, vikram, anjali, rahul, nisha, lakshmi, amit, divya, karthik, pooja, mohan]
    for (const emp of seEmployees) {
      if (emp.length) {
        approverChains.push({ userId: emp[0].id, steps: [
          { desig:'Tech Lead', order:1, primary: deepa[0].id },
          { desig:'Manager', order:2, primary: ravi[0].id }
        ]})
      }
    }
    // Suresh (TL) → Manager (Ravi)
    if (suresh.length) {
      approverChains.push({ userId: suresh[0].id, steps: [{ desig:'Manager', order:1, primary: ravi[0].id }] })
    }
    // Ravi (Manager) → Finance (Anil)
    approverChains.push({ userId: ravi[0].id, steps: [{ desig:'Finance', order:1, primary: anil[0].id }] })
    // Anil (Finance) → Finance (self-tier, uses Manager as approver)
    approverChains.push({ userId: anil[0].id, steps: [{ desig:'Finance', order:1, primary: ravi[0].id }] })
    // Meena (Booking Admin) → Manager (Ravi) → Finance (Anil)
    if (meena.length) {
      approverChains.push({ userId: meena[0].id, steps: [
        { desig:'Manager', order:1, primary: ravi[0].id },
        { desig:'Finance', order:2, primary: anil[0].id }
      ]})
    }
    // Super Admin → Manager (Ravi) → Finance (Anil)
    if (adminUser.length) {
      approverChains.push({ userId: adminUser[0].id, steps: [
        { desig:'Manager', order:1, primary: ravi[0].id },
        { desig:'Finance', order:2, primary: anil[0].id }
      ]})
    }

    for (const chain of approverChains) {
      for (const step of chain.steps) {
        await pool.query(`INSERT INTO employee_approvers (user_id, step_designation, step_order, primary_user_id)
          VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, step_designation) DO NOTHING`,
          [chain.userId, step.desig, step.order, step.primary])
      }
    }
    console.log('   ✓ Employee approver chains configured for all employees')
  }

  // ── 6b. Travel Requests in ALL statuses ──────────────────────────────────

  // Helper to insert a travel request
  async function insertRequest(id, userId, userName, userRole, dept, from, to, distType, mode, bookType, startOff, endOff, purpose, estTravel, estHotel, estTotal, status, extraFields = {}) {
    const fields = ['id','user_id','user_name','user_role','department','from_location','to_location','distance_type','travel_mode','booking_type','start_date','end_date','purpose','estimated_travel_cost','estimated_hotel_cost','estimated_total','status','booking_status']
    const vals = [id, userId, userName, userRole, dept, from, to, distType, mode, bookType, null, null, purpose, estTravel, estHotel, estTotal, status, extraFields.booking_status || 'pending']
    let paramIdx = fields.length + 1
    const extras = []

    if (extraFields.approved_travel_cost !== undefined) {
      fields.push('approved_travel_cost','approved_hotel_cost','approved_allowance','approved_total')
      vals.push(extraFields.approved_travel_cost, extraFields.approved_hotel_cost, extraFields.approved_allowance, extraFields.approved_total)
    }
    if (extraFields.hierarchy_approved) {
      fields.push('hierarchy_approved','hierarchy_approved_by','hierarchy_approved_at')
      vals.push(true, extraFields.hierarchy_approved_by, null)
    }
    if (extraFields.finance_approved) {
      fields.push('finance_approved','finance_approved_by','finance_approved_at')
      vals.push(true, extraFields.finance_approved_by, null)
    }
    if (extraFields.wallet_credited) {
      fields.push('wallet_credited','wallet_credit_amount','wallet_credited_at')
      vals.push(true, extraFields.wallet_credit_amount, null)
    }
    if (extraFields.rejected_by) {
      fields.push('rejected_by','rejection_reason')
      vals.push(extraFields.rejected_by, extraFields.rejection_reason)
    }

    const placeholders = fields.map((f, i) => {
      if (f === 'start_date') return `CURRENT_DATE + ${startOff}`
      if (f === 'end_date') return `CURRENT_DATE + ${endOff}`
      if (f === 'hierarchy_approved_at') return `NOW() - INTERVAL '${extraFields.hier_days_ago || 2} days'`
      if (f === 'finance_approved_at') return `NOW() - INTERVAL '${extraFields.fin_days_ago || 1} days'`
      if (f === 'wallet_credited_at') return `NOW() - INTERVAL '${extraFields.fin_days_ago || 1} days'`
      return `$${vals.indexOf(vals[i]) + 1}`
    })
    // Rebuild placeholders with proper $N indices
    let idx = 0
    const paramVals = []
    const ph = fields.map((f) => {
      if (f === 'start_date') return `CURRENT_DATE + ${startOff}`
      if (f === 'end_date') return `CURRENT_DATE + ${endOff}`
      if (f === 'hierarchy_approved_at') return `NOW() - INTERVAL '${extraFields.hier_days_ago || 2} days'`
      if (f === 'finance_approved_at') return `NOW() - INTERVAL '${extraFields.fin_days_ago || 1} days'`
      if (f === 'wallet_credited_at') return `NOW() - INTERVAL '${extraFields.fin_days_ago || 1} days'`
      idx++
      paramVals.push(vals[fields.indexOf(f)])
      return `$${idx}`
    })

    await pool.query(`INSERT INTO travel_requests (${fields.join(',')}) VALUES (${ph.join(',')}) ON CONFLICT (id) DO NOTHING`, paramVals)
  }

  // --- ARJUN: 6 requests (draft, pending, approved x2, rejected, cancelled) ---
  if (arjun.length) {
    // TR-DEMO4: Draft
    await insertRequest('TR-DEMO4', arjun[0].id, 'Arjun Sharma', 'Employee', 'Engineering',
      'Chennai','Coimbatore','short','Train','self', 30, 32, 'Team offsite planning', 1200, 2000, 4200, 'draft')

    // TR-DEMO5: Rejected
    await insertRequest('TR-DEMO5', arjun[0].id, 'Arjun Sharma', 'Employee', 'Engineering',
      'Chennai','Hyderabad','long','Bus','self', 15, 17, 'Vendor meeting', 2500, 4000, 8000, 'rejected',
      { rejected_by:'Deepa Krishnan', rejection_reason:'Budget not justified for this quarter' })

    // TR-DEMO6: Cancelled
    await insertRequest('TR-DEMO6', arjun[0].id, 'Arjun Sharma', 'Employee', 'Engineering',
      'Chennai','Mumbai','long','Flight','self', 25, 28, 'Cancelled conference', 8500, 12000, 24500, 'cancelled')

    // TR-DEMO17: Approved company booking (for Booking Admin queue)
    await insertRequest('TR-DEMO17', arjun[0].id, 'Arjun Sharma', 'Employee', 'Engineering',
      'Chennai','Bangalore','short','Train','company', 6, 8, 'Product demo at client', 1800, 2500, 5500, 'approved',
      { approved_travel_cost:1800, approved_hotel_cost:2500, approved_allowance:1200, approved_total:5500,
        hierarchy_approved:true, hierarchy_approved_by:'Deepa Krishnan', hier_days_ago:1,
        finance_approved:true, finance_approved_by:'Anil Menon', fin_days_ago:0.25,
        wallet_credited:true, wallet_credit_amount:5500 })

    console.log('   ✓ TR-DEMO4/5/6/17 — Arjun — draft/rejected/cancelled/approved-company')
  }

  // --- PRIYA: 4 requests (draft, pending, pending_finance, rejected) ---
  if (priya.length) {
    await insertRequest('TR-DEMO7', priya[0].id, 'Priya Nair', 'Employee', 'QA',
      'Chennai','Bangalore','short','Train','self', 8, 10, 'QA workshop', 1500, 2500, 5500, 'pending')

    await insertRequest('TR-DEMO8', priya[0].id, 'Priya Nair', 'Employee', 'QA',
      'Chennai','Delhi','long','Flight','company', 18, 21, 'Annual review', 9000, 15000, 28000, 'pending_finance',
      { hierarchy_approved:true, hierarchy_approved_by:'Deepa Krishnan', hier_days_ago:2 })

    await insertRequest('TR-DEMO9', priya[0].id, 'Priya Nair', 'Employee', 'QA',
      'Chennai','Hyderabad','long','Bus','self', 12, 14, 'Client visit postponed', 2200, 3500, 7200, 'rejected',
      { rejected_by:'Deepa Krishnan', rejection_reason:'Client visit postponed indefinitely' })

    await insertRequest('TR-DEMO10', priya[0].id, 'Priya Nair', 'Employee', 'QA',
      'Chennai','Coimbatore','short','Train','self', 35, 37, 'Sprint retrospective', 1100, 1800, 3800, 'draft')

    console.log('   ✓ TR-DEMO7/8/9/10 — Priya — pending/pending_finance/rejected/draft')
  }

  // --- DEEPA: 2 requests (approved+wallet, pending) ---
  if (deepa.length) {
    await insertRequest('TR-DEMO11', deepa[0].id, 'Deepa Krishnan', 'Request Approver', 'Engineering',
      'Chennai','Mumbai','long','Flight','self', 3, 6, 'Tech conference', 8000, 10000, 21000, 'approved',
      { approved_travel_cost:8000, approved_hotel_cost:10000, approved_allowance:3000, approved_total:21000,
        hierarchy_approved:true, hierarchy_approved_by:'Ravi Kumar', hier_days_ago:3,
        finance_approved:true, finance_approved_by:'Anil Menon', fin_days_ago:2,
        wallet_credited:true, wallet_credit_amount:21000 })

    await insertRequest('TR-DEMO12', deepa[0].id, 'Deepa Krishnan', 'Request Approver', 'Engineering',
      'Chennai','Bangalore','short','Train','self', 14, 15, 'Code review session', 1500, 2500, 5000, 'pending')

    console.log('   ✓ TR-DEMO11/12 — Deepa — approved+wallet/pending')
  }

  // --- RAVI: 2 requests (approved+wallet, pending_finance) ---
  if (ravi.length) {
    await insertRequest('TR-DEMO13', ravi[0].id, 'Ravi Kumar', 'Request Approver', 'Operations',
      'Chennai','Delhi','long','Flight','company', 7, 10, 'Board presentation', 9500, 12000, 26000, 'approved',
      { approved_travel_cost:9500, approved_hotel_cost:12000, approved_allowance:4500, approved_total:26000,
        hierarchy_approved:true, hierarchy_approved_by:'Ravi Kumar', hier_days_ago:4,
        finance_approved:true, finance_approved_by:'Anil Menon', fin_days_ago:3,
        wallet_credited:true, wallet_credit_amount:26000 })

    await insertRequest('TR-DEMO14', ravi[0].id, 'Ravi Kumar', 'Request Approver', 'Operations',
      'Chennai','Hyderabad','long','Train','self', 20, 22, 'Operations audit', 3000, 5000, 10500, 'pending_finance',
      { hierarchy_approved:true, hierarchy_approved_by:'Ravi Kumar', hier_days_ago:1 })

    console.log('   ✓ TR-DEMO13/14 — Ravi — approved+wallet/pending_finance')
  }

  // --- ANIL: 2 requests (approved+wallet, pending) ---
  if (anil.length) {
    await insertRequest('TR-DEMO15', anil[0].id, 'Anil Menon', 'Finance', 'Finance',
      'Chennai','Bangalore','short','Train','self', 4, 6, 'Finance summit', 2000, 3000, 6500, 'approved',
      { approved_travel_cost:2000, approved_hotel_cost:3000, approved_allowance:1500, approved_total:6500,
        hierarchy_approved:true, hierarchy_approved_by:'Deepa Krishnan', hier_days_ago:5,
        finance_approved:true, finance_approved_by:'Anil Menon', fin_days_ago:4,
        wallet_credited:true, wallet_credit_amount:6500 })

    await insertRequest('TR-DEMO16', anil[0].id, 'Anil Menon', 'Finance', 'Finance',
      'Chennai','Mumbai','long','Flight','company', 22, 25, 'Budget review', 8200, 11000, 23200, 'pending')

    console.log('   ✓ TR-DEMO15/16 — Anil — approved+wallet/pending')
  }

  // --- SANJAY, KAVITHA, VIKRAM: extra employee requests for richer queues ---
  if (sanjay.length) {
    await insertRequest('TR-DEMO18', sanjay[0].id, 'Sanjay Gupta', 'Employee', 'Engineering',
      'Chennai','Pune','long','Flight','company', 9, 12, 'Client onboarding', 7500, 9000, 20000, 'pending')
    await insertRequest('TR-DEMO19', sanjay[0].id, 'Sanjay Gupta', 'Employee', 'Engineering',
      'Chennai','Bangalore','short','Train','self', 5, 7, 'Hackathon', 1800, 3000, 6300, 'approved',
      { approved_travel_cost:1800, approved_hotel_cost:3000, approved_allowance:1500, approved_total:6300,
        hierarchy_approved:true, hierarchy_approved_by:'Deepa Krishnan', hier_days_ago:3,
        finance_approved:true, finance_approved_by:'Anil Menon', fin_days_ago:2,
        wallet_credited:true, wallet_credit_amount:6300 })
    console.log('   ✓ TR-DEMO18/19 — Sanjay — pending/approved+wallet')
  }

  if (kavitha.length) {
    await insertRequest('TR-DEMO20', kavitha[0].id, 'Kavitha Rajan', 'Employee', 'QA',
      'Chennai','Mumbai','long','Flight','company', 11, 14, 'Test strategy workshop', 8000, 10000, 22000, 'pending_finance',
      { hierarchy_approved:true, hierarchy_approved_by:'Deepa Krishnan', hier_days_ago:1 })
    await insertRequest('TR-DEMO21', kavitha[0].id, 'Kavitha Rajan', 'Employee', 'QA',
      'Chennai','Coimbatore','short','Train','self', 28, 30, 'Regression testing sprint', 1200, 2000, 4200, 'draft')
    console.log('   ✓ TR-DEMO20/21 — Kavitha — pending_finance/draft')
  }

  if (vikram.length) {
    await insertRequest('TR-DEMO22', vikram[0].id, 'Vikram Singh', 'Employee', 'Engineering',
      'Chennai','Delhi','long','Flight','self', 16, 19, 'Architecture summit', 9000, 14000, 27000, 'pending')
    console.log('   ✓ TR-DEMO22 — Vikram — pending')
  }

  if (anjali.length) {
    await insertRequest('TR-DEMO23', anjali[0].id, 'Anjali Desai', 'Employee', 'Design',
      'Chennai','Bangalore','short','Train','self', 10, 12, 'Design sprint', 1500, 2500, 5000, 'approved',
      { approved_travel_cost:1500, approved_hotel_cost:2500, approved_allowance:1000, approved_total:5000,
        hierarchy_approved:true, hierarchy_approved_by:'Ravi Kumar', hier_days_ago:4,
        finance_approved:true, finance_approved_by:'Anil Menon', fin_days_ago:3,
        wallet_credited:true, wallet_credit_amount:5000, booking_status:'pending' })
    console.log('   ✓ TR-DEMO23 — Anjali — approved+wallet (company booking queue)')
  }

  if (rahul.length) {
    await insertRequest('TR-DEMO24', rahul[0].id, 'Rahul Verma', 'Employee', 'Engineering',
      'Chennai','Hyderabad','long','Bus','self', 13, 15, 'Vendor audit', 2000, 3500, 7000, 'rejected',
      { rejected_by:'Deepa Krishnan', rejection_reason:'Travel not required — can be done remotely' })
    console.log('   ✓ TR-DEMO24 — Rahul — rejected')
  }

  // ── 6c. Approval Records ────────────────────────────────────────────────
  // Rejected requests
  if (deepa.length) {
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO5',$1,'Deepa Krishnan','Request Approver','rejected','Budget not justified for this quarter') ON CONFLICT DO NOTHING`, [deepa[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO9',$1,'Deepa Krishnan','Request Approver','rejected','Client visit postponed indefinitely') ON CONFLICT DO NOTHING`, [deepa[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO24',$1,'Deepa Krishnan','Request Approver','rejected','Travel not required — can be done remotely') ON CONFLICT DO NOTHING`, [deepa[0].id])
  }
  // Pending_finance (hierarchy approved)
  if (deepa.length) {
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO8',$1,'Deepa Krishnan','Request Approver','approved','Travel justified — annual review') ON CONFLICT DO NOTHING`, [deepa[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO20',$1,'Deepa Krishnan','Request Approver','approved','Test strategy — approved') ON CONFLICT DO NOTHING`, [deepa[0].id])
  }
  // Approved requests — hierarchy + finance
  if (ravi.length && anil.length) {
    // TR-DEMO11 (Deepa → Ravi approves hierarchy, Anil approves finance)
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO11',$1,'Ravi Kumar','Request Approver','approved','Approved — valuable conference') ON CONFLICT DO NOTHING`, [ravi[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO11',$1,'Anil Menon','Finance','approved','Finance approved',8000,10000,3000) ON CONFLICT DO NOTHING`, [anil[0].id])
    // TR-DEMO13 (Ravi — self-hierarchy, Anil finance)
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO13',$1,'Anil Menon','Finance','approved','Board trip — finance approved',9500,12000,4500) ON CONFLICT DO NOTHING`, [anil[0].id])
  }
  if (deepa.length && anil.length) {
    // TR-DEMO15 (Anil — Deepa hierarchy, self finance)
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO15',$1,'Deepa Krishnan','Request Approver','approved','Finance summit — approved') ON CONFLICT DO NOTHING`, [deepa[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO15',$1,'Anil Menon','Finance','approved','Self-approved finance trip',2000,3000,1500) ON CONFLICT DO NOTHING`, [anil[0].id])
    // TR-DEMO17 (Arjun — Deepa hierarchy, Anil finance)
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO17',$1,'Deepa Krishnan','Request Approver','approved','Client demo — approved') ON CONFLICT DO NOTHING`, [deepa[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO17',$1,'Anil Menon','Finance','approved','Budget cleared',1800,2500,1200) ON CONFLICT DO NOTHING`, [anil[0].id])
    // TR-DEMO19 (Sanjay — Deepa hierarchy, Anil finance)
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO19',$1,'Deepa Krishnan','Request Approver','approved','Hackathon — great initiative') ON CONFLICT DO NOTHING`, [deepa[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO19',$1,'Anil Menon','Finance','approved','Approved',1800,3000,1500) ON CONFLICT DO NOTHING`, [anil[0].id])
  }
  if (ravi.length && anil.length) {
    // TR-DEMO23 (Anjali — Ravi hierarchy, Anil finance)
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note) VALUES ('TR-DEMO23',$1,'Ravi Kumar','Request Approver','approved','Design sprint — approved') ON CONFLICT DO NOTHING`, [ravi[0].id])
    await pool.query(`INSERT INTO approvals (request_id,approver_id,approver_name,approver_role,action,note,approved_travel_cost,approved_hotel_cost,approved_allowance) VALUES ('TR-DEMO23',$1,'Anil Menon','Finance','approved','Budget ok',1500,2500,1000) ON CONFLICT DO NOTHING`, [anil[0].id])
  }
  console.log('   ✓ Approval records inserted for all approved/rejected/pending_finance requests')

  // ── 6d. Wallet Credits for approved requests ─────────────────────────────
  async function creditWallet(userId, requestId, travel, hotel, allowance) {
    const { rows: w } = await pool.query('SELECT id,balance FROM wallets WHERE user_id=$1', [userId])
    if (!w.length) return
    const b = Number(w[0].balance)
    await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,$3,'credit','travel',$4,$5,$6) ON CONFLICT DO NOTHING`,
      [w[0].id, userId, requestId, travel, `Travel cost — ${requestId}`, b + travel])
    await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,$3,'credit','hotel',$4,$5,$6) ON CONFLICT DO NOTHING`,
      [w[0].id, userId, requestId, hotel, `Hotel allowance — ${requestId}`, b + travel + hotel])
    await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after) VALUES ($1,$2,$3,'credit','allowance',$4,$5,$6) ON CONFLICT DO NOTHING`,
      [w[0].id, userId, requestId, allowance, `Daily allowance — ${requestId}`, b + travel + hotel + allowance])
  }

  if (deepa.length) await creditWallet(deepa[0].id, 'TR-DEMO11', 8000, 10000, 3000)
  if (ravi.length)  await creditWallet(ravi[0].id,  'TR-DEMO13', 9500, 12000, 4500)
  if (anil.length)  await creditWallet(anil[0].id,  'TR-DEMO15', 2000, 3000, 1500)
  if (arjun.length) await creditWallet(arjun[0].id, 'TR-DEMO17', 1800, 2500, 1200)
  if (sanjay.length) await creditWallet(sanjay[0].id, 'TR-DEMO19', 1800, 3000, 1500)
  if (anjali.length) await creditWallet(anjali[0].id, 'TR-DEMO23', 1500, 2500, 1000)
  console.log('   ✓ Wallet credits loaded for Deepa/Ravi/Anil/Arjun/Sanjay/Anjali')

  // ── 6e. Self-Booking Records + Debit Transactions + Tickets ──────────────
  async function createSelfBooking(userId, userName, requestId, walletId, mode, from, to, amount, pnr, ref, dateOffset, ticketExtras) {
    const { rows: existing } = await pool.query("SELECT 1 FROM bookings WHERE pnr_number=$1", [pnr])
    if (existing.length) return
    await pool.query(`INSERT INTO bookings (request_id, wallet_id, booked_by_id, booked_for_id, booking_type, category, travel_mode, from_location, to_location, travel_date, amount, pnr_number, booking_ref, status, created_at)
      VALUES ($1,$2,$3,$3,'self','travel',$4,$5,$6,CURRENT_DATE + $7::int,$8,$9,$10,'booked',NOW() - INTERVAL '6 hours')`,
      [requestId, walletId, userId, mode, from, to, dateOffset, amount, pnr, ref])

    // Debit
    const { rows: w } = await pool.query('SELECT id,balance FROM wallets WHERE user_id=$1', [userId])
    if (w.length) {
      const bal = Number(w[0].balance)
      await pool.query(`INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,balance_after)
        VALUES ($1,$2,$3,'debit','travel',$4,$5,$6)`,
        [w[0].id, userId, requestId, amount, `${mode} booking ${from}→${to} — ${pnr}`, bal - amount])
    }

    // Ticket
    const { rows: bk } = await pool.query("SELECT id FROM bookings WHERE pnr_number=$1 LIMIT 1", [pnr])
    if (bk.length) {
      await pool.query(`INSERT INTO tickets (booking_id, user_id, request_id, pnr_number, booking_ref, ticket_type, travel_mode, passenger_name, from_location, to_location, travel_date, seat_class, seat_number, amount, ticket_data)
        VALUES ($1,$2,$3,$4,$5,'transport',$6,$7,$8,$9,CURRENT_DATE + $10::int,$11,$12,$13,$14::jsonb) ON CONFLICT (pnr_number) DO NOTHING`,
        [bk[0].id, userId, requestId, pnr, ref, mode, userName, from, to, dateOffset,
         ticketExtras.class, ticketExtras.seat, amount,
         JSON.stringify({ passenger: userName, ...ticketExtras, delivered_via: ['email','sms','in-app'] })])
    }

    // Update booking_status
    await pool.query("UPDATE travel_requests SET booking_status='booked' WHERE id=$1", [requestId])
  }

  // Arjun: self-booking for TR-DEMO1
  if (arjun.length) {
    const { rows: wA } = await pool.query('SELECT id FROM wallets WHERE user_id=$1', [arjun[0].id])
    if (wA.length) {
      await createSelfBooking(arjun[0].id, 'Arjun Sharma', 'TR-DEMO1', wA[0].id,
        'Train', 'Chennai', 'Bangalore', 1500, 'PNR-SELF01', 'BK-SELF01', 5,
        { class:'2A', seat:'B3-42', coach:'B3' })
      console.log('   ✓ Self-booking — Arjun TR-DEMO1 — Train ₹1,500 + ticket')
    }
  }

  // Deepa: self-booking for TR-DEMO11
  if (deepa.length) {
    const { rows: wD } = await pool.query('SELECT id FROM wallets WHERE user_id=$1', [deepa[0].id])
    if (wD.length) {
      await createSelfBooking(deepa[0].id, 'Deepa Krishnan', 'TR-DEMO11', wD[0].id,
        'Flight', 'Chennai', 'Mumbai', 7200, 'PNR-SELF02', 'BK-SELF02', 3,
        { class:'Economy', airline:'IndiGo', flight:'6E-2045' })
      console.log('   ✓ Self-booking — Deepa TR-DEMO11 — Flight ₹7,200 + ticket')
    }
  }

  // Anil: self-booking for TR-DEMO15
  if (anil.length) {
    const { rows: wAn } = await pool.query('SELECT id FROM wallets WHERE user_id=$1', [anil[0].id])
    if (wAn.length) {
      await createSelfBooking(anil[0].id, 'Anil Menon', 'TR-DEMO15', wAn[0].id,
        'Train', 'Chennai', 'Bangalore', 1800, 'PNR-SELF03', 'BK-SELF03', 4,
        { class:'3A', seat:'C1-18', coach:'C1' })
      console.log('   ✓ Self-booking — Anil TR-DEMO15 — Train ₹1,800 + ticket')
    }
  }

  // Sanjay: self-booking for TR-DEMO19
  if (sanjay.length) {
    const { rows: wS } = await pool.query('SELECT id FROM wallets WHERE user_id=$1', [sanjay[0].id])
    if (wS.length) {
      await createSelfBooking(sanjay[0].id, 'Sanjay Gupta', 'TR-DEMO19', wS[0].id,
        'Train', 'Chennai', 'Bangalore', 1600, 'PNR-SELF04', 'BK-SELF04', 5,
        { class:'SL', seat:'S5-22', coach:'S5' })
      console.log('   ✓ Self-booking — Sanjay TR-DEMO19 — Train ₹1,600 + ticket')
    }
  }

  // ── 6f. Approver Audit Log ───────────────────────────────────────────────
  if (adminUser.length && arjun.length && priya.length && deepa.length && ravi.length) {
    const adm = adminUser[0].id
    await pool.query(`INSERT INTO approver_audit_log (action_type, affected_user_id, step_designation, old_user_id, new_user_id, reason, acted_by, acted_at)
      VALUES ('manual_edit', $1, 'Tech Lead', $2, $3, 'Reassigned TL approver from Ravi to Deepa for Engineering team', $4, NOW() - INTERVAL '10 days')`,
      [arjun[0].id, ravi[0].id, deepa[0].id, adm])
    await pool.query(`INSERT INTO approver_audit_log (action_type, affected_user_id, step_designation, old_user_id, new_user_id, reason, acted_by, acted_at)
      VALUES ('swap_backup', $1, 'Manager', NULL, $2, 'Added backup Manager approver for QA team', $3, NOW() - INTERVAL '7 days')`,
      [priya[0].id, ravi[0].id, adm])
    await pool.query(`INSERT INTO approver_audit_log (action_type, affected_user_id, step_designation, old_user_id, new_user_id, reason, acted_by, acted_at)
      VALUES ('reassign_pending', $1, 'Manager', $1, $2, 'Deepa on leave — pending requests reassigned to Ravi', $3, NOW() - INTERVAL '3 days')`,
      [deepa[0].id, ravi[0].id, adm])
    if (sanjay.length) {
      await pool.query(`INSERT INTO approver_audit_log (action_type, affected_user_id, step_designation, old_user_id, new_user_id, reason, acted_by, acted_at)
        VALUES ('manual_edit', $1, 'Tech Lead', NULL, $2, 'Assigned TL approver for new employee Sanjay', $3, NOW() - INTERVAL '5 days')`,
        [sanjay[0].id, deepa[0].id, adm])
    }
    console.log('   ✓ Approver audit log — 4 entries')
  }

  console.log('   ✓ Comprehensive demo data inserted — all screens populated\n')

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  Setup Complete!                         ║')
  console.log('╚══════════════════════════════════════════╝\n')
  console.log('Login credentials:')
  console.log('─────────────────────────────────────────────')
  console.log('  Employee      arjun@company.in    pass123')
  console.log('  Employee      priya@company.in    pass123')
  console.log('  Employee      sanjay@company.in   pass123')
  console.log('  Employee      kavitha@company.in  pass123')
  console.log('  Employee      vikram@company.in   pass123')
  console.log('  Tech Lead     deepa@company.in    pass123')
  console.log('  TL (DevOps)   suresh@company.in   pass123')
  console.log('  Manager       ravi@company.in     pass123')
  console.log('  Finance       anil@company.in     pass123')
  console.log('  Booking Admin meena@company.in    pass123')
  console.log('  Super Admin   admin@company.in    admin123')
  console.log('\n  + 8 more employees (anjali, rahul, nisha, lakshmi, amit, divya, karthik, pooja, mohan)')
  console.log('\nStart: npm start\n')
  await pool.end()
}

run().catch(e => { console.error('Setup failed:', e.message); console.error(e.stack); process.exit(1) })
