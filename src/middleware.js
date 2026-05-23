/**
 * middleware.js — API key authentication & message validation
 */

const { config } = require("./config");
const logger = require("./logger");

const secLog = logger.tagged("[Security]");
const valLog = logger.tagged("[Validation]");

/**
 * Verifies X-API-KEY header against BOT_API_KEY.
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    secLog.warn(`Rejected ${req.ip} — missing X-API-KEY`);
    return res.status(401).json({
      success: false,
      error: "Missing X-API-KEY header.",
    });
  }

  if (apiKey !== config.botApiKey) {
    secLog.warn(`Rejected ${req.ip} — invalid API key`);
    return res.status(401).json({
      success: false,
      error: "Invalid API key.",
    });
  }

  next();
}

/**
 * Validates request body: Content-Type, field types, phone format.
 */
function validateMessage(req, res, next) {
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("application/json")) {
    valLog.warn("Rejected — Content-Type is not application/json");
    return res.status(415).json({
      success: false,
      error: "Content-Type must be application/json.",
    });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    valLog.warn("Rejected — body is not a valid JSON object");
    return res.status(400).json({
      success: false,
      error: "Request body must be a JSON object with 'number' and 'message' fields.",
    });
  }

  const { number, message } = req.body;

  if (number === undefined || message === undefined) {
    return res.status(400).json({
      success: false,
      error: "Both 'number' and 'message' fields are required.",
    });
  }

  if (typeof number !== "string") {
    return res.status(400).json({
      success: false,
      error: `'number' must be a string, received ${typeof number}.`,
    });
  }

  if (typeof message !== "string") {
    return res.status(400).json({
      success: false,
      error: `'message' must be a string, received ${typeof message}.`,
    });
  }

  const trimmedNumber = number.trim();
  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    return res.status(400).json({ success: false, error: "'message' cannot be empty." });
  }

  if (trimmedMessage.length > 4096) {
    return res.status(400).json({
      success: false,
      error: `Message exceeds 4096 characters (received ${trimmedMessage.length}).`,
    });
  }

  const digitsOnly = trimmedNumber.replace(/^\+/, "");
  if (!/^\d{10,15}$/.test(digitsOnly)) {
    return res.status(400).json({
      success: false,
      error: "Invalid phone number. Use international format, e.g. '+923001234567'.",
    });
  }

  let cleanNumber = digitsOnly;
  if (cleanNumber.startsWith("0")) {
    cleanNumber = config.defaultCountryCode + cleanNumber.slice(1);
  }

  req.cleanNumber = cleanNumber;
  req.cleanMessage = trimmedMessage;
  next();
}

module.exports = { authenticateApiKey, validateMessage };
