/**
 * Centralized structured logging — Winston + Seq.
 *
 *  Transports
 *  ──────────
 *  1. Console  — colorized, human-readable in dev; JSON in production
 *  2. File     — JSON lines → backend/logs/app.log (rotates at 5 MB)
 *  3. Seq      — structured log server (when SEQ_URL is set)
 *
 *  Features
 *  ──────────
 *  • Automatic redaction of sensitive fields before serialisation
 *  • Correlation / request ID injection via cls (see requestId middleware)
 *  • Child loggers per module via logger.child({ module: 'name' })
 *  • Environment-driven log level (LOG_LEVEL env var)
 */
require('dotenv').config()
const winston     = require('winston')
const path        = require('path')
const fs          = require('fs')

// ── Ensure log directory exists ──────────────────────────────
const LOG_DIR = path.join(__dirname, '..', '..', 'logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

// ── Sensitive field redaction ────────────────────────────────
const REDACT_KEYS = new Set([
  'password', 'Password', 'password_hash',
  'token', 'authorization', 'Authorization',
  'JWT_SECRET', 'jwt_secret',
  'Auth_Header',
  'PPI_PARTNER_SECRET', 'PPI_PARTNER_KEY',
  'AIRAPI_PASSWORD',
  'credit_card', 'creditCard', 'cvv', 'ssn',
  'aadhaar_number', 'pan_number',
])

function redactValue (obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return obj
  if (typeof obj !== 'object') return obj
  if (Buffer.isBuffer(obj)) return '[Buffer]'
  if (Array.isArray(obj)) return obj.map(redactValue)

  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k)) {
      out[k] = '[REDACTED]'
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redactValue(v)
    } else {
      out[k] = v
    }
  }
  return out
}

// Custom format: redact sensitive data from the `meta` / splat fields
const redactFormat = winston.format((info) => {
  // Redact any extra properties that aren't core Winston fields
  const core = new Set(['level', 'message', 'timestamp', 'module', 'requestId', 'correlationId', 'service'])
  for (const key of Object.keys(info)) {
    if (!core.has(key) && typeof info[key] === 'object' && info[key] !== null) {
      info[key] = redactValue(info[key])
    }
  }
  return info
})

// ── Formats ──────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production'

const consoleFormat = isProd
  ? winston.format.combine(
      winston.format.timestamp(),
      redactFormat(),
      winston.format.json(),
    )
  : winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
      redactFormat(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, module, requestId, ...rest }) => {
        const mod = module ? `[${module}]` : ''
        const rid = requestId ? `(${requestId.substring(0, 8)})` : ''
        const extra = Object.keys(rest).length ? ' ' + JSON.stringify(redactValue(rest)) : ''
        return `${timestamp} ${level} ${mod}${rid} ${message}${extra}`
      }),
    )

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  redactFormat(),
  winston.format.json(),
)

// ── Transports ───────────────────────────────────────────────
const transports = [
  // Console — always on
  new winston.transports.Console({ format: consoleFormat }),

  // File — JSON lines, 5 MB max, 3 rotated files
  new winston.transports.File({
    filename: path.join(LOG_DIR, 'app.log'),
    format:   fileFormat,
    maxsize:  5 * 1024 * 1024,
    maxFiles: 3,
  }),

  // Error-only file
  new winston.transports.File({
    filename: path.join(LOG_DIR, 'error.log'),
    level:    'error',
    format:   fileFormat,
    maxsize:  5 * 1024 * 1024,
    maxFiles: 3,
  }),
]

// Seq — structured log server (optional, enabled via SEQ_URL env var)
if (process.env.SEQ_URL) {
  try {
    const { Seq } = require('winston-seq')
    transports.push(new Seq({
      serverUrl:    process.env.SEQ_URL,
      apiKey:       process.env.SEQ_API_KEY || undefined,
      onError:      (e) => console.error('[Seq] transport error:', e.message),
      handleExceptions: true,
      handleRejections: true,
    }))
  } catch (e) {
    console.warn('[Logger] winston-seq not available:', e.message)
  }
}

// ── Create logger ────────────────────────────────────────────
const logger = winston.createLogger({
  level:             process.env.LOG_LEVEL || 'info',
  defaultMeta:       { service: 'traveldesk-api' },
  transports,
  exitOnError:       false,
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(LOG_DIR, 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(LOG_DIR, 'rejections.log') }),
  ],
})

// ── Convenience: redact helper for external use ──────────────
logger.redact = redactValue

module.exports = logger
