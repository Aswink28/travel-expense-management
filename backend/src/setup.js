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
    console.log('\n2. Running schema (fresh install)...')
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
