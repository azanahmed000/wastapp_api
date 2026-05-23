/**
 * whatsapp.js — WhatsApp client for local execution
 *
 * PURPOSE:
 *   Core WhatsApp integration optimized for running on a local machine:
 *
 *   1. RemoteAuth + MongoDB Atlas: Session persists in the cloud DB
 *      so it survives restarts. No local filesystem session caching
 *      needed — whatsapp-web.js handles its own internal paths.
 *
 *   2. Terminal QR display: Prints the QR code directly in the
 *      terminal using qrcode-terminal for instant local scanning.
 *
 *   3. HTTP QR display: Also stores the QR in memory so the /qr
 *      endpoint can render it for remote scanning if needed.
 *
 *   4. Standard Puppeteer config: Uses the local Chrome installation
 *      with minimal stability flags — no aggressive cloud stripping.
 */

const { Client, RemoteAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const { config } = require("./config");
const logger = require("./logger");

const log = logger.tagged("[WhatsApp Gateway]");

/** @type {Client|null} */
let client = null;

/** Tracks whether the client is authenticated and ready */
let isReady = false;

/** Stores the latest QR code string for the /qr HTTP endpoint */
let latestQR = null;

/**
 * Initialize the WhatsApp client with RemoteAuth.
 *
 * @param {import('wwebjs-mongo').MongoStore} store — MongoStore instance
 * @returns {Promise<void>}
 */
async function initialize(store) {
  log.info("Initializing WhatsApp client...");
  log.info(`Using Chrome at: ${config.chromePath}`);

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      backupSyncIntervalMs: 60000, // Save session to MongoDB every 60 seconds
    }),
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

  // Track whether the session has been saved to MongoDB
  let sessionSavedToDB = false;

  // ── QR Code Event ──
  // Prints QR directly in terminal AND stores it for the /qr HTTP endpoint.
  client.on("qr", (qr) => {
    latestQR = qr;
    log.info("QR code received — scan it below or visit /qr in your browser:");
    console.log(""); // blank line for readability
    qrcodeTerminal.generate(qr, { small: true });
    console.log(""); // blank line after QR
  });

  // ── Authenticated ──
  client.on("authenticated", () => {
    log.info("══════════════════════════════════════════");
    log.info("  Client authenticated successfully");
    log.info("══════════════════════════════════════════");
    latestQR = null;

    // Fallback: verify session was saved within 10 seconds
    setTimeout(async () => {
      if (!sessionSavedToDB) {
        log.warn("remote_session_saved has NOT fired yet — checking MongoDB...");
        const { verifySessionInDB } = require("./store");
        const result = await verifySessionInDB();
        if (result.exists) {
          log.info("DB check: Session found in MongoDB ✓");
        } else {
          log.error("DB check: Session NOT found — RemoteAuth may have failed to save");
        }
      }
    }, 10000);
  });

  // ── Remote Session Saved ──
  client.on("remote_session_saved", () => {
    sessionSavedToDB = true;
    log.info("══════════════════════════════════════════");
    log.info("  Session saved to MongoDB Atlas ✓");
    log.info("══════════════════════════════════════════");
  });

  // ── Authentication Failure ──
  client.on("auth_failure", (message) => {
    log.error(`Authentication failed: ${message}`);
    isReady = false;
    sessionSavedToDB = false;
  });

  // ── Ready ──
  client.on("ready", () => {
    isReady = true;
    latestQR = null;
    log.info("Client is ready and connected — messages can be sent");
  });

  // ── Disconnected ──
  client.on("disconnected", (reason) => {
    isReady = false;
    log.warn(`Client disconnected: ${reason}`);
    log.info("Attempting to reconnect in 10 seconds...");

    setTimeout(async () => {
      try {
        await client.initialize();
        log.info("Reconnection initiated");
      } catch (err) {
        log.error(`Reconnection failed: ${err.message}`);
      }
    }, 10000);
  });

  await client.initialize();
}

// ─────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────

/**
 * Send a WhatsApp message.
 */
async function sendMessage(number, message) {
  if (!isReady) {
    throw new Error(
      "WhatsApp client is not ready. Scan the QR code in the terminal or visit /qr."
    );
  }

  const chatId = `${number}@c.us`;
  log.info(`Sending message to ${number}`);

  const response = await client.sendMessage(chatId, message);
  log.info(`Message sent to ${number} (id: ${response.id._serialized})`);

  return response;
}

function getStatus() {
  return isReady;
}

function getLatestQR() {
  return latestQR;
}

module.exports = {
  initialize,
  sendMessage,
  getStatus,
  getLatestQR,
};
