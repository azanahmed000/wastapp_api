/**
 * whatsapp.js — WhatsApp client with LocalAuth (file-based sessions)
 *
 * Session tokens are saved to .wwebjs_auth/ on the local hard drive.
 * No database, no cloud — survives restarts as long as the folder exists.
 */

const path = require("path");
const fs = require("fs");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const { config } = require("./config");
const logger = require("./logger");

const log = logger.tagged("[WhatsApp Gateway]");

/** @type {Client|null} */
let client = null;

/** Whether the client is authenticated and ready to send messages */
let isReady = false;

/** Latest QR string for the /qr HTTP endpoint */
let latestQR = null;

/**
 * Initialize the WhatsApp client with LocalAuth.
 * Session data is saved to .wwebjs_auth/session-my-stable-session/
 *
 * @returns {Promise<void>}
 */
async function initialize() {
  const dataPath = path.join(__dirname, "../.wwebjs_auth");
  const sessionPath = path.join(dataPath, "session-my-stable-session");

  log.info(`Checking session folder at: ${sessionPath}`);
  if (fs.existsSync(sessionPath)) {
    log.info(`Existing session files detected at ${sessionPath}. Restoring session...`);
  } else {
    log.info(`No existing session files found. Initiating new login QR generation...`);
  }

  log.info("Initializing WhatsApp client with LocalAuth...");
  log.info(`Chrome: ${config.chromePath}`);
  log.info(`Using session directory: ${sessionPath}`);

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "my-stable-session",
      dataPath: dataPath,
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

  // ── Loading Screen ──
  client.on("loading_screen", (percent, message) => {
    log.info(`Loading screen: ${percent}% - ${message}`);
  });

  // ── State Change ──
  client.on("change_state", (state) => {
    log.info(`State changed to: ${state}`);
  });

  // ── QR Code ──
  // Prints directly in the terminal for instant scanning.
  client.on("qr", (qr) => {
    latestQR = qr;
    log.info("QR code received — scan it below or visit http://localhost:3000/qr");
    console.log("");
    qrcodeTerminal.generate(qr, { small: true });
    console.log("");
  });

  // ── Authenticated ──
  client.on("authenticated", () => {
    log.info("══════════════════════════════════════════");
    log.info("  Client authenticated — session saved to disk");
    log.info("══════════════════════════════════════════");
    latestQR = null;
  });

  // ── Auth failure ──
  client.on("auth_failure", (message) => {
    log.error(`Authentication failed: ${message}`);
    isReady = false;
  });

  // ── Ready ──
  client.on("ready", () => {
    isReady = true;
    latestQR = null;
    log.info("══════════════════════════════════════════");
    log.info("  Client READY — messages can be sent");
    log.info("══════════════════════════════════════════");
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

module.exports = { initialize, sendMessage, getStatus, getLatestQR };
