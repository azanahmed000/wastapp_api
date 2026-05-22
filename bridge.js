/**
 * bridge.js — Application entry point (cloud-hardened)
 *
 * PURPOSE:
 *   Boots the entire application in the correct order:
 *     1. Registers process lifecycle handlers (MUST be first)
 *     2. Validates environment variables
 *     3. Connects to MongoDB Atlas
 *     4. Initializes WhatsApp client with RemoteAuth
 *     5. Starts the Express HTTP server
 *
 *   STABILITY:
 *     Global uncaughtException and unhandledRejection handlers
 *     prevent unexpected errors from hard-crashing the container.
 *     The process logs the error and continues running instead of
 *     triggering an immediate restart loop.
 *
 *   This file contains NO business logic — only orchestration.
 */

const express = require("express");
const { config, validateConfig } = require("./src/config");
const logger = require("./src/logger");
const { connectAndCreateStore } = require("./src/store");
const whatsapp = require("./src/whatsapp");
const routes = require("./src/routes");

const log = logger.tagged("[Bridge]");

// ═══════════════════════════════════════════════════════════
// PROCESS LIFECYCLE HANDLERS — Must be registered FIRST
//
// These prevent the Node.js process from hard-crashing on
// unexpected errors. On cloud containers, a crash triggers a
// restart, which triggers a new QR scan, which creates a
// crash loop. By catching these globally, we log the error
// and keep the process alive.
// ═══════════════════════════════════════════════════════════

process.on("uncaughtException", (err) => {
  log.error(`Uncaught Exception (process survived): ${err.message}`);
  if (err.stack) {
    log.error(`Stack trace:\n${err.stack}`);
  }
  // DO NOT call process.exit() — let the process continue
});

process.on("unhandledRejection", (reason, promise) => {
  const message =
    reason instanceof Error ? reason.message : String(reason);
  log.error(`Unhandled Rejection (process survived): ${message}`);
  if (reason instanceof Error && reason.stack) {
    log.error(`Stack trace:\n${reason.stack}`);
  }
  // DO NOT call process.exit() — let the process continue
});

// Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM (cloud stop)
process.on("SIGINT", () => {
  log.info("SIGINT received — shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log.info("SIGTERM received — shutting down gracefully...");
  process.exit(0);
});

// ═══════════════════════════════════════════════════════════
// APPLICATION STARTUP
// ═══════════════════════════════════════════════════════════

async function start() {
  try {
    // ── Step 1: Validate config ──
    log.info("Validating environment configuration...");
    validateConfig();
    log.info("Configuration OK");
    log.info(`Data directory: ${config.dataDir}`);

    // ── Step 2: Connect to MongoDB ──
    const store = await connectAndCreateStore();

    // ── Step 3: Start Express server FIRST ──
    // The HTTP server starts before WhatsApp so the /qr endpoint
    // is immediately available for scanning during initialization.
    const app = express();

    app.use(express.json());

    // Request logger with structured tags
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - start;
        log.info(
          `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
        );
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

    // Global Express error handler
    app.use((err, req, res, _next) => {
      log.error(`Express error: ${err.message}`);
      res.status(500).json({ success: false, error: "Internal server error" });
    });

    app.listen(config.port, "0.0.0.0", () => {
      log.info("═══════════════════════════════════════════════");
      log.info("  WhatsApp Cloud Bridge — ONLINE");
      log.info("═══════════════════════════════════════════════");
      log.info(`  Server:    http://0.0.0.0:${config.port}`);
      log.info(`  Env:       ${config.nodeEnv}`);
      log.info(`  Data dir:  ${config.dataDir}`);
      log.info("  Endpoints:");
      log.info("    POST /send-message  (API key required)");
      log.info("    GET  /qr            (remote QR scanning)");
      log.info("    GET  /status        (DB-verified status)");
      log.info("    GET  /health        (server health + memory)");
      log.info("═══════════════════════════════════════════════");
    });

    // ── Step 4: Initialize WhatsApp (non-blocking) ──
    // Runs after the HTTP server so /qr is available during init.
    await whatsapp.initialize(store);
  } catch (error) {
    log.error(`Fatal startup error: ${error.message}`);
    if (error.stack) {
      log.error(`Stack trace:\n${error.stack}`);
    }
    process.exit(1);
  }
}

start();
