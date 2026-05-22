/**
 * config.js — Centralized environment configuration
 *
 * PURPOSE:
 *   Single source of truth for all environment variables.
 *   Validates required vars at startup so the app fails fast
 *   with a clear error rather than silently misbehaving.
 */

require("dotenv").config();

const config = {
  // ── Server ──
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "production",

  // ── MongoDB Atlas (for RemoteAuth session persistence) ──
  mongodbUri: process.env.MONGODB_URI || "",

  // ── API Security ──
  botApiKey: process.env.BOT_API_KEY || "",

  // ── WhatsApp ──
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "92",

  // ── Heartbeat ──
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS, 10) || 15000,

  // ── Chromium (auto-detected in Docker, override if needed) ──
  chromePath: process.env.CHROME_PATH || null,
};

/**
 * Validate that critical environment variables are set.
 * Called once at startup from bridge.js.
 */
function validateConfig() {
  const missing = [];

  if (!config.mongodbUri) missing.push("MONGODB_URI");
  if (!config.botApiKey) missing.push("BOT_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Check your .env file or cloud provider's environment settings."
    );
  }
}

module.exports = { config, validateConfig };
