require('./config/env')
const express    = require('express')
const cors       = require('cors')
const path       = require('path')
const pool       = require('./config/db')
const logger     = require('./config/logger')
const httpLogger = require('./middleware/httpLogger')

const { setupSwagger } = require('./swagger')

const app  = express()
const PORT = process.env.PORT || 5000

// ── CORS ──────────────────────────────────────────────────────
// Allow:
//   1. Same-origin / non-browser requests (no Origin header)
//   2. localhost / 127.0.0.1 and private LAN ranges (10.x, 192.168.x, 172.16–31.x)
//   3. Any origin listed in FRONTEND_URL (comma-separated, e.g. public domains
//      reverse-proxied via nginx). Trailing slashes and case are normalised.
const normaliseOrigin = (s) => (s || '').trim().toLowerCase().replace(/\/+$/, '')

const allowedOrigins = new Set(
  (process.env.FRONTEND_URL || '').split(',').map(normaliseOrigin).filter(Boolean)
)

const lanOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const o = normaliseOrigin(origin)
    if (lanOriginRegex.test(o)) return cb(null, true)
    if (allowedOrigins.has(o)) return cb(null, true)
    logger.warn('CORS blocked', { module: 'http', origin })
    cb(new Error('CORS blocked'))
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Correlation-Id','X-Request-Id','Access-Control-Request-Private-Network'],
  optionsSuccessStatus: 200,
}))
// Chrome's Private Network Access: when a public-origin page (HTTPS) calls a
// private-IP backend, Chrome sends `Access-Control-Request-Private-Network: true`
// on the preflight. We must echo `Access-Control-Allow-Private-Network: true`
// or it blocks the request. (Note: the page must still be on a secure context
// — HTTPS — for this to work.)
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  next()
})
app.options('*', cors())

app.use(express.json({ limit:'10mb' }))
app.use(express.urlencoded({ extended:true }))

// ── Structured HTTP logging + correlation ID ─────────────────
app.use(httpLogger)

// ── Static uploads (for file serving) ────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')))

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
app.use('/api/tiers',        require('./routes/tiers'))
app.use('/api/flights/air',  require('./routes/airFlights'))
app.use('/api/held-flights', require('./routes/heldFlights'))
app.use('/api/flights',      require('./routes/flights'))
app.use('/api/hotels',       require('./routes/hotels'))

app.get('/health', (req, res) => res.json({ ok:true, time:new Date().toISOString() }))

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  logger.warn('route not found', { module: 'http', method: req.method, path: req.path, correlationId: req.correlationId })
  res.status(404).json({ success:false, message:`Not found: ${req.method} ${req.path}` })
})

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('unhandled error', {
    module:        'http',
    message:       err.message,
    stack:         err.stack?.split('\n').slice(0, 5).join('\n'),
    code:          err.code,
    method:        req.method,
    path:          req.path,
    correlationId: req.correlationId,
  })
  if (err.code === '23505') return res.status(409).json({ success:false, message:'Duplicate entry' })
  if (err.code === '23503') return res.status(400).json({ success:false, message:'Referenced record not found' })
  if (err.message?.includes('Only PDF')) return res.status(400).json({ success:false, message:err.message })
  res.status(err.status||500).json({ success:false, message:err.message||'Server error' })
})

// ── Start ─────────────────────────────────────────────────────
async function start() {
  try {
    await pool.query('SELECT 1')
    logger.info('database connected', { module: 'startup', database: 'traveldesk_v3@localhost:5432' })
  } catch(e) {
    logger.error('database connection failed', { module: 'startup', message: e.message })
    process.exit(1)
  }
  app.listen(PORT, () => {
    logger.info('server started', {
      module: 'startup',
      port:   PORT,
      env:    process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      seq:    process.env.SEQ_URL || 'disabled',
      provider: process.env.FLIGHT_PROVIDER || 'mock',
    })
  })
}
start()
module.exports = app
