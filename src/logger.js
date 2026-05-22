/**
 * logger.js — Winston logging utility
 *
 * PURPOSE:
 *   Pre-configured Winston logger for cloud environments.
 *   Logs only to console (stdout/stderr) since cloud platforms
 *   like Render and Railway capture stdout as their log system.
 *   No file transports needed in containers.
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

module.exports = logger;
