/**
 * bridge.js — Application entry point (cloud-ready)
 *
 * PURPOSE:
 *   Boots the entire application in the correct order:
 *     1. Validates environment variables
 *     2. Connects to MongoDB Atlas
 *     3. Initializes WhatsApp client with RemoteAuth
 *     4. Starts the Express HTTP server
 *     5. Registers graceful shutdown handlers
 *
 *   This file contains NO business logic — only orchestration.
 *
 * DEPLOYMENT:
 *   Works on Render, Railway, Fly.io, or any Docker host.
 *   Set environment variables in the cloud provider's dashboard:
 *     MONGODB_URI, BOT_API_KEY, PORT (auto-set by most platforms)
 */

const express = require("express");
const { config, validateConfig } = require("./src/config");
const logger = require("./src/logger");
const { connectAndCreateStore } = require("./src/store");
const whatsapp = require("./src/whatsapp");
const routes = require("./src/routes");

async function start() {
  try {
    // ── Step 1: Validate config ──
    logger.info("Validating environment configuration...");
    validateConfig();
    logger.info("Configuration OK");

    // ── Step 2: Connect to MongoDB ──
    const store = await connectAndCreateStore();

    // ── Step 3: Initialize WhatsApp with RemoteAuth ──
    // This runs in the background — the HTTP server starts immediately
    // so the /qr endpoint is available for scanning even while the
    // client is still initializing.
    const whatsappReady = whatsapp.initialize(store);

    // ── Step 4: Start Express server ──
    const app = express();

    app.use(express.json());

    // Request logger
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
      });
      next();
    });

    // Mount routes
    app.use("/", routes);

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`,
      });
    });

    // Global error handler
    app.use((err, req, res, _next) => {
      logger.error(`Unhandled error: ${err.message}`);
      res.status(500).json({ success: false, error: "Internal server error" });
    });

    app.listen(config.port, "0.0.0.0", () => {
      logger.info("═══════════════════════════════════════════");
      logger.info("  WhatsApp Cloud Bridge — ONLINE");
      logger.info("═══════════════════════════════════════════");
      logger.info(`  Server:   http://0.0.0.0:${config.port}`);
      logger.info(`  Env:      ${config.nodeEnv}`);
      logger.info("  Endpoints:");
      logger.info(`    POST /send-message  (API key required)`);
      logger.info(`    GET  /qr            (remote QR scanning)`);
      logger.info(`    GET  /status        (connection check)`);
      logger.info(`    GET  /health        (server health)`);
      logger.info("═══════════════════════════════════════════");
    });

    // Wait for WhatsApp initialization to complete
    await whatsappReady;
  } catch (error) {
    logger.error(`Fatal startup error: ${error.message}`);
    process.exit(1);
  }
}

// ── Graceful Shutdown ──
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

start();
