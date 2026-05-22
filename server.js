/**
 * server.js — Application entry point
 *
 * PURPOSE:
 *   Boots the entire application:
 *     1. Initializes the WhatsApp client (triggers QR code)
 *     2. Starts the Express HTTP server
 *     3. Registers graceful shutdown handlers
 *
 *   This file intentionally contains NO business logic.
 *   It only orchestrates startup and shutdown.
 */

const app = require("./src/app");
const config = require("./src/config/env");
const logger = require("./src/utils/logger");
const whatsappService = require("./src/services/whatsappService");

async function startServer() {
  try {
    // ── Step 1: Initialize WhatsApp Client ──
    logger.info("Initializing WhatsApp client...");
    logger.info("A QR code will appear below — scan it with WhatsApp on your phone.");
    await whatsappService.initialize();

    // ── Step 2: Start HTTP Server ──
    app.listen(config.port, () => {
      logger.info(`Server running on http://localhost:${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info("Endpoints:");
      logger.info(`  POST http://localhost:${config.port}/send-message`);
      logger.info(`  GET  http://localhost:${config.port}/status`);
      logger.info(`  GET  http://localhost:${config.port}/health`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// ── Graceful Shutdown ──
// Ensures clean disconnection on SIGINT (Ctrl+C) and SIGTERM
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

startServer();
