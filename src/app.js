/**
 * app.js — Express application factory
 *
 * PURPOSE:
 *   Creates and configures the Express app instance with all
 *   middleware (JSON parsing, request logging) and routes mounted.
 *   This is separated from server.js so the app can be imported
 *   independently for testing without starting the HTTP server.
 */

const express = require("express");
const logger = require("./utils/logger");
const messageRoutes = require("./routes/messageRoutes");

const app = express();

// ── Global Middleware ──
app.use(express.json());

// ── Request Logger ──
// Logs every incoming request (method, URL, status, duration)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ── Health Check ──
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// ── API Routes ──
app.use("/", messageRoutes);

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Global Error Handler ──
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

module.exports = app;
