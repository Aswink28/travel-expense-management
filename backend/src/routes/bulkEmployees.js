const express = require('express')
const multer  = require('multer')
const bcrypt  = require('bcryptjs')
const XLSX    = require('xlsx')
const pool    = require('../config/db')
const { authenticate, authorise } = require('../middleware')
const { parseFile, formatErrors } = require('../services/bulkParseService')
const { createPpiWallet } = require('../services/ppiWallet')
const { resolveTierForDesignation, deriveApprovalFromTier } = require('../services/employeeApproval')
const router  = express.Router()

// PPI defaults now come from PPI_PRODUCT_IDS / PPI_PROGRAM_ID in env.
// Per-row override is still possible via the CSV's productId column.
const bulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ── PUBLIC: GET /template ────────────────────────────────────
// Registered BEFORE auth middleware so a plain <a href> download works.
// Template contains only column names + dummy rows — no PII, safe to expose.
router.get('/template', (req, res) => {
  const data = [
    {
      name: 'Rahul Sharma', email: 'rahul@company.in', password: 'Pass@123',
      mobile_number: '9876543210', date_of_birth: '1995-03-15', gender: 'Male',
      pan_number: 'ABCDE1234F', aadhaar_number: '123456789012',
      designation: 'Software Engineer', role: 'Employee', department: 'Engineering', tier_id: '',
    },
    {
      name: 'Priya Nair', email: 'priya@company.in', password: 'Pass@123',
      mobile_number: '9876543211', date_of_birth: '1992-08-22', gender: 'Female',
      pan_number: 'FGHIJ5678K', aadhaar_number: '234567890123',
      designation: 'Manager', role: 'Request Approver', department: 'Design', tier_id: '',
    },
  ]
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 18 }, { wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
    { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 8 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Employees')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=bulk_employee_template.xlsx')
  res.send(buf)
})

router.use(authenticate)
router.use(authorise('Super Admin'))

// ── In-memory job tracker for background processing ──────────
const activeJobs = new Map()

