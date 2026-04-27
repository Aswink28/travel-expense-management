const express = require('express')
const path    = require('path')
const fs      = require('fs')
const pool    = require('../config/db')
const { authenticate } = require('../middleware')
const router  = express.Router()

router.use(authenticate)

// ── GET /api/documents/:id/download ──────────────────────────
router.get('/:id/download', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id=$1',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success:false, message:'Document not found' })

    const doc = rows[0]

    // Check access: own doc or admin/booking admin
    const canAccess = doc.for_user_id === req.user.id ||
      ['Booking Admin','Super Admin','Request Approver','Finance'].includes(req.user.role)

    if (!canAccess) return res.status(403).json({ success:false, message:'Access denied' })

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ success:false, message:'File not found on server' })
    }

    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`)
    res.setHeader('Content-Type', doc.mime_type)
    res.sendFile(path.resolve(doc.file_path))
  } catch(e) { next(e) }
})

// ── GET /api/documents/request/:requestId ────────────────────
router.get('/request/:requestId', async (req, res, next) => {
  try {
    const { rows: tr } = await pool.query('SELECT user_id FROM travel_requests WHERE id=$1', [req.params.requestId])
    if (!tr.length) return res.status(404).json({ success:false, message:'Request not found' })

    const canAccess = tr[0].user_id === req.user.id ||
      ['Booking Admin','Super Admin','Request Approver','Finance'].includes(req.user.role)
    if (!canAccess) return res.status(403).json({ success:false, message:'Access denied' })

    const { rows } = await pool.query(`
      SELECT d.*, u.name AS uploaded_by_name
      FROM documents d
      JOIN users u ON u.id=d.uploaded_by
      WHERE d.request_id=$1 AND d.is_visible=TRUE
      ORDER BY d.created_at DESC
    `, [req.params.requestId])

    res.json({ success:true, count:rows.length, data:rows })
  } catch(e) { next(e) }
})

module.exports = router
