/**
 * Air API structured logger — delegates to the centralized Winston logger.
 *
 * Provides the same interface (info/warn/error/redact) that all airApi
 * service modules already use, but routes everything through Winston
 * so it appears in console, log files, and Seq with the same format.
 */
const logger = require('../../config/logger')

const airLogger = logger.child({ module: 'airapi' })

module.exports = {
  info:  (event, meta = {}) => airLogger.info(event,  { ...meta }),
  warn:  (event, meta = {}) => airLogger.warn(event,  { ...meta }),
  error: (event, meta = {}) => airLogger.error(event, { ...meta }),
  redact: logger.redact,
}
