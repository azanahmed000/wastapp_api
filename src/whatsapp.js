/**
 * whatsapp.js — WhatsApp client with RemoteAuth, heartbeat, and QR state
 *
 * PURPOSE:
 *   Core WhatsApp integration rewritten for cloud deployment:
 *
 *   1. RemoteAuth + MongoDB: Session persists in Atlas, survives
 *      container restarts and redeployments without re-scanning QR.
 *
 *   2. Anti-idle heartbeat: Pings the browser page context every
 *      15 seconds to prevent cloud platforms from freezing or
 *      killing the headless Chrome process during idle periods.
 *
 *   3. QR state management: Stores the latest QR string in memory
 *      so it can be served via HTTP for remote scanning from any
 *      device, anywhere in the world.
 *
 *   4. Cloud-optimized Puppeteer flags: Minimizes memory usage and
 *      prevents crashes on free-tier hardware (512MB RAM).
 */

const { Client, RemoteAuth } = require("whatsapp-web.js");
const { config } = require("./config");
const logger = require("./logger");

/** @type {Client|null} */
let client = null;

/** Tracks whether the client is authenticated and ready */
let isReady = false;

/** Stores the latest QR code string for remote scanning */
let latestQR = null;

/** Reference to the heartbeat interval for cleanup */
let heartbeatInterval = null;

/**
 * Initialize the WhatsApp client with RemoteAuth.
 *
 * @param {import('wwebjs-mongo').MongoStore} store — MongoStore instance
 * @returns {Promise<void>}
 */
async function initialize(store) {
  // ── Delay before init ──
  // Prevents IndexedDB lock collisions that occur when the browser
  // starts too quickly after a container restart on cloud Linux.
  logger.info("Waiting 3s before initialization to prevent IndexedDB lock collisions...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // ── Build Puppeteer args ──
  // These flags are critical for running headless Chromium on
  // free-tier cloud containers with limited memory and no GPU.
  const puppeteerArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-web-security",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--no-first-run",
    "--no-zygote",
    "--single-process",
    "--disable-accelerated-2d-canvas",
    "--js-flags=--max-old-space-size=256",
  ];

  const puppeteerConfig = {
    headless: true,
    args: puppeteerArgs,
  };

  // Use custom Chrome path if provided (for local dev),
  // otherwise let Puppeteer find the system Chromium (Docker installs it)
  if (config.chromePath) {
    puppeteerConfig.executablePath = config.chromePath;
    logger.info(`Using Chrome at: ${config.chromePath}`);
  } else {
    logger.info("Using system Chromium (auto-detected)");
  }

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      backupSyncIntervalMs: 300000, // Backup session to MongoDB every 5 minutes
    }),
    puppeteer: puppeteerConfig,
  });

  // ── QR Code Event ──
  // Fires when authentication is needed. Store the QR string
  // in memory so the /qr HTTP endpoint can render it.
  client.on("qr", (qr) => {
    latestQR = qr;
    logger.info("QR code received — visit /qr in your browser to scan remotely");
  });

  // ── Authenticated ──
  client.on("authenticated", () => {
    logger.info("WhatsApp client authenticated successfully");
    latestQR = null; // Clear QR once authenticated
  });

  // ── Remote Session Saved ──
  // Fires when RemoteAuth successfully saves the session to MongoDB.
  // This is critical — without handling this event, the session
  // won't persist across container restarts.
  client.on("remote_session_saved", () => {
    logger.info("Remote session saved to MongoDB successfully");
  });

  // ── Authentication Failure ──
  client.on("auth_failure", (message) => {
    logger.error(`WhatsApp authentication failed: ${message}`);
    isReady = false;
  });

  // ── Ready ──
  client.on("ready", () => {
    isReady = true;
    latestQR = null;
    logger.info("WhatsApp client is ready and connected");
    startHeartbeat();
  });

  // ── Disconnected ──
  client.on("disconnected", (reason) => {
    isReady = false;
    stopHeartbeat();
    logger.warn(`WhatsApp client disconnected: ${reason}`);
    logger.info("Attempting to reconnect in 10 seconds...");

    // Auto-reconnect after a brief delay
    setTimeout(async () => {
      try {
        await client.initialize();
        logger.info("Reconnection attempt initiated");
      } catch (err) {
        logger.error(`Reconnection failed: ${err.message}`);
      }
    }, 10000);
  });

  logger.info("Initializing WhatsApp client with RemoteAuth...");
  await client.initialize();
}

// ─────────────────────────────────────────────────────
// ANTI-IDLE HEARTBEAT ENGINE
// ─────────────────────────────────────────────────────

/**
 * Start the heartbeat loop.
 *
 * Pings the browser page context at a regular interval to
 * prevent cloud platforms (Render, Railway) from freezing
 * the headless Chrome process during idle periods.
 *
 * Without this, the browser session dies after ~5-15 minutes
 * of inactivity on most free-tier cloud services.
 */
function startHeartbeat() {
  stopHeartbeat(); // Clear any existing interval

  heartbeatInterval = setInterval(async () => {
    try {
      if (client && client.pupPage) {
        // Evaluate a trivial expression in the browser context
        // to keep the page alive and prevent idle timeout
        await client.pupPage.evaluate(() => {
          return document.title;
        });
        logger.info("Heartbeat: browser page is alive");
      }
    } catch (err) {
      logger.warn(`Heartbeat failed: ${err.message}`);
    }
  }, config.heartbeatIntervalMs);

  logger.info(
    `Heartbeat engine started (interval: ${config.heartbeatIntervalMs / 1000}s)`
  );
}

/**
 * Stop the heartbeat loop.
 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    logger.info("Heartbeat engine stopped");
  }
}

// ─────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────

/**
 * Send a WhatsApp message.
 *
 * @param {string} number  — Phone number in international format (digits only)
 * @param {string} message — Text content to send
 * @returns {Promise<object>} — whatsapp-web.js message response
 */
async function sendMessage(number, message) {
  if (!isReady) {
    throw new Error(
      "WhatsApp client is not ready. Visit /qr to scan the authentication QR code."
    );
  }

  const chatId = `${number}@c.us`;
  logger.info(`Sending message to ${number}`);

  const response = await client.sendMessage(chatId, message);
  logger.info(`Message sent to ${number} (id: ${response.id._serialized})`);

  return response;
}

/** @returns {boolean} Whether the client is connected and ready */
function getStatus() {
  return isReady;
}

/** @returns {string|null} Latest QR string, or null if already authenticated */
function getLatestQR() {
  return latestQR;
}

module.exports = {
  initialize,
  sendMessage,
  getStatus,
  getLatestQR,
};
