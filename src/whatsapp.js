/**
 * whatsapp.js — WhatsApp client with RemoteAuth, heartbeat, QR state,
 *               and resource blocking for cloud stability.
 *
 * PURPOSE:
 *   Core WhatsApp integration hardened for production cloud deployment:
 *
 *   1. RemoteAuth + MongoDB + /tmp: Session persists in Atlas. All temp
 *      files (RemoteAuth.zip, Puppeteer cache) write to /tmp to avoid
 *      ENOENT crashes on read-only cloud container filesystems.
 *
 *   2. Anti-idle heartbeat: Pings the browser page context every 15s
 *      to prevent cloud platforms from freezing the Chrome process.
 *
 *   3. Resource blocking: Intercepts and blocks stylesheets, images,
 *      fonts, and media from loading inside the headless browser,
 *      drastically reducing memory usage on free-tier hardware.
 *
 *   4. Cloud-optimized Puppeteer flags: Aggressively stripped for
 *      minimal RAM footprint on 512MB containers.
 */

const path = require("path");
const fs = require("fs");
const { Client, RemoteAuth } = require("whatsapp-web.js");
const { config } = require("./config");
const logger = require("./logger");

const log = logger.tagged("[WhatsApp Gateway]");
const hbLog = logger.tagged("[Heartbeat]");

/** @type {Client|null} */
let client = null;

/** Tracks whether the client is authenticated and ready */
let isReady = false;

/** Stores the latest QR code string for remote scanning */
let latestQR = null;

/** Reference to the heartbeat interval for cleanup */
let heartbeatInterval = null;

/**
 * Ensure the writable data directory exists.
 * On cloud containers, /tmp exists but /tmp/whatsapp-bridge might not.
 */
function ensureDataDir() {
  const dirs = [
    config.dataDir,
    path.join(config.dataDir, "puppeteer-cache"),
    path.join(config.dataDir, "session-data"),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log.info(`Created writable directory: ${dir}`);
    }
  }
}

/**
 * Initialize the WhatsApp client with RemoteAuth.
 * All temp/cache files are redirected to the writable data directory.
 *
 * @param {import('wwebjs-mongo').MongoStore} store — MongoStore instance
 * @returns {Promise<void>}
 */
