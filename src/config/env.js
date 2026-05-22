/**
 * env.js — Centralized environment configuration
 *
 * PURPOSE:
 *   Single source of truth for all environment variables.
 *   Every module imports config from here instead of reading
 *   process.env directly, making it easy to validate and
 *   change defaults in one place.
 */

require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "92",
  chromePath:
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

module.exports = config;
