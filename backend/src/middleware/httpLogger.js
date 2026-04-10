/**
 * HTTP request/response logging middleware + correlation ID injection.
 *
 *  For every request:
 *  1. Generates or reads a correlation ID (X-Correlation-Id header)
 *  2. Attaches it to req.correlationId for downstream use
 *  3. Logs the incoming request (method, path, headers, body)
 *  4. Hooks into res.end to log the response (status, duration)
 *
 *  Sensitive body fields (password, token, etc.) are auto-redacted
 *  by the logger's built-in redaction format.
 */
const crypto = require('crypto')
const logger = require('../config/logger')

// Fields to strip from logged request bodies (beyond Winston redaction)
const BODY_STRIP = new Set([
  'password', 'Password', 'password_hash', 'token',
  'credit_card', 'cvv', 'ssn', 'aadhaar_number', 'pan_number',
])

function sanitizeBody (body) {
  if (!body || typeof body !== 'object') return body
  const out = {}
  for (const [k, v] of Object.entries(body)) {
    if (BODY_STRIP.has(k)) { out[k] = '[REDACTED]'; continue }
    if (typeof v === 'string' && v.length > 500) { out[k] = v.substring(0, 500) + '…[truncated]'; continue }
    out[k] = v
  }
  return out
}

function httpLogger (req, res, next) {
  // ── Correlation ID ───────────────────────────────────
  const correlationId =
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    crypto.randomUUID()

  req.correlationId = correlationId
  res.setHeader('X-Correlation-Id', correlationId)

  // ── Create child logger scoped to this request ───────
  const reqLogger = logger.child({
    module:        'http',
    correlationId,
    requestId:     correlationId,
  })

  // Attach to req so controllers/services can use it
  req.log = reqLogger

  // ── Log incoming request ─────────────────────────────
  const startTime = Date.now()
  const { method, originalUrl, ip } = req

  reqLogger.info('request', {
    event:   'http_request',
    method,
    url:     originalUrl,
    ip:      ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent']?.substring(0, 120),
    contentType: req.headers['content-type'],
    body:    ['POST', 'PUT', 'PATCH'].includes(method) ? sanitizeBody(req.body) : undefined,
  })

  // ── Hook response to log on finish ───────────────────
  const originalEnd = res.end
  res.end = function (chunk, encoding) {
    res.end = originalEnd
    res.end(chunk, encoding)

    const duration = Date.now() - startTime
    const statusCode = res.statusCode
    const user = req.user ? `${req.user.role}:${req.user.name}` : 'guest'

    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

    reqLogger[level]('response', {
      event:    'http_response',
      method,
      url:      originalUrl,
      statusCode,
      duration: `${duration}ms`,
      user,
      contentLength: res.getHeader('content-length'),
    })
  }

  next()
}

module.exports = httpLogger
