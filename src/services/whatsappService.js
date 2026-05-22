/**
 * whatsappService.js — WhatsApp client lifecycle manager
 *
 * PURPOSE:
 *   Encapsulates all whatsapp-web.js logic: client initialization,
 *   QR authentication, session persistence, connection monitoring,
 *   and message dispatch. No other module touches whatsapp-web.js
 *   directly — everything goes through this service.
 *
 * SESSION PERSISTENCE:
 *   Uses LocalAuth strategy which stores session data in the
 *   .wwebjs_auth/ directory. After the first QR scan, subsequent
 *   restarts will reconnect automatically without re-scanning.
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const logger = require("../utils/logger");
const config = require("../config/env");

/** @type {Client|null} */
let client = null;

/** Tracks whether the client is authenticated and ready to send */
let isReady = false;

/**
 * Initialize the WhatsApp client.
 * This should be called once at server startup.
 *
 * @returns {Promise<void>}
 */
async function initialize() {
  logger.info(`Using Chrome at: ${config.chromePath}`);

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      executablePath: config.chromePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  // ── QR Code Event ──
  // Fires when the client needs authentication.
  // The QR code is rendered in the terminal for scanning.
  client.on("qr", (qr) => {
    logger.info("QR code received — scan it with your WhatsApp app:");
    qrcode.generate(qr, { small: true });
  });

  // ── Authenticated ──
  // Fires after successful QR scan or session restore.
  client.on("authenticated", () => {
    logger.info("WhatsApp client authenticated successfully");
  });

  // ── Authentication Failure ──
  client.on("auth_failure", (message) => {
    logger.error(`WhatsApp authentication failed: ${message}`);
    isReady = false;
  });

  // ── Ready ──
  // Fires when the client is fully initialized and can send messages.
  client.on("ready", () => {
    isReady = true;
    logger.info("WhatsApp client is ready and connected");
  });

  // ── Disconnected ──
  client.on("disconnected", (reason) => {
    isReady = false;
    logger.warn(`WhatsApp client disconnected: ${reason}`);
  });

  // Start the client (downloads Chromium on first run)
  await client.initialize();
}

/**
 * Send a WhatsApp message to a phone number.
 *
 * @param {string} number  — Phone number in international format (e.g. "923001234567")
 * @param {string} message — Text content to send
 * @returns {Promise<object>} — whatsapp-web.js message response
 * @throws {Error} If the client is not ready or the send fails
 */
async function sendMessage(number, message) {
  if (!isReady) {
    throw new Error("WhatsApp client is not ready. Please scan the QR code first.");
  }

  // whatsapp-web.js requires the chat ID format: <number>@c.us
  const chatId = `${number}@c.us`;

  logger.info(`Sending message to ${number}`);
  const response = await client.sendMessage(chatId, message);
  logger.info(`Message sent successfully to ${number} (id: ${response.id._serialized})`);

  return response;
}

/**
 * Check if the WhatsApp client is authenticated and ready.
 *
 * @returns {boolean}
 */
function getStatus() {
  return isReady;
}

module.exports = {
  initialize,
  sendMessage,
  getStatus,
};
