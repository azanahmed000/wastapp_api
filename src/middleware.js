/**
 * middleware.js — Authentication & strict validation middleware
 *
 * PURPOSE:
 *   1. API Key Guard: Protects endpoints from unauthorized access.
 *      Only requests with a valid X-API-KEY header are allowed.
 *
 *   2. Strict Message Validator: Enforces strict parameter data type
 *      checks, Content-Type header validation, and phone number
 *      formatting before any data reaches the messenger pipeline.
 */

const { config } = require("./config");
const logger = require("./logger");

const secLog = logger.tagged("[Security]");
const valLog = logger.tagged("[Validation]");

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
    secLog.warn(`Rejected ${req.ip} — missing X-API-KEY header`);
    return res.status(401).json({
      success: false,
      error: "Missing X-API-KEY header. Provide your API key to access this endpoint.",
    });
  }

  if (apiKey !== config.botApiKey) {
    secLog.warn(`Rejected ${req.ip} — invalid API key`);
    return res.status(401).json({
      success: false,
      error: "Invalid API key.",
    });
  }

  secLog.info(`Authorized request from ${req.ip}`);
  next();
}

// ─────────────────────────────────────────────────────
// STRICT MESSAGE VALIDATION
// ─────────────────────────────────────────────────────

/**
 * Validates the request before it reaches the messenger pipeline.
 *
 * Checks:
 *   1. Content-Type header must be application/json
 *   2. Body must be a non-null object (not array, not primitive)
 *   3. 'number' field: required, string type, valid E.164 digits
 *   4. 'message' field: required, string type, non-empty, max 4096 chars
 *   5. No extraneous fields beyond 'number' and 'message'
 *
 * Attaches cleaned values to req.cleanNumber and req.cleanMessage.
 */
function validateMessage(req, res, next) {
  // ── Content-Type check ──
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("application/json")) {
    valLog.warn("Rejected — Content-Type is not application/json");
    return res.status(415).json({
      success: false,
      error: "Content-Type must be application/json.",
    });
  }

  // ── Body type check ──
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    valLog.warn("Rejected — body is not a valid JSON object");
    return res.status(400).json({
      success: false,
      error: "Request body must be a JSON object with 'number' and 'message' fields.",
    });
  }

  const { number, message } = req.body;

  // ── Required fields ──
  if (number === undefined || message === undefined) {
    valLog.warn("Rejected — missing 'number' or 'message' field");
    return res.status(400).json({
      success: false,
      error: "Both 'number' and 'message' fields are required.",
    });
  }

  // ── Strict type checks ──
  if (typeof number !== "string") {
    valLog.warn(`Rejected — 'number' is ${typeof number}, expected string`);
    return res.status(400).json({
      success: false,
      error: `'number' must be a string, received ${typeof number}.`,
    });
  }

  if (typeof message !== "string") {
    valLog.warn(`Rejected — 'message' is ${typeof message}, expected string`);
    return res.status(400).json({
      success: false,
      error: `'message' must be a string, received ${typeof message}.`,
    });
  }

  const trimmedNumber = number.trim();
  const trimmedMessage = message.trim();

  // ── Empty checks ──
  if (trimmedNumber.length === 0) {
    valLog.warn("Rejected — empty 'number' field");
    return res.status(400).json({
      success: false,
      error: "'number' cannot be empty.",
    });
  }

  if (trimmedMessage.length === 0) {
    valLog.warn("Rejected — empty 'message' field");
    return res.status(400).json({
      success: false,
      error: "'message' cannot be empty.",
    });
  }

  // ── Message length cap (WhatsApp limit ~65536, we cap at 4096) ──
  if (trimmedMessage.length > 4096) {
    valLog.warn(`Rejected — message too long (${trimmedMessage.length} chars)`);
    return res.status(400).json({
      success: false,
      error: `Message exceeds maximum length of 4096 characters (received ${trimmedMessage.length}).`,
    });
  }

  // ── Phone number format (E.164: 10-15 digits) ──
  const digitsOnly = trimmedNumber.replace(/^\+/, "");
  if (!/^\d{10,15}$/.test(digitsOnly)) {
    valLog.warn(`Rejected — invalid phone number: "${trimmedNumber}"`);
    return res.status(400).json({
      success: false,
      error: "Invalid phone number. Use international format, e.g. '+923001234567'.",
    });
  }

  // ── Normalize local numbers ──
  let cleanNumber = digitsOnly;
  if (cleanNumber.startsWith("0")) {
    cleanNumber = config.defaultCountryCode + cleanNumber.slice(1);
    valLog.info(`Normalized local number → ${cleanNumber}`);
  }

  req.cleanNumber = cleanNumber;
  req.cleanMessage = trimmedMessage;

  valLog.info(`Validated: number=${cleanNumber}, message=${trimmedMessage.length} chars`);
  next();
}

module.exports = { authenticateApiKey, validateMessage };
