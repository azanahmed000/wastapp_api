/**
 * middleware.js — Authentication & validation middleware
 *
 * PURPOSE:
 *   1. API Key Guard: Protects the /send-message endpoint from
 *      unauthorized access. Only requests with a valid X-API-KEY
 *      header matching BOT_API_KEY are allowed through.
 *
 *   2. Message Validator: Ensures the request body contains a
 *      valid phone number and non-empty message before it
 *      reaches the controller.
 */

const { config } = require("./config");
const logger = require("./logger");

// ─────────────────────────────────────────────────────
// API KEY AUTHENTICATION
// ─────────────────────────────────────────────────────

/**
 * Verifies the X-API-KEY header against BOT_API_KEY.
 * Rejects unauthorized requests with 401.
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    logger.warn(`Unauthorized request from ${req.ip} — missing X-API-KEY header`);
    return res.status(401).json({
      success: false,
      error: "Missing X-API-KEY header. Provide your API key to access this endpoint.",
    });
  }

  if (apiKey !== config.botApiKey) {
    logger.warn(`Unauthorized request from ${req.ip} — invalid API key`);
    return res.status(401).json({
      success: false,
      error: "Invalid API key.",
    });
  }

  next();
}

// ─────────────────────────────────────────────────────
// MESSAGE VALIDATION
// ─────────────────────────────────────────────────────

/**
 * Validates that the request body contains a valid phone number
 * and a non-empty message string.
 *
 * Attaches cleaned values to req.cleanNumber and req.cleanMessage.
 */
function validateMessage(req, res, next) {
  const { number, message } = req.body;

  // ── Required fields ──
  if (!number || !message) {
    logger.warn("Validation failed: missing 'number' or 'message'");
    return res.status(400).json({
      success: false,
      error: "Both 'number' and 'message' fields are required.",
    });
  }

  // ── Type checks ──
  if (typeof number !== "string" || typeof message !== "string") {
    logger.warn("Validation failed: 'number' and 'message' must be strings");
    return res.status(400).json({
      success: false,
      error: "'number' and 'message' must be strings.",
    });
  }

  const trimmedNumber = number.trim();
  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    logger.warn("Validation failed: empty message");
    return res.status(400).json({
      success: false,
      error: "'message' cannot be empty.",
    });
  }

  // ── Phone number format (E.164: 10-15 digits) ──
  const digitsOnly = trimmedNumber.replace(/^\+/, "");
  if (!/^\d{10,15}$/.test(digitsOnly)) {
    logger.warn(`Validation failed: invalid phone number — "${trimmedNumber}"`);
    return res.status(400).json({
      success: false,
      error: "Invalid phone number. Use international format, e.g. '+923001234567'.",
    });
  }

  // ── Normalize local numbers ──
  // If the number starts with '0' (e.g. 03001234567), strip the
  // leading zero and prepend the default country code.
  let cleanNumber = digitsOnly;
  if (cleanNumber.startsWith("0")) {
    cleanNumber = config.defaultCountryCode + cleanNumber.slice(1);
    logger.info(`Normalized local number to international: ${cleanNumber}`);
  }

  req.cleanNumber = cleanNumber;
  req.cleanMessage = trimmedMessage;

  next();
}

module.exports = { authenticateApiKey, validateMessage };