async function initialize(store) {
  // ── Ensure writable directories ──
  ensureDataDir();

  // ── Delay before init ──
  // Prevents IndexedDB lock collisions that occur when the browser
  // starts too quickly after a container restart on cloud Linux.
  log.info("Waiting 3s before initialization to prevent IndexedDB lock collisions...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // ── Build Puppeteer args ──
  // Aggressively stripped for minimal RAM on free-tier containers.
  const puppeteerArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-web-security",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-translate",
    "--disable-domain-reliability",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-ipc-flooding-protection",
    "--no-first-run",
    "--no-zygote",
    "--single-process",
    "--disable-accelerated-2d-canvas",
    "--disable-software-rasterizer",
    "--metrics-recording-only",
    "--js-flags=--max-old-space-size=256",
  ];

  const puppeteerConfig = {
    headless: true,
    args: puppeteerArgs,
    // NOTE: Do NOT set userDataDir here — RemoteAuth is incompatible
    // with a user-supplied userDataDir. It manages its own session
    // directory internally via the dataPath option in RemoteAuth config.
  };

  // Use custom Chrome path if provided (for local dev),
  // otherwise let Puppeteer find the system Chromium (Docker installs it)
  if (config.chromePath) {
    puppeteerConfig.executablePath = config.chromePath;
    log.info(`Using Chrome at: ${config.chromePath}`);
  } else {
    log.info("Using system Chromium (auto-detected)");
  }

  log.info(`Data directory: ${config.dataDir}`);

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      // ═══════════════════════════════════════════════════════════
      // CRITICAL: backupSyncIntervalMs controls how quickly the
      // session is first saved to MongoDB after authentication.
      //
      // Previously set to 300000 (5 min), which meant the session
      // was NEVER saved if Railway recycled the container within
      // 5 minutes. Reduced to 60 seconds for aggressive persistence.
      // ═══════════════════════════════════════════════════════════
      backupSyncIntervalMs: 60000, // Save session to MongoDB every 60 seconds
      dataPath: path.join(config.dataDir, "session-data"),
    }),
    puppeteer: puppeteerConfig,
    webVersionCache: {
      type: "none",
    },
  });

  // Track whether the session has been saved to MongoDB
  let sessionSavedToDB = false;

  // ── QR Code Event ──
  client.on("qr", (qr) => {
    latestQR = qr;
    log.info("QR code received — visit /qr in your browser to scan remotely");
  });

  // ── Authenticated ──
  client.on("authenticated", () => {
    log.info("══════════════════════════════════════════");
    log.info("  AUTH EVENT FIRED — Client authenticated");
    log.info("══════════════════════════════════════════");
    log.info("Waiting for RemoteAuth to save session to MongoDB...");
    log.info(`backupSyncIntervalMs = 60000 (first save within ~60s)`);
    latestQR = null;

    // ── Fallback save verification timer ──
    // If remote_session_saved doesn't fire within 10 seconds of
    // the READY event, log an explicit warning so we can diagnose
    // whether MongoDB is actually receiving the session payload.
    setTimeout(async () => {
      if (!sessionSavedToDB) {
        log.warn("══════════════════════════════════════════════════════");
        log.warn("  WARNING: remote_session_saved has NOT fired yet!");
        log.warn("  The session may not have been written to MongoDB.");
        log.warn("══════════════════════════════════════════════════════");

        // Query MongoDB directly to check
        const { verifySessionInDB } = require("./store");
        const result = await verifySessionInDB();
        if (result.exists) {
          log.info("DB check: Session DOES exist in MongoDB (may have been saved by a previous run)");
        } else {
          log.error("DB check: Session does NOT exist in MongoDB!");
          log.error("RemoteAuth is failing to write the session. Possible causes:");
          log.error("  1. MongoDB Atlas network timeout or auth failure");
          log.error("  2. The whatsapp-sessions collection cannot be written to");
          log.error("  3. The dataPath directory is not writable for zip creation");
          log.error(`  4. Current dataPath: ${path.join(config.dataDir, "session-data")}`);
        }
      }
    }, 10000);
  });

  // ── Remote Session Saved ──
  // This is the CRITICAL event — it fires when RemoteAuth has
  // successfully compressed and uploaded the session to MongoDB.
  client.on("remote_session_saved", () => {
    sessionSavedToDB = true;
    log.info("══════════════════════════════════════════════════════");
    log.info("  SESSION SAVED — Token written to MongoDB Atlas ✓");
    log.info("══════════════════════════════════════════════════════");
    log.info("Session will persist across container restarts.");
  });

  // ── Authentication Failure ──
  client.on("auth_failure", (message) => {
    log.error("══════════════════════════════════════════");
    log.error("  AUTH FAILURE — Session was NOT saved");
    log.error(`  Reason: ${message}`);
    log.error("══════════════════════════════════════════");
    isReady = false;
    sessionSavedToDB = false;
  });

  // ── Ready ──
  client.on("ready", async () => {
    isReady = true;
    latestQR = null;
    log.info("Client is ready and connected");
    await enableResourceBlocking();
    startHeartbeat();
  });

  // ── Disconnected ──
  client.on("disconnected", (reason) => {
    isReady = false;
    stopHeartbeat();
    log.warn(`Client disconnected: ${reason}`);
    log.info("Attempting to reconnect in 10 seconds...");

    setTimeout(async () => {
      try {
        log.info("Reconnection attempt initiated...");
        await client.initialize();
        log.info("Reconnection attempt completed");
      } catch (err) {
        log.error(`Reconnection failed: ${err.message}`);
      }
    }, 10000);
  });

  log.info("Initializing client with RemoteAuth + /tmp workspace...");
  await client.initialize();
}

// ─────────────────────────────────────────────────────
// RESOURCE BLOCKING — Reduce memory on free-tier
// ─────────────────────────────────────────────────────

/**
 * Enable request interception to block heavy resources.
 *
 * Stops stylesheets, images, fonts, audio, and media from loading
 * in the headless browser. WhatsApp Web messaging works without
 * these resources, and blocking them can save 100-200MB of RAM
 * on free-tier containers.
 */
async function enableResourceBlocking() {
  try {
    if (!client || !client.pupPage) return;

    await client.pupPage.setRequestInterception(true);

    const BLOCKED_TYPES = new Set([
      "stylesheet",
      "image",
      "media",
      "font",
      "other",
    ]);

    client.pupPage.on("request", (request) => {
      if (BLOCKED_TYPES.has(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    log.info("Resource blocking enabled (stylesheets, images, fonts, media)");
  } catch (err) {
    log.warn(`Failed to enable resource blocking: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────
// ANTI-IDLE HEARTBEAT ENGINE
// ─────────────────────────────────────────────────────

/**
 * Start the heartbeat loop.
 * Pings the browser page context at a regular interval to prevent
 * cloud platforms from freezing the headless Chrome process.
 */
function startHeartbeat() {
  stopHeartbeat();

  heartbeatInterval = setInterval(async () => {
    try {
      if (client && client.pupPage) {
        const title = await client.pupPage.evaluate(() => document.title);
        hbLog.info(`Ping OK — page alive (title: "${title}")`);
      } else {
        hbLog.warn("No browser page available");
      }
    } catch (err) {
      hbLog.warn(`Ping failed: ${err.message}`);
    }
  }, config.heartbeatIntervalMs);

  hbLog.info(
    `Engine started (interval: ${config.heartbeatIntervalMs / 1000}s)`
  );
}

/**
 * Stop the heartbeat loop.
 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    hbLog.info("Engine stopped");
  }
}

// ─────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────

/**
 * Send a WhatsApp message.
 *
 * @param {string} number  — Phone number (digits only, international)
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
  log.info(`Sending message to ${number}`);

  const response = await client.sendMessage(chatId, message);
  log.info(`Message sent to ${number} (id: ${response.id._serialized})`);

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