// ── Background processor ─────────────────────────────────────
async function processJob(jobId) {
  const { rows: pendingRows } = await pool.query(
    `SELECT id, row_number, raw_data FROM bulk_job_rows WHERE job_id=$1 AND status='pending' ORDER BY row_number`,
    [jobId]
  )

  await pool.query(`UPDATE bulk_jobs SET status='processing', started_at=NOW() WHERE id=$1`, [jobId])

  for (const row of pendingRows) {
    const data = row.raw_data
    const client = await pool.connect()
    try {
      await client.query(`UPDATE bulk_job_rows SET status='processing', updated_at=NOW() WHERE id=$1`, [row.id])

      // ── Duplicate checks (same as POST /api/employees) ────
      const { rows: dupEmail } = await client.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [data.email])
      if (dupEmail.length) {
        await markRow(client, jobId, row.id, 'skipped', `[email] Email already exists`)
        continue
      }
      const { rows: dupMob } = await client.query('SELECT id FROM users WHERE mobile_number=$1', [data.mobile_number])
      if (dupMob.length) {
        await markRow(client, jobId, row.id, 'skipped', `[mobile_number] Mobile number already exists`)
        continue
      }

      // ── Master-data: role must exist in `roles` table ─────
      const { rows: roleRow } = await client.query('SELECT name, color FROM roles WHERE name=$1', [data.role])
      if (!roleRow.length) {
        await markRow(client, jobId, row.id, 'failed', `[role] Role "${data.role}" does not exist in master data`)
        continue
      }

      // ── Master-data: designation → tier mapping ───────────
      let resolvedTierId = null
      let tierRow = null
      if (data.tier_id !== undefined && data.tier_id !== '') {
        // Caller supplied an explicit tier_id — use it as-is, validate it exists.
        const tid = parseInt(data.tier_id, 10)
        if (!Number.isInteger(tid)) {
          await markRow(client, jobId, row.id, 'failed', `[tier_id] tier_id must be an integer`)
          continue
        }
        const { rows: t } = await client.query('SELECT * FROM tiers WHERE id=$1', [tid])
        if (!t.length) {
          await markRow(client, jobId, row.id, 'failed', `[tier_id] Tier id ${tid} does not exist`)
          continue
        }
        tierRow = t[0]
        resolvedTierId = tierRow.id
      } else {
        tierRow = await resolveTierForDesignation(client, data.designation)
        if (!tierRow) {
          await markRow(client, jobId, row.id, 'failed',
            `[designation] Designation "${data.designation}" is not mapped to any tier — set the mapping in Tier Config first`)
          continue
        }
        resolvedTierId = tierRow.id
      }

      // ── Approval flow: every employee must have approvers ─
      const approvalCfg = deriveApprovalFromTier(tierRow)
      if (!approvalCfg) {
        await markRow(client, jobId, row.id, 'failed',
          `[designation] Tier "${tierRow.name}" has no approver_roles configured — assign approvers in Tier Config`)
        continue
      }

      await client.query('BEGIN')

      // ── Generate emp_id (server sequence — concurrent-safe) ─
      const { rows: [seqRow] } = await client.query("SELECT nextval('emp_id_seq') AS num")
      const emp_id = `EMP-${String(seqRow.num).padStart(3, '0')}`

      const parts = data.name.trim().split(/\s+/)
      const avatar = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : data.name.slice(0, 2).toUpperCase()
      const color = roleRow[0].color || '#0A84FF'
      const password_hash = await bcrypt.hash(data.password, 10)

      // ── PPI wallet creation (same as single create) ───────
      let ppiWallet
      try {
        ppiWallet = await createPpiWallet({
          productId: data.productId || undefined,
          name: data.name.trim(),
          mobile_number: data.mobile_number,
          email: data.email,
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          pan_number: data.pan_number,
          aadhaar_number: data.aadhaar_number,
        })
      } catch (ppiErr) {
        await client.query('ROLLBACK')
        await markRow(client, jobId, row.id, 'failed', `[wallet] PPI: ${ppiErr.message}`)
        continue
      }

      // ── Insert user — column set matches POST /api/employees ─
      // (reporting_to is intentionally omitted; the Employee Creation form
      // strips it before submitting, so bulk does the same.)
      const { rows: [user] } = await client.query(
        `INSERT INTO users (emp_id, name, email, password_hash, role, department, avatar, color,
                            mobile_number, date_of_birth, gender, pan_number, aadhaar_number,
                            ppi_wallet_id, ppi_wallet_number, ppi_customer_id, ppi_wallet_status, ppi_kyc_status,
                            approver_roles, approval_type, required_approval_count,
                            designation, tier_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING id, ppi_wallet_id`,
        [
          emp_id, data.name.trim(), data.email, password_hash, data.role,
          data.department || 'Engineering', avatar, color,
          data.mobile_number, data.date_of_birth, data.gender,
          data.pan_number, data.aadhaar_number,
          ppiWallet.walletId, ppiWallet.walletNumber, ppiWallet.customerId,
          ppiWallet.walletStatus, ppiWallet.kycStatus,
          approvalCfg.approver_roles, approvalCfg.approval_type, approvalCfg.required_approval_count,
          data.designation, resolvedTierId,
        ]
      )

      // Internal wallet
      await client.query(
        `INSERT INTO wallets (user_id, balance, total_credited, total_debited, travel_balance, hotel_balance, allowance_balance)
         VALUES ($1, 0, 0, 0, 0, 0, 0)`, [user.id]
      )

      await client.query('COMMIT')

      await client.query(
        `UPDATE bulk_job_rows SET status='success', employee_id=$1, ppi_wallet_id=$2, error_message=NULL, updated_at=NOW() WHERE id=$3`,
        [user.id, ppiWallet.walletId, row.id]
      )
      await client.query(`UPDATE bulk_jobs SET processed=processed+1, succeeded=succeeded+1 WHERE id=$1`, [jobId])

      console.log(`[BULK] Row ${row.row_number} OK — ${emp_id} / ${data.email}`)
    } catch (err) {
      try { await client.query('ROLLBACK') } catch {}
      await markRow(client, jobId, row.id, 'failed', `[error] ${err.message}`)
      console.error(`[BULK] Row ${row.row_number} FAILED — ${data.email}: ${err.message}`)
    } finally {
      client.release()
    }
  }

  // Complete job
  const { rows: [job] } = await pool.query('SELECT failed FROM bulk_jobs WHERE id=$1', [jobId])
  const status = job.failed > 0 ? 'completed_with_errors' : 'completed'
  await pool.query(`UPDATE bulk_jobs SET status=$1, completed_at=NOW() WHERE id=$2`, [status, jobId])
  activeJobs.delete(jobId)
  console.log(`[BULK] Job ${jobId} ${status}`)
}

async function markRow(client, jobId, rowId, status, errorMsg) {
  const counterCol = status === 'skipped' ? 'skipped' : 'failed'
  await client.query(
    `UPDATE bulk_job_rows SET status=$1, error_message=$2, updated_at=NOW() WHERE id=$3`,
    [status, errorMsg, rowId]
  )
  await client.query(
    `UPDATE bulk_jobs SET processed=processed+1, ${counterCol}=${counterCol}+1 WHERE id=$1`,
    [jobId]
  )
}

