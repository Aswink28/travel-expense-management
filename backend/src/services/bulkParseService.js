const XLSX = require('xlsx')

// Required columns for the bulk-create flow. Mirrors POST /api/employees:
// `designation` is required because the approval flow is derived from it via
// designation_tiers (see services/employeeApproval.js). Drop it and the row
// has no approvers and the request workflow can never run for that user.
const REQUIRED_COLS = [
  'name', 'email', 'password',
  'mobile_number', 'date_of_birth', 'gender',
  'pan_number', 'aadhaar_number',
  'designation',
]
// `tier_id` accepted as an explicit override for when designation→tier mapping isn't desired.
// `reporting_to` is intentionally NOT exposed — the Employee Creation form strips it before
// submitting (EmployeeManagement.jsx:353), so bulk upload omits it for parity.
const OPTIONAL_COLS = ['role', 'department', 'tier_id']
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
    // Normalize date format (Excel dates come through as JS Date objects)
    if (row.date_of_birth instanceof Date) {
      row.date_of_birth = row.date_of_birth.toISOString().slice(0, 10)
    } else if (row.date_of_birth) {
      row.date_of_birth = String(row.date_of_birth).slice(0, 10)
    }

    // Normalize fields
    row.mobile_number  = String(row.mobile_number || '').replace(/\D/g, '')
    row.aadhaar_number = String(row.aadhaar_number || '').replace(/\D/g, '')
    row.pan_number     = String(row.pan_number || '').toUpperCase()
    row.gender         = String(row.gender || '').charAt(0).toUpperCase() + String(row.gender || '').slice(1).toLowerCase()
    row.email          = String(row.email || '').toLowerCase()
    row.designation    = String(row.designation || '').trim()
    if (!row.role)       row.role       = 'Employee'
    if (!row.department) row.department = 'Engineering'

    // Idempotency key = email (globally unique). Re-uploading the same email is a no-op.
    row._idempotencyKey = `emp:${row.email}`

    const errs = validateRow(row)
    const rowNum = i + 2 // Excel row (1 header + 1-indexed)

    if (errs.length) {
      invalidRows.push({ rowNumber: rowNum, data: row, errors: errs })
    } else {
      validRows.push({ rowNumber: rowNum, data: row })
    }
  })

  return { validRows, invalidRows, totalRows: normalized.length }
}

// Returns an array of { field, message }. Joining with `; ` gives a flat error string,
// but the structured form lets the UI render row + field + reason cleanly.
function validateRow(row) {
  const errs = []
  const add = (field, message) => errs.push({ field, message })

  if (!row.name)  add('name', 'Name is required')

  if (!row.email) add('email', 'Email is required')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) add('email', 'Invalid email format')

  if (!row.password) add('password', 'Password is required')
  else if (String(row.password).length < 6) add('password', 'Password must be at least 6 characters')

  const mob = String(row.mobile_number).replace(/\D/g, '')
  if (!mob) add('mobile_number', 'Mobile number is required')
  else if (!/^\d{10}$/.test(mob)) add('mobile_number', 'Mobile must be 10 digits')

  if (!row.date_of_birth) add('date_of_birth', 'Date of birth is required')

  const g = String(row.gender || '').toLowerCase()
  if (!g) add('gender', 'Gender is required')
  else if (!['male', 'female', 'other'].includes(g)) add('gender', 'Gender must be Male, Female, or Other')

  const pan = String(row.pan_number || '').toUpperCase()
  if (!pan) add('pan_number', 'PAN number is required')
  else if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) add('pan_number', 'Invalid PAN format (e.g. ABCDE1234F)')

  const aad = String(row.aadhaar_number || '').replace(/\D/g, '')
  if (!aad) add('aadhaar_number', 'Aadhaar number is required')
  else if (!/^\d{12}$/.test(aad)) add('aadhaar_number', 'Aadhaar must be 12 digits')

  if (!row.designation) add('designation', 'Designation is required')

  return errs
}

// Convert structured errors → a single string for storage in bulk_job_rows.error_message.
// Format: `[field] message; [field2] message2`. The UI parses `[…]` to highlight the field.
function formatErrors(errs) {
  if (!Array.isArray(errs) || !errs.length) return null
  return errs.map(e => (e && e.field ? `[${e.field}] ${e.message}` : String(e))).join('; ')
}

module.exports = { parseFile, formatErrors, REQUIRED_COLS, OPTIONAL_COLS }
