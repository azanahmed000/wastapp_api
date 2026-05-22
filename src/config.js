/**
 * config.js — Centralized environment configuration
 *
 * PURPOSE:
 *   Single source of truth for all environment variables.
 *   Validates required vars at startup so the app fails fast
 *   with a clear error rather than silently misbehaving.
 *
 *   CLOUD FIX: Defines a writable data directory (/tmp on Linux
 *   containers) so RemoteAuth.zip and all Puppeteer cache files
 *   are written to a guaranteed writable path, not the read-only
 *   root project directory.
 */

require("dotenv").config();

const os = require("os");
const path = require("path");

/**
 * Resolve the writable data directory.
 *
 * On cloud Linux containers (Railway, Render), the project root is
 * read-only. The only guaranteed writable path is /tmp. On Windows
 * (local dev), we use os.tmpdir() which resolves to the user's temp
 * folder. The user can override this via DATA_DIR env var.
 */
const dataDir =
  process.env.DATA_DIR ||
  (process.platform === "win32"
    ? path.join(os.tmpdir(), "whatsapp-bridge")
    : "/tmp/whatsapp-bridge");

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

  // ── Writable data directory ──
  // All temp files, RemoteAuth.zip, Puppeteer user data, etc.
  // are written here instead of the project root.
  dataDir,
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
