/**
 * routes.js — Express HTTP endpoints
 *
 * POST /send-message  — Send a WhatsApp message (API key required)
 * GET  /qr            — Render QR code as a scannable HTML page
 * GET  /status        — Client connection status (no DB calls)
 * GET  /health        — Server health check
 */

const { Router } = require("express");
const QRCode = require("qrcode");
const whatsapp = require("./whatsapp");
const { authenticateApiKey, validateMessage } = require("./middleware");
const logger = require("./logger");

const log = logger.tagged("[HTTP Server]");
const router = Router();

// ── POST /send-message ──
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
      log.error(`Send failed: ${error.message}`);
      const statusCode = error.message.includes("not ready") ? 503 : 500;
      return res.status(statusCode).json({ success: false, error: error.message });
    }
  }
);

// ── GET /qr ──
router.get("/qr", async (req, res) => {
  const qrString = whatsapp.getLatestQR();

  if (!qrString) {
    const ready = whatsapp.getStatus();
    const statusMessage = ready
      ? "WhatsApp is already authenticated. No QR code needed."
      : "No QR code available yet — client is still initializing. Refresh in a few seconds.";

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bridge — QR</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #111b21; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
          .card { background: #1f2c34; border-radius: 16px; padding: 40px; max-width: 420px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
          h1 { font-size: 22px; margin-bottom: 12px; color: #25d366; }
          p { font-size: 15px; color: #8696a0; line-height: 1.5; }
          .badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-top: 16px; }
          .badge.ok { background: #25d366; color: #111b21; }
          .badge.wait { background: #f7c948; color: #111b21; }
        </style>
        <meta http-equiv="refresh" content="5">
      </head>
      <body>
        <div class="card">
          <h1>WhatsApp Bridge</h1>
          <p>${statusMessage}</p>
          <span class="badge ${ready ? "ok" : "wait"}">${ready ? "✓ Connected" : "⏳ Waiting"}</span>
          <p style="margin-top:20px;font-size:13px;color:#667781">Auto-refreshes every 5 seconds.</p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    const qrImageDataUrl = await QRCode.toDataURL(qrString, {
      width: 320, margin: 2, color: { dark: "#111b21", light: "#ffffff" },
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
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #111b21; color: #e9edef; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
          .card { background: #1f2c34; border-radius: 16px; padding: 32px; max-width: 420px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
          h1 { font-size: 22px; margin-bottom: 8px; color: #25d366; }
          p { font-size: 14px; color: #8696a0; line-height: 1.5; margin-bottom: 20px; }
          img { border-radius: 12px; width: 280px; height: 280px; background: #fff; padding: 8px; }
          .steps { text-align: left; margin-top: 20px; font-size: 13px; color: #8696a0; line-height: 1.8; }
          .steps strong { color: #e9edef; }
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
            1. Open WhatsApp → <strong>Linked Devices</strong><br>
            2. Tap <strong>Link a Device</strong><br>
            3. Point camera at this QR code
          </div>
          <p style="margin-top:16px;font-size:12px;color:#667781">Auto-refreshes every 15 seconds.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    log.error(`QR generation failed: ${err.message}`);
    return res.status(500).json({ success: false, error: "Failed to generate QR code." });
  }
});

// ── GET /status — Simple ready check, no database calls ──
router.get("/status", (req, res) => {
  const ready = whatsapp.getStatus();
  return res.status(200).json({
    success: true,
    ready,
    message: ready
      ? "WhatsApp client is connected and ready."
      : "WhatsApp client is NOT ready. Scan the QR code in the terminal or visit /qr.",
  });
});

// ── GET /health ──
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    whatsappReady: whatsapp.getStatus(),
  });
});

module.exports = router;
