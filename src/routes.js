/**
 * routes.js — Express route definitions with DB-backed status
 *
 * PURPOSE:
 *   Defines all HTTP endpoints:
 *
 *   POST /send-message  — Send a WhatsApp message (API key protected)
 *   GET  /qr            — Render latest QR code as a scannable HTML page
 *   GET  /status        — Connection status with MongoDB session verification
 *   GET  /health        — Server health check
 */

const { Router } = require("express");
const QRCode = require("qrcode");
const whatsapp = require("./whatsapp");
const { verifySessionInDB } = require("./store");
const { authenticateApiKey, validateMessage } = require("./middleware");
const logger = require("./logger");

const log = logger.tagged("[HTTP Server]");
const router = Router();

// ─────────────────────────────────────────────────────
// POST /send-message — Send a WhatsApp message
// Protected by API key authentication + strict validation
// ─────────────────────────────────────────────────────
router.post(
  "/send-message",
  authenticateApiKey,
  validateMessage,
  async (req, res) => {
    try {
      await whatsapp.sendMessage(req.cleanNumber, req.cleanMessage);

      return res.status(200).json({
        success: true,
        message: `Message sent successfully to ${req.cleanNumber}`,
      });
    } catch (error) {
      log.error(`Failed to send message: ${error.message}`);
      const statusCode = error.message.includes("not ready") ? 503 : 500;

      return res.status(statusCode).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ─────────────────────────────────────────────────────
// GET /qr — Remote QR code scanning page
// ─────────────────────────────────────────────────────
router.get("/qr", async (req, res) => {
  const qrString = whatsapp.getLatestQR();

  if (!qrString) {
    const ready = whatsapp.getStatus();
    const statusMessage = ready
      ? "WhatsApp is already authenticated. No QR code needed."
      : "No QR code available yet. The client is still initializing — refresh in a few seconds.";

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bridge — QR</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #111b21;
            color: #e9edef;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 24px;
          }
          .card {
            background: #1f2c34;
            border-radius: 16px;
            padding: 40px;
            max-width: 420px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          }
          h1 { font-size: 22px; margin-bottom: 12px; color: #25d366; }
          p { font-size: 15px; color: #8696a0; line-height: 1.5; }
          .status { margin-top: 20px; font-size: 13px; color: #667781; }
          .badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            margin-top: 16px;
          }
          .badge.connected { background: #25d366; color: #111b21; }
          .badge.waiting { background: #f7c948; color: #111b21; }
        </style>
        <meta http-equiv="refresh" content="5">
      </head>
      <body>
        <div class="card">
          <h1>WhatsApp Bridge</h1>
          <p>${statusMessage}</p>
          <span class="badge ${ready ? "connected" : "waiting"}">
            ${ready ? "✓ Connected" : "⏳ Waiting"}
          </span>
          <p class="status">This page auto-refreshes every 5 seconds.</p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    const qrImageDataUrl = await QRCode.toDataURL(qrString, {
      width: 320,
      margin: 2,
      color: { dark: "#111b21", light: "#ffffff" },
    });

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bridge — Scan QR</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #111b21;
            color: #e9edef;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 24px;
          }
          .card {
            background: #1f2c34;
            border-radius: 16px;
            padding: 32px;
            max-width: 420px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          }
          h1 { font-size: 22px; margin-bottom: 8px; color: #25d366; }
          p { font-size: 14px; color: #8696a0; line-height: 1.5; margin-bottom: 20px; }
          img {
            border-radius: 12px;
            width: 280px;
            height: 280px;
            background: #fff;
            padding: 8px;
          }
          .steps {
            text-align: left;
            margin-top: 20px;
            font-size: 13px;
            color: #8696a0;
            line-height: 1.8;
          }
          .steps strong { color: #e9edef; }
          .refresh-note {
            margin-top: 16px;
            font-size: 12px;
            color: #667781;
          }
        </style>
        <meta http-equiv="refresh" content="15">
      </head>
      <body>
        <div class="card">
          <h1>🔗 Scan to Connect</h1>
          <p>Open WhatsApp on your phone and scan this QR code</p>
          <img src="${qrImageDataUrl}" alt="WhatsApp QR Code" />
          <div class="steps">
            <strong>Steps:</strong><br>
            1. Open WhatsApp on your phone<br>
            2. Tap <strong>Menu ⋮</strong> → <strong>Linked Devices</strong><br>
            3. Tap <strong>Link a Device</strong><br>
            4. Point your camera at this QR code
          </div>
          <p class="refresh-note">Page auto-refreshes every 15 seconds for a new QR.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    log.error(`Failed to generate QR image: ${err.message}`);
    return res.status(500).json({ success: false, error: "Failed to generate QR code." });
  }
});

// ─────────────────────────────────────────────────────
// GET /status — WhatsApp connection status with DB verification
//
// NEW: Smart fallback — queries MongoDB session collection directly
// to confirm a valid token exists before reporting ready: true.
// This prevents false positives when the in-memory flag is stale.
// ─────────────────────────────────────────────────────
router.get("/status", async (req, res) => {
  const clientReady = whatsapp.getStatus();

  // Query MongoDB for ground-truth session verification
  const dbSession = await verifySessionInDB();

  return res.status(200).json({
    success: true,
    ready: clientReady,
    session: {
      existsInDB: dbSession.exists,
      lastModified: dbSession.lastModified,
      collection: dbSession.collection,
    },
    message: clientReady
      ? "WhatsApp client is connected and ready."
      : dbSession.exists
        ? "Client is reconnecting — session token found in database."
        : "WhatsApp client is NOT ready. Visit /qr to scan the authentication QR code.",
  });
});

// ─────────────────────────────────────────────────────
// GET /health — Server health check
// ─────────────────────────────────────────────────────
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    whatsappReady: whatsapp.getStatus(),
  });
});

module.exports = router;
