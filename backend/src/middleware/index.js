const jwt    = require('jsonwebtoken')
const multer = require('multer')
const path   = require('path')
const fs     = require('fs')
const pool   = require('../config/db')

// ── JWT authenticate ──────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const h = req.headers['authorization']
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ success:false, message:'No token' })
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET)
    const { rows } = await pool.query(
      'SELECT id,emp_id,name,email,role,department,avatar,color,reporting_to,is_active,ppi_wallet_id,approver_roles,approval_type,approval_flow,designation,tier_id FROM users WHERE id=$1',
      [decoded.userId]
    )
    if (!rows.length || !rows[0].is_active) return res.status(401).json({ success:false, message:'User not found' })
    req.user = rows[0]
    next()
  } catch(e) {
    return res.status(401).json({ success:false, message: e.name==='TokenExpiredError' ? 'Session expired' : 'Invalid token' })
  }
}

// ── Role guard ────────────────────────────────────────────────
const authorise = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ success:false, message:`Access denied. Need: ${roles.join(' or ')}` })
  }
  next()
}

// ── Page+Action permission guard (Phase-1 RBAC) ───────────────
// Looks up role_pages.(can_view|can_create|can_edit|can_delete) for
// the caller's role on the given page and 403s with a structured
// `permission` payload when the action is not allowed.
//
// Usage:  router.post('/',
//           authenticate,
//           requirePermission('admin-users', 'create'),
//           handler)
const VALID_ACTIONS = new Set(['view', 'create', 'edit', 'delete'])
const requirePermission = (pageId, action) => async (req, res, next) => {
  try {
    if (!VALID_ACTIONS.has(action)) {
      return res.status(500).json({ success: false, message: `requirePermission: invalid action "${action}"` })
    }
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' })
    const col = `can_${action}`
    const { rows } = await pool.query(
      `SELECT ${col} AS allowed FROM role_pages WHERE role_name = $1 AND page_id = $2 LIMIT 1`,
      [req.user.role, pageId]
    )
    const allowed = rows.length > 0 && rows[0].allowed === true
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Permission denied: your role cannot ${action} on ${pageId}`,
        permission: { page: pageId, action, role: req.user.role },
      })
    }
    next()
  } catch (e) { next(e) }
}



// ── Multer storage for ticket uploads ────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname)
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    cb(null, name)
  }
})

const fileFilter = (req, file, cb) => {
  const allowed = ['application/pdf','image/jpeg','image/png','image/jpg']
  if (allowed.includes(file.mimetype)) cb(null, true)
  else cb(new Error('Only PDF and image files allowed'), false)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 }
})

// ── Method-aware page guard ───────────────────────────────────
// Convenience wrapper around requirePermission for routers whose
// endpoints map cleanly to V/C/E/D by HTTP method:
//   GET    → view
//   POST   → create
//   PUT    → edit
//   PATCH  → edit
//   DELETE → delete
//
// `overrides` lets you remap individual endpoints when the method
// doesn't match the action (e.g. POST /:id/suspend-wallet should
// be 'edit', not 'create'). Match keys are either:
//   - "<METHOD> <path>"   exact path match (path is post-mount)
//   - "<METHOD>"          fallback for the entire method
//
// Usage:
//   router.use(authenticate, pageGuard('employees', {
//     'POST /:id/suspend-wallet': 'edit',
//     'POST /:id/close-wallet':   'edit',
//   }))
const METHOD_TO_ACTION = { GET: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' }
//
// Override key forms (in priority order):
//   "<METHOD> <exact-path>"    e.g. "POST /reassign-approver"
//   "<METHOD> *<suffix>"       e.g. "POST */suspend-wallet"  (matches /<id>/suspend-wallet)
//   "<METHOD>"                 catch-all for the method
//
const pageGuard = (pageId, overrides = {}) => (req, res, next) => {
  const path = req.path
  let action = null
  for (const [key, val] of Object.entries(overrides)) {
    const space = key.indexOf(' ')
    if (space === -1) continue
    const method = key.slice(0, space)
    const pattern = key.slice(space + 1)
    if (method !== req.method) continue
    if (pattern.startsWith('*')) {
      if (path.endsWith(pattern.slice(1))) { action = val; break }
    } else if (pattern === path) {
      action = val; break
    }
  }
  if (!action) action = overrides[req.method] || METHOD_TO_ACTION[req.method] || 'view'
  return requirePermission(pageId, action)(req, res, next)
}

module.exports = { authenticate, authorise, requirePermission, pageGuard, upload }
