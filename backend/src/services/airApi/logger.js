/**
 * Lightweight, dependency-free structured logger for the Air API integration.
 *
 * Writes JSON lines to backend/airapi.log AND mirrors to console. Sensitive
 * fields (Password, raw Auth_Header) are redacted before serialisation.
 */
const fs   = require('fs')
const path = require('path')

const LOG_FILE = path.join(__dirname, '..', '..', '..', 'airapi.log')
const REDACT_KEYS = new Set(['Password', 'password', 'Auth_Header', 'authorization'])

function redact (value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redact)
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (REDACT_KEYS.has(k)) { out[k] = '[REDACTED]'; continue }
    out[k] = redact(v)
  }
  return out
}

function write (level, event, meta = {}) {
  const line = JSON.stringify({
    ts:    new Date().toISOString(),
    level,
    scope: 'airapi',
    event,
    ...redact(meta),
  })
  // Mirror to console for dev visibility, file for audit trail
  if (level === 'error') console.error(line)
  else                    console.log(line)
  try { fs.appendFile(LOG_FILE, line + '\n', () => {}) } catch (_) { /* never crash on log */ }
}

module.exports = {
  info:  (e, m) => write('info',  e, m),
  warn:  (e, m) => write('warn',  e, m),
  error: (e, m) => write('error', e, m),
  redact,
}
