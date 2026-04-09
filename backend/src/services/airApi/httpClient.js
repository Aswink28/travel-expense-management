/**
 * HTTP client used by every Air API service module.
 *
 * Responsibilities
 *  - inject Auth_Header automatically
 *  - enforce request timeout
 *  - retry transient failures (network errors / 5xx) with linear back-off
 *  - log every attempt (with sensitive fields redacted)
 *  - normalise upstream errors into a single AirApiError type so the
 *    surrounding service / route layer can format user-friendly messages
 */
const { cfg, buildAuthHeader, isConfigured } = require('./config')
const log = require('./logger')

class AirApiError extends Error {
  constructor (message, { status = 502, code = 'AIRAPI_ERROR', requestId, raw } = {}) {
    super(message)
    this.name      = 'AirApiError'
    this.status    = status
    this.code      = code
    this.requestId = requestId
    this.raw       = raw
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** True if the error is worth retrying (network blip, 5xx, timeout). */
function isRetryable (err, status) {
  if (status && status >= 500) return true
  if (!err) return false
  const msg = String(err.message || err.code || '')
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|aborted/i.test(msg)
}

/**
 * POST a JSON payload to an Air API endpoint.
 * Auth_Header is merged in automatically — callers must NOT include it.
 */
async function post (url, payload = {}, { method } = {}) {
  if (!isConfigured()) {
    throw new AirApiError('Air API is not configured. Set AIRAPI_* env vars.', {
      status: 503, code: 'AIRAPI_NOT_CONFIGURED',
    })
  }

  const authHeader = buildAuthHeader()
  const body = JSON.stringify({ Auth_Header: authHeader, ...payload })
  const tag  = method || url.split('/').pop()

  let attempt   = 0
  let lastError = null

  while (attempt <= cfg.maxRetries) {
    attempt += 1
    const started = Date.now()
    const ctrl    = new AbortController()
    const timer   = setTimeout(() => ctrl.abort(), cfg.timeoutMs)

    log.info('request', {
      method: tag, attempt, requestId: authHeader.Request_Id, url,
      payload: log.redact(payload),
    })

    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal:  ctrl.signal,
      })
      clearTimeout(timer)

      const text = await res.text()
      let parsed = null
      try { parsed = text ? JSON.parse(text) : null } catch (_) { parsed = { raw: text } }

      const ms = Date.now() - started
      log.info('response', {
        method: tag, attempt, requestId: authHeader.Request_Id,
        status: res.status, ms,
      })

      if (!res.ok) {
        if (isRetryable(null, res.status) && attempt <= cfg.maxRetries) {
          await sleep(cfg.retryDelay * attempt)
          continue
        }
        throw new AirApiError(
          `Upstream returned HTTP ${res.status} for ${tag}`,
          { status: 502, code: 'AIRAPI_HTTP_' + res.status, requestId: authHeader.Request_Id, raw: parsed }
        )
      }

      // Air API embeds business errors in the body even on HTTP 200.
      // Common shapes: Error_Code / ErrorCode / Error.{Code,Description}
      const businessErr = extractBusinessError(parsed)
      if (businessErr) {
        throw new AirApiError(businessErr.message, {
          status: 400,
          code:   'AIRAPI_BUSINESS_' + (businessErr.code || 'ERR'),
          requestId: authHeader.Request_Id,
          raw: parsed,
        })
      }

      return { data: parsed, requestId: authHeader.Request_Id, ms }
    } catch (err) {
      clearTimeout(timer)
      lastError = err
      const status = err.status
      log.warn('request_failed', {
        method: tag, attempt, requestId: authHeader.Request_Id,
        message: err.message, code: err.code,
      })

      if (err instanceof AirApiError && !isRetryable(null, status)) throw err
      if (!isRetryable(err, status))                                throw wrap(err, authHeader.Request_Id, tag)
      if (attempt > cfg.maxRetries)                                 throw wrap(err, authHeader.Request_Id, tag)

      await sleep(cfg.retryDelay * attempt)
    }
  }
  throw wrap(lastError, authHeader.Request_Id, tag)
}

function wrap (err, requestId, tag) {
  if (err instanceof AirApiError) return err
  return new AirApiError(
    `Air API call failed: ${tag} — ${err.message || 'unknown error'}`,
    { status: 502, code: 'AIRAPI_NETWORK', requestId, raw: null }
  )
}

/** Success codes the supplier uses — anything else is a business error. */
const SUCCESS_CODES = new Set(['0', '0000', '00', 0])

/**
 * Detect the various error shapes Air API uses inside a 200 response.
 * Returns { code, message } or null if the response looks successful.
 *
 * Live response shape (confirmed against UAT):
 *   { Response_Header: { Error_Code, Error_Desc, Status_Id, ... }, ...data }
 */
function extractBusinessError (body) {
  if (!body || typeof body !== 'object') return null

  // Pattern A (primary): Response_Header envelope — every live endpoint uses this.
  const rh = body.Response_Header
  if (rh && rh.Error_Code !== undefined) {
    if (SUCCESS_CODES.has(rh.Error_Code)) return null        // "0000" / "0" → success
    return {
      code:    String(rh.Error_Code),
      message: rh.Error_Desc || rh.Error_Description || `Air API error ${rh.Error_Code}`,
    }
  }

  // Pattern B: top-level Error object (legacy / alternative deployments)
  if (body.Error && (body.Error.ErrorCode || body.Error.Description)) {
    return {
      code:    String(body.Error.ErrorCode || ''),
      message: body.Error.Description || 'Air API returned an error',
    }
  }
  // Pattern C: flat Error_Code (Air_Ticketing "22-Failed" style)
  if (body.Error_Code !== undefined && !SUCCESS_CODES.has(body.Error_Code)) {
    return {
      code:    String(body.Error_Code),
      message: body.Error_Description || body.ErrorDescription || `Air API error ${body.Error_Code}`,
    }
  }
  // Pattern D: Status flag
  if (body.Status === 'Failed' || body.Status_Id === 22) {
    return {
      code:    String(body.Status_Id || 'FAILED'),
      message: body.Error_Description || body.Message || 'Operation failed at supplier',
    }
  }
  return null
}

module.exports = { post, AirApiError, extractBusinessError }
