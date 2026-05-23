/**
 * bridge.js — Application entry point (local execution)
 *
 * PURPOSE:
 *   Single-command startup: `npm start`
 *
 *   Boot sequence:
 *     1. Register process handlers (prevent crashes)
 *     2. Validate .env configuration
 *     3. Connect to MongoDB Atlas
 *     4. Start Express HTTP server
 *     5. Initialize WhatsApp client (QR prints in terminal)
 */

const express = require("express");
const { config, validateConfig } = require("./src/config");
const logger = require("./src/logger");
const { connectAndCreateStore } = require("./src/store");
const whatsapp = require("./src/whatsapp");
const routes = require("./src/routes");

const log = logger.tagged("[Bridge]");

// ── Process lifecycle handlers ──
process.on("uncaughtException", (err) => {
  log.error(`Uncaught Exception: ${err.message}`);
  if (err.stack) log.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log.error(`Unhandled Rejection: ${msg}`);
});

process.on("SIGINT", () => {
  log.info("SIGINT — shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log.info("SIGTERM — shutting down...");
  process.exit(0);
});

// ── Application startup ──
async function start() {
  try {
    // Step 1: Validate config
    log.info("Validating .env configuration...");
    validateConfig();
    log.info("Configuration OK");

    // Step 2: Connect to MongoDB
    const store = await connectAndCreateStore();

    // Step 3: Start Express (so /qr is available immediately)
    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      const startTime = Date.now();
      res.on("finish", () => {
        log.info(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startTime}ms)`);
      });
      next();
    });

    app.use("/", routes);

    app.use((req, res) => {
      res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.originalUrl}` });
    });

    app.use((err, req, res, _next) => {
      log.error(`Express error: ${err.message}`);
      res.status(500).json({ success: false, error: "Internal server error" });
    });

    app.listen(config.port, () => {
      log.info("═══════════════════════════════════════════");
      log.info("  WhatsApp Local Bridge — ONLINE");
      log.info("═══════════════════════════════════════════");
      log.info(`  Server:  http://localhost:${config.port}`);
      log.info(`  Env:     ${config.nodeEnv}`);
      log.info("  Endpoints:");
      log.info("    POST /send-message  (API key required)");
      log.info("    GET  /qr            (browser QR scan)");
      log.info("    GET  /status        (connection check)");
      log.info("    GET  /health        (server health)");
      log.info("═══════════════════════════════════════════");
    });

    // Step 4: Initialize WhatsApp (QR prints in terminal)
    await whatsapp.initialize(store);
  } catch (error) {
    log.error(`Fatal startup error: ${error.message}`);
    if (error.stack) log.error(error.stack);
    process.exit(1);
  }
}

start();
