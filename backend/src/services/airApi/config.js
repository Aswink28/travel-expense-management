/**
 * Centralised configuration loader for the Air API integration.
 *
 * Credentials are loaded ONLY from environment variables — they must never
 * be hard-coded or logged. The auth-header builder produces a fresh object
 * per request so callers cannot accidentally mutate shared state.
 */
require('../../config/env')

function normaliseBaseUrl (raw) {
  const trimmed = (raw || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return 'https://' + trimmed
}

const cfg = {
  baseUrl:    normaliseBaseUrl(process.env.AIRAPI_BASE_URL),
  airPath:    process.env.AIRAPI_AIR_PATH   || '/airlinehost/AirAPIService.svc/JSONService',
  tradePath:  process.env.AIRAPI_TRADE_PATH || '/tradehost/TradeAPIService.svc/JSONService',
  userId:     process.env.AIRAPI_USER_ID    || '',
  password:   process.env.AIRAPI_PASSWORD   || '',
  ipAddress:  process.env.AIRAPI_IP_ADDRESS || '',
  imeiNumber: process.env.AIRAPI_IMEI_NUMBER || '000000000000000',
  timeoutMs:  parseInt(process.env.AIRAPI_TIMEOUT_MS  || '30000', 10),
  maxRetries: parseInt(process.env.AIRAPI_MAX_RETRIES || '2',     10),
  retryDelay: parseInt(process.env.AIRAPI_RETRY_DELAY_MS || '600', 10),
}

function isConfigured () {
  return Boolean(cfg.baseUrl && cfg.userId && cfg.password)
}

/**
 * Build a fresh Auth_Header. A unique Request_Id is generated per call so
 * the upstream supplier can correlate retries / replays.
 */
function buildAuthHeader (overrides = {}) {
  const requestId =
    overrides.Request_Id ||
    `${Date.now()}${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`

  return {
    UserId:      cfg.userId,
    Password:    cfg.password,
    IP_Address:  overrides.IP_Address  || cfg.ipAddress,
    Request_Id:  requestId,
    IMEI_Number: overrides.IMEI_Number || cfg.imeiNumber,
  }
}

function airUrl   (method) { return `${cfg.baseUrl}${cfg.airPath}/${method}` }
function tradeUrl (method) { return `${cfg.baseUrl}${cfg.tradePath}/${method}` }

module.exports = { cfg, isConfigured, buildAuthHeader, airUrl, tradeUrl }
