const XLSX = require('xlsx')
const crypto = require('crypto')

const REQUIRED_COLS = ['name', 'email', 'password', 'mobile_number', 'date_of_birth', 'gender', 'pan_number', 'aadhaar_number']
const OPTIONAL_COLS = ['role', 'department', 'reporting_to']
const MAX_ROWS = 25000

function parseFile(buffer, fileName) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Excel file has no sheets')

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!rows.length) throw new Error('File is empty — no data rows found')
  if (rows.length > MAX_ROWS) throw new Error(`File has ${rows.length} rows. Maximum allowed is ${MAX_ROWS}`)

  // Normalize column headers (trim, lowercase, underscored)
  const normalized = rows.map(row => {
    const out = {}
    for (const [key, val] of Object.entries(row)) {
      const k = key.trim().toLowerCase().replace(/\s+/g, '_')
      out[k] = typeof val === 'string' ? val.trim() : val
    }
    return out
  })

  // Validate required columns exist
  const cols = Object.keys(normalized[0] || {})
  const missing = REQUIRED_COLS.filter(c => !cols.includes(c))
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(', ')}. Required: ${REQUIRED_COLS.join(', ')}`)
  }

  const validRows = []
  const invalidRows = []

  normalized.forEach((row, i) => {
    const errs = validateRow(row)
    const rowNum = i + 2 // Excel row (1 header + 1-indexed)

    // Normalize date format
    if (row.date_of_birth instanceof Date) {
      row.date_of_birth = row.date_of_birth.toISOString().slice(0, 10)
    } else if (row.date_of_birth) {
      row.date_of_birth = String(row.date_of_birth).slice(0, 10)
    }

    // Normalize fields
    row.mobile_number = String(row.mobile_number).replace(/\D/g, '')
    row.aadhaar_number = String(row.aadhaar_number).replace(/\D/g, '')
    row.pan_number = String(row.pan_number).toUpperCase()
    row.gender = String(row.gender || '').charAt(0).toUpperCase() + String(row.gender || '').slice(1).toLowerCase()
    row.email = String(row.email).toLowerCase()
    if (!row.role) row.role = 'Employee'
    if (!row.department) row.department = 'Engineering'

    // Idempotency key = email (globally unique)
    row._idempotencyKey = `emp:${row.email}`

    if (errs.length) {
      invalidRows.push({ rowNumber: rowNum, data: row, errors: errs })
    } else {
      validRows.push({ rowNumber: rowNum, data: row })
    }
  })

  return { validRows, invalidRows, totalRows: normalized.length }
}

function validateRow(row) {
  const errs = []
  if (!row.name) errs.push('Name is required')
  if (!row.email) errs.push('Email is required')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errs.push('Invalid email format')
  if (!row.password) errs.push('Password is required')
  else if (String(row.password).length < 6) errs.push('Password must be at least 6 characters')

  const mob = String(row.mobile_number).replace(/\D/g, '')
  if (!mob) errs.push('Mobile number is required')
  else if (!/^\d{10}$/.test(mob)) errs.push('Mobile must be 10 digits')

  if (!row.date_of_birth) errs.push('Date of birth is required')

  const g = String(row.gender || '').toLowerCase()
  if (!g) errs.push('Gender is required')
  else if (!['male', 'female', 'other'].includes(g)) errs.push('Gender must be Male, Female, or Other')

  const pan = String(row.pan_number || '').toUpperCase()
  if (!pan) errs.push('PAN number is required')
  else if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) errs.push('Invalid PAN format (e.g. ABCDE1234F)')

  const aad = String(row.aadhaar_number || '').replace(/\D/g, '')
  if (!aad) errs.push('Aadhaar number is required')
  else if (!/^\d{12}$/.test(aad)) errs.push('Aadhaar must be 12 digits')

  return errs
}

module.exports = { parseFile }
