/**
 * validateMessage.js — Request validation middleware
 *
 * PURPOSE:
 *   Validates the POST /send-message request body before it
 *   reaches the controller. Checks for required fields (number,
 *   message) and ensures the phone number is in a valid format.
 *
 *   Rejects malformed requests early with descriptive 400 errors
 *   so the controller only deals with clean, validated data.
 */

const logger = require("../utils/logger");

/**
 * Validates that the request body contains a valid phone number
 * and a non-empty message string.
 *
 * Valid phone number formats:
 *   +923001234567   (with + prefix)
 *   923001234567    (without + prefix)
 *   03001234567     (local format — will be normalized in controller)
 */
function validateMessage(req, res, next) {
  const { number, message } = req.body;

  // ── Check required fields ──
  if (!number || !message) {
    logger.warn("Validation failed: missing 'number' or 'message' field");
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

  // ── Trim whitespace ──
  const trimmedNumber = number.trim();
  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    logger.warn("Validation failed: empty message body");
    return res.status(400).json({
      success: false,
      error: "'message' cannot be empty.",
    });
  }

  // ── Phone number format validation ──
  // After stripping the optional '+', the number should be all digits
  // and between 10-15 characters (E.164 standard).
  const digitsOnly = trimmedNumber.replace(/^\+/, "");
  if (!/^\d{10,15}$/.test(digitsOnly)) {
    logger.warn(`Validation failed: invalid phone number format — "${trimmedNumber}"`);
    return res.status(400).json({
      success: false,
      error: "Invalid phone number. Use international format, e.g. '+923001234567'.",
    });
  }

  // Attach cleaned values to request for downstream use
  req.cleanNumber = digitsOnly;
  req.cleanMessage = trimmedMessage;

  next();
}

module.exports = validateMessage;
