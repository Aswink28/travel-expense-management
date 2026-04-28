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
      'SELECT id,emp_id,name,email,role,department,avatar,color,reporting_to,is_active,ppi_wallet_id,approver_roles,approval_type,designation,tier_id FROM users WHERE id=$1',
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

module.exports = { authenticate, authorise, upload }
