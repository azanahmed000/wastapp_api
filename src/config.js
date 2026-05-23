/**
 * config.js — Local environment configuration
 *
 * Reads from .env file. No database, no cloud paths.
 */

require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  botApiKey: process.env.BOT_API_KEY || "",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "92",
  chromePath:
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

function validateConfig() {
  if (!config.botApiKey) {
    throw new Error(
      "Missing required environment variable: BOT_API_KEY. Check your .env file."
    );
  }
}

module.exports = { config, validateConfig };
