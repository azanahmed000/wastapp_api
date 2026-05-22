/**
 * logger.js — Structured logging utility with prefix tags
 *
 * PURPOSE:
 *   Pre-configured Winston logger for cloud environments with
 *   structured prefix tags for tracking explicit milestones:
 *
 *   [WhatsApp Gateway]       — Client lifecycle events
 *   [Database Connection]    — MongoDB connection events
 *   [HTTP Server]            — Express request/response logs
 *   [Security]               — Auth and validation events
 *   [Heartbeat]              — Browser keepalive pings
 *
 *   Logs only to console (stdout/stderr) since cloud platforms
 *   like Render and Railway capture stdout as their log system.
 */

const { createLogger, format, transports } = require("winston");

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
  ],
});

/**
 * Create a tagged logger that prepends a prefix to every message.
 *
 * Usage:
 *   const log = require('./logger').tagged('[WhatsApp Gateway]');
 *   log.info('Client is ready'); // → "2026-05-22 ... [WhatsApp Gateway] Client is ready"
 *
 * @param {string} tag — Prefix tag like '[WhatsApp Gateway]'
 * @returns {{ info, warn, error }} — Tagged logger methods
 */
function tagged(tag) {
  return {
    info: (msg) => logger.info(`${tag} ${msg}`),
    warn: (msg) => logger.warn(`${tag} ${msg}`),
    error: (msg, err) =>
      err
        ? logger.error(`${tag} ${msg}`, err)
        : logger.error(`${tag} ${msg}`),
  };
}

logger.tagged = tagged;

module.exports = logger;
