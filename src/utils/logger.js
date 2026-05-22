/**
 * logger.js — Winston logging utility
 *
 * PURPOSE:
 *   Provides a pre-configured Winston logger used across the
 *   entire application. Logs are written to both the console
 *   (colorized for development) and persistent files for
 *   production debugging.
 *
 *   Log files:
 *     logs/error.log  — errors only
 *     logs/combined.log — everything (info, warn, error)
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const LOG_DIR = path.join(__dirname, "../../logs");

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
    // ── Console (colorized) ──
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    }),
    // ── File: errors only ──
    new transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
    }),
    // ── File: all levels ──
    new transports.File({
      filename: path.join(LOG_DIR, "combined.log"),
    }),
  ],
});

module.exports = logger;
