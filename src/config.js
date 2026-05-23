/**
 * config.js — Local environment configuration
 *
 * PURPOSE:
 *   Single source of truth for all environment variables.
 *   Reads from a standard local .env file via dotenv.
 *   No cloud-specific paths or container workarounds.
 */

require("dotenv").config();

const config = {
  // ── Server ──
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // ── MongoDB Atlas (for RemoteAuth session persistence) ──
  mongodbUri: process.env.MONGODB_URI || "",

  // ── API Security ──
  botApiKey: process.env.BOT_API_KEY || "",

  // ── WhatsApp ──
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "92",

  // ── Chromium ──
  chromePath:
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

/**
 * Validate that critical environment variables are set.
 */
function validateConfig() {
  const missing = [];

  if (!config.mongodbUri) missing.push("MONGODB_URI");
  if (!config.botApiKey) missing.push("BOT_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Check your .env file."
    );
  }
}

module.exports = { config, validateConfig };
