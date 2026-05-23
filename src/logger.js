/**
 * logger.js — Structured logging with prefix tags
 *
 * PURPOSE:
 *   Winston logger with tagged prefixes for clean console output:
 *   [WhatsApp Gateway], [Database], [HTTP Server], [Security], etc.
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const LOG_DIR = path.join(__dirname, "../logs");

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      return stack
        ? `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`
        : `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    }),
    new transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
    }),
    new transports.File({
      filename: path.join(LOG_DIR, "combined.log"),
    }),
  ],
});

/**
 * Create a tagged logger that prepends a prefix to every message.
 *
 * @param {string} tag — e.g. '[WhatsApp Gateway]'
 * @returns {{ info, warn, error }}
 */
function tagged(tag) {
  return {
    info: (msg) => logger.info(`${tag} ${msg}`),
    warn: (msg) => logger.warn(`${tag} ${msg}`),
    error: (msg, err) =>
      err ? logger.error(`${tag} ${msg}`, err) : logger.error(`${tag} ${msg}`),
  };
}

logger.tagged = tagged;

module.exports = logger;
