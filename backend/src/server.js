require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const path    = require('path')
const pool    = require('./config/db')

const { setupSwagger } = require('./swagger')

const app  = express()
const PORT = process.env.PORT || 5000

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true)
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return cb(null, true)
    cb(new Error('CORS blocked'))
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  optionsSuccessStatus: 200,
}))
app.options('*', cors())

app.use(express.json({ limit:'10mb' }))
app.use(express.urlencoded({ extended:true }))

// ── Request logger ────────────────────────────────────────────
app.use((req, res, next) => {
  const t = Date.now()
  res.on('finish', () => {
    const u = req.user ? `[${req.user.role}] ${req.user.name}` : 'guest'
    console.log(`${req.method} ${req.path} — ${res.statusCode} — ${Date.now()-t}ms — ${u}`)
  })
  next()
})

// ── Static uploads (for file serving) ────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')))

// ── Swagger API Docs ─────────────────────────────────────────
setupSwagger(app)

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'))
app.use('/api/requests',  require('./routes/requests'))
app.use('/api/wallet',    require('./routes/wallet'))
app.use('/api/bookings',  require('./routes/bookings'))
app.use('/api/dashboard', require('./routes/dashboard'))
app.use('/api/documents',    require('./routes/documents'))
app.use('/api/self-booking', require('./routes/selfbooking'))
app.use('/api/admin',        require('./routes/adminBookings'))
app.use('/api/employees/bulk', require('./routes/bulkEmployees'))
app.use('/api/employees',    require('./routes/employees'))
app.use('/api/roles',        require('./routes/roles'))
app.use('/api/flights/air',  require('./routes/airFlights'))
app.use('/api/flights',      require('./routes/flights'))
app.use('/api/hotels',       require('./routes/hotels'))

app.get('/health', (req, res) => res.json({ ok:true, time:new Date().toISOString() }))

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success:false, message:`Not found: ${req.method} ${req.path}` }))

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message)
  if (err.code === '23505') return res.status(409).json({ success:false, message:'Duplicate entry' })
  if (err.code === '23503') return res.status(400).json({ success:false, message:'Referenced record not found' })
  if (err.message?.includes('Only PDF')) return res.status(400).json({ success:false, message:err.message })
  res.status(err.status||500).json({ success:false, message:err.message||'Server error' })
})

// ── Start ─────────────────────────────────────────────────────
async function start() {
  try {
    await pool.query('SELECT 1')
    console.log('✅  PostgreSQL connected — traveldesk_v3@localhost:5432')
  } catch(e) {
    console.error('❌  DB failed:', e.message); process.exit(1)
  }
  app.listen(PORT, () => {
    console.log(`\n🚀  TravelDesk API  →  http://localhost:${PORT}`)
    console.log(`🔓  CORS: any localhost port\n`)
    console.log('📋  Routes:')
    ;[
      'POST /api/auth/login            GET  /api/auth/me',
      'GET  /api/requests              POST /api/requests',
      'GET  /api/requests/queue        GET  /api/requests/distance-check',
      'POST /api/requests/:id/action',
      'GET  /api/wallet/balance        POST /api/wallet/debit',
      'GET  /api/wallet/transactions',
      'GET  /api/bookings/pending      POST /api/bookings/book',
      'POST /api/bookings/:id/upload   POST /api/bookings/upload-to-request',
      'GET  /api/documents/:id/download',
      'GET  /api/dashboard             GET  /api/dashboard/tier',
    ].forEach(r => console.log('    ' + r))
    console.log()
  })
}
start()
module.exports = app
