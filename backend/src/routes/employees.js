const express  = require('express')
const bcrypt   = require('bcryptjs')
const pool     = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const router   = express.Router()

router.use(authenticate)
router.use(authorise('Super Admin'))

// ── GET /api/employees ───────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.emp_id, u.name, u.email, u.role, u.department,
             u.avatar, u.color, u.reporting_to, u.is_active,
             u.mobile_number, u.date_of_birth, u.gender,
             u.pan_number, u.aadhaar_number,
             u.address_line1, u.address_line2, u.city, u.state, u.pincode,
             u.kyc_type, u.kyc_status,
             u.last_login, u.created_at,
             w.balance AS wallet_balance
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      ORDER BY u.created_at DESC
    `)
    res.json({ success: true, data: rows })
  } catch (e) { next(e) }
})

// ── POST /api/employees ──────────────────────────────────────
router.post('/', async (req, res, next) => {
  const {
    name, email, password, role, department, reporting_to,
    // KYC fields
    mobile_number, date_of_birth, gender, kyc_type,
    pan_number, aadhaar_number,
    address_line1, address_line2, city, state, pincode,
  } = req.body

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, email, password, and role are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
  }
  if (!mobile_number) {
    return res.status(400).json({ success: false, message: 'Mobile number is required' })
  }

  const kycLevel = kyc_type || 'min_kyc'

  // Full KYC requires additional fields
  if (kycLevel === 'full_kyc') {
    if (!date_of_birth) return res.status(400).json({ success: false, message: 'Date of birth is required for Full KYC' })
    if (!gender)        return res.status(400).json({ success: false, message: 'Gender is required for Full KYC' })
    if (!pan_number)    return res.status(400).json({ success: false, message: 'PAN number is required for Full KYC' })
    if (!aadhaar_number) return res.status(400).json({ success: false, message: 'Aadhaar number is required for Full KYC' })
    if (!address_line1 || !city || !state || !pincode) {
      return res.status(400).json({ success: false, message: 'Complete address is required for Full KYC' })
    }
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan_number.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Invalid PAN number format (e.g. ABCDE1234F)' })
    }
    if (!/^\d{12}$/.test(aadhaar_number)) {
      return res.status(400).json({ success: false, message: 'Aadhaar must be 12 digits' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Check duplicate email
    const { rows: existing } = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email])
    if (existing.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ success: false, message: 'Email already exists' })
    }

    // Check duplicate mobile
    const { rows: mobDup } = await client.query('SELECT id FROM users WHERE mobile_number = $1', [mobile_number])
    if (mobDup.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ success: false, message: 'Mobile number already registered' })
    }

    // Generate emp_id
    const { rows: maxEmp } = await client.query(
      `SELECT emp_id FROM users WHERE emp_id LIKE 'EMP-%' ORDER BY LENGTH(emp_id) DESC, emp_id DESC LIMIT 1`
    )
    let nextNum = 1
    if (maxEmp.length && maxEmp[0].emp_id) {
      const match = maxEmp[0].emp_id.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const emp_id = `EMP-${String(nextNum).padStart(3, '0')}`

    // Generate avatar from initials
    const parts = name.trim().split(/\s+/)
    const avatar = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()

    // Fetch role color from roles table
    const { rows: roleRow } = await client.query('SELECT color FROM roles WHERE name = $1', [role])
    const color = roleRow[0]?.color || '#0A84FF'

    const password_hash = await bcrypt.hash(password, 10)

    const { rows: [user] } = await client.query(
      `INSERT INTO users (
        emp_id, name, email, password_hash, role, department, avatar, color, reporting_to,
        mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
        address_line1, address_line2, city, state, pincode,
        kyc_type, kyc_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id, emp_id, name, email, role, department, avatar, color, reporting_to, is_active,
                 mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                 address_line1, address_line2, city, state, pincode, kyc_type, kyc_status, created_at`,
      [
        emp_id, name.trim(), email.trim().toLowerCase(), password_hash, role,
        department || 'Engineering', avatar, color, reporting_to || null,
        mobile_number, date_of_birth || null, gender || null,
        pan_number ? pan_number.toUpperCase() : null,
        aadhaar_number || null,
        address_line1 || null, address_line2 || null,
        city || null, state || null, pincode || null,
        kycLevel, kycLevel === 'full_kyc' ? 'verified' : 'pending',
      ]
    )

    // Create wallet for the new employee
    await client.query(
      `INSERT INTO wallets (user_id, balance, total_credited, total_debited, travel_balance, hotel_balance, allowance_balance)
       VALUES ($1, 0, 0, 0, 0, 0, 0)`,
      [user.id]
    )

    await client.query('COMMIT')
    res.status(201).json({ success: true, message: 'Employee created successfully', data: user })
  } catch (e) {
    await client.query('ROLLBACK')
    if (e.code === '23505') {
      const detail = e.detail || ''
      if (detail.includes('email'))  return res.status(409).json({ success: false, message: 'Email already exists' })
      if (detail.includes('emp_id')) return res.status(409).json({ success: false, message: 'Employee ID conflict — please try again' })
      return res.status(409).json({ success: false, message: 'Duplicate entry: ' + detail })
    }
    next(e)
  } finally {
    client.release()
  }
})

// ── PUT /api/employees/:id ───────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const {
      name, email, role, department, reporting_to, password,
      mobile_number, date_of_birth, gender, kyc_type,
      pan_number, aadhaar_number,
      address_line1, address_line2, city, state, pincode,
    } = req.body
    const { id } = req.params

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE id = $1', [id])
    if (!existing.length) return res.status(404).json({ success: false, message: 'Employee not found' })

    // Check email uniqueness (exclude current user)
    if (email) {
      const { rows: dup } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [email, id])
      if (dup.length) return res.status(409).json({ success: false, message: 'Email already in use' })
    }

    // Check mobile uniqueness
    if (mobile_number) {
      const { rows: mobDup } = await pool.query('SELECT id FROM users WHERE mobile_number = $1 AND id != $2', [mobile_number, id])
      if (mobDup.length) return res.status(409).json({ success: false, message: 'Mobile number already in use' })
    }

    // Build dynamic update
    const sets = []
    const vals = []
    let idx = 1

    if (name)         { sets.push(`name = $${idx++}`);         vals.push(name.trim()) }
    if (email)        { sets.push(`email = $${idx++}`);        vals.push(email.trim().toLowerCase()) }
    if (role)         { sets.push(`role = $${idx++}`);         vals.push(role) }
    if (department !== undefined)   { sets.push(`department = $${idx++}`);    vals.push(department || 'Engineering') }
    if (reporting_to !== undefined) { sets.push(`reporting_to = $${idx++}`);  vals.push(reporting_to || null) }

    // KYC fields
    if (mobile_number !== undefined) { sets.push(`mobile_number = $${idx++}`);  vals.push(mobile_number || null) }
    if (date_of_birth !== undefined) { sets.push(`date_of_birth = $${idx++}`);  vals.push(date_of_birth || null) }
    if (gender !== undefined)        { sets.push(`gender = $${idx++}`);         vals.push(gender || null) }
    if (pan_number !== undefined)    { sets.push(`pan_number = $${idx++}`);     vals.push(pan_number ? pan_number.toUpperCase() : null) }
    if (aadhaar_number !== undefined){ sets.push(`aadhaar_number = $${idx++}`); vals.push(aadhaar_number || null) }
    if (address_line1 !== undefined) { sets.push(`address_line1 = $${idx++}`);  vals.push(address_line1 || null) }
    if (address_line2 !== undefined) { sets.push(`address_line2 = $${idx++}`);  vals.push(address_line2 || null) }
    if (city !== undefined)          { sets.push(`city = $${idx++}`);           vals.push(city || null) }
    if (state !== undefined)         { sets.push(`state = $${idx++}`);          vals.push(state || null) }
    if (pincode !== undefined)       { sets.push(`pincode = $${idx++}`);        vals.push(pincode || null) }
    if (kyc_type)                    { sets.push(`kyc_type = $${idx++}`);       vals.push(kyc_type) }

    if (password) {
      if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
      sets.push(`password_hash = $${idx++}`)
      vals.push(await bcrypt.hash(password, 10))
    }

    // Update avatar if name changed
    if (name) {
      const parts = name.trim().split(/\s+/)
      const avatar = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
      sets.push(`avatar = $${idx++}`); vals.push(avatar)
    }

    // Update color if role changed
    if (role) {
      const { rows: roleRow } = await pool.query('SELECT color FROM roles WHERE name = $1', [role])
      sets.push(`color = $${idx++}`); vals.push(roleRow[0]?.color || '#0A84FF')
    }

    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' })

    vals.push(id)
    const { rows: [user] } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, emp_id, name, email, role, department, avatar, color, reporting_to, is_active,
                 mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                 address_line1, address_line2, city, state, pincode, kyc_type, kyc_status, created_at`,
      vals
    )

    res.json({ success: true, message: 'Employee updated', data: user })
  } catch (e) { next(e) }
})

// ── PATCH /api/employees/:id/status ──────────────────────────
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params
    const { is_active } = req.body

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' })
    }

    const { rows: [user] } = await pool.query(
      `UPDATE users SET is_active = $1 WHERE id = $2
       RETURNING id, emp_id, name, email, role, is_active`,
      [is_active, id]
    )
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' })

    res.json({ success: true, message: `Employee ${user.is_active ? 'activated' : 'deactivated'}`, data: user })
  } catch (e) { next(e) }
})

module.exports = router