// ── POST /api/employees/bulk/upload ──────────────────────────
router.post('/upload', bulkUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' })

    const ext = req.file.originalname.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return res.status(400).json({ success: false, message: 'Only .xlsx, .xls, or .csv files are accepted' })
    }

    let parsed
    try {
      parsed = parseFile(req.file.buffer, req.file.originalname)
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: parseErr.message })
    }

    const { validRows, invalidRows, totalRows } = parsed

    // Create bulk job
    const { rows: [job] } = await pool.query(
      `INSERT INTO bulk_jobs (created_by, file_name, total_rows, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [req.user.id, req.file.originalname, totalRows]
    )

    // Insert valid rows
    for (const row of validRows) {
      await pool.query(
        `INSERT INTO bulk_job_rows (job_id, row_number, raw_data, idempotency_key, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [job.id, row.rowNumber, JSON.stringify(row.data), row.data._idempotencyKey]
      )
    }

    // Insert invalid rows as failed (validation errors, structured)
    for (const row of invalidRows) {
      await pool.query(
        `INSERT INTO bulk_job_rows (job_id, row_number, raw_data, status, error_message) VALUES ($1, $2, $3, 'failed', $4)`,
        [job.id, row.rowNumber, JSON.stringify(row.data), formatErrors(row.errors)]
      )
    }

    if (invalidRows.length) {
      await pool.query('UPDATE bulk_jobs SET failed=$1, processed=$1 WHERE id=$2', [invalidRows.length, job.id])
    }

    // Start processing in background
    if (validRows.length) {
      activeJobs.set(job.id, true)
      processJob(job.id).catch(err => console.error(`[BULK] Job ${job.id} crashed:`, err.message))
    } else {
      await pool.query(`UPDATE bulk_jobs SET status='completed_with_errors', completed_at=NOW() WHERE id=$1`, [job.id])
    }

    res.status(201).json({
      success: true,
      message: `Bulk job created. ${validRows.length} rows queued, ${invalidRows.length} validation errors.`,
      data: { jobId: job.id, totalRows, validRows: validRows.length, invalidRows: invalidRows.length },
    })
  } catch (e) { next(e) }
})

// ── GET /api/employees/bulk/jobs ─────────────────────────────
router.get('/jobs', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, file_name, total_rows, processed, succeeded, failed, skipped, status, started_at, completed_at, created_at
       FROM bulk_jobs WHERE created_by=$1 ORDER BY created_at DESC`, [req.user.id]
    )
    res.json({ success: true, data: rows })
  } catch (e) { next(e) }
})

// ── GET /api/employees/bulk/jobs/:jobId ──────────────────────
router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const { rows: [job] } = await pool.query('SELECT * FROM bulk_jobs WHERE id=$1 AND created_by=$2', [req.params.jobId, req.user.id])
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' })

    const status = req.query.status || null
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const offset = (page - 1) * limit

    let q = 'SELECT * FROM bulk_job_rows WHERE job_id=$1'
    const params = [req.params.jobId]
    if (status) { q += ' AND status=$2'; params.push(status) }
    q += ` ORDER BY row_number ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)
    const { rows } = await pool.query(q, params)

    let cq = 'SELECT COUNT(*) FROM bulk_job_rows WHERE job_id=$1'
    const cp = [req.params.jobId]
    if (status) { cq += ' AND status=$2'; cp.push(status) }
    const { rows: [{ count }] } = await pool.query(cq, cp)

    res.json({ success: true, data: { job, rows, total: parseInt(count), page, limit } })
  } catch (e) { next(e) }
})

// ── GET /api/employees/bulk/jobs/:jobId/export-errors ────────
router.get('/jobs/:jobId/export-errors', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT row_number, raw_data, error_message, status FROM bulk_job_rows
       WHERE job_id=$1 AND status IN ('failed','skipped') ORDER BY row_number`, [req.params.jobId]
    )
    const data = rows.map(r => ({ row: r.row_number, status: r.status, error: r.error_message, ...r.raw_data }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Errors')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=bulk_errors_${req.params.jobId.slice(0, 8)}.xlsx`)
    res.send(buf)
  } catch (e) { next(e) }
})

// ── POST /api/employees/bulk/jobs/:jobId/retry-failed ────────
router.post('/jobs/:jobId/retry-failed', async (req, res, next) => {
  try {
    const jobId = req.params.jobId
    const { rows: [job] } = await pool.query('SELECT * FROM bulk_jobs WHERE id=$1 AND created_by=$2', [jobId, req.user.id])
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' })

    const { rowCount } = await pool.query(
      `UPDATE bulk_job_rows SET status='pending', error_message=NULL, retry_count=retry_count+1, updated_at=NOW()
       WHERE job_id=$1 AND status='failed'`, [jobId]
    )
    if (!rowCount) return res.json({ success: true, message: 'No failed rows to retry' })

    await pool.query(
      `UPDATE bulk_jobs SET status='processing', processed=processed-$1, failed=failed-$1, completed_at=NULL WHERE id=$2`,
      [rowCount, jobId]
    )

    activeJobs.set(jobId, true)
    processJob(jobId).catch(err => console.error(`[BULK] Retry job ${jobId} crashed:`, err.message))

    res.json({ success: true, message: `${rowCount} failed rows re-queued for retry` })
  } catch (e) { next(e) }
})

// ── DELETE /api/employees/bulk/jobs/:jobId ───────────────────
router.delete('/jobs/:jobId', async (req, res, next) => {
  try {
    const jobId = req.params.jobId
    activeJobs.delete(jobId)
    const { rowCount } = await pool.query('DELETE FROM bulk_jobs WHERE id=$1 AND created_by=$2', [jobId, req.user.id])
    if (!rowCount) return res.status(404).json({ success: false, message: 'Job not found' })
    res.json({ success: true, message: 'Job deleted successfully' })
  } catch (e) { next(e) }
})

module.exports = router
