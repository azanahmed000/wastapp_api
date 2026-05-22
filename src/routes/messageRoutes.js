/**
 * messageRoutes.js — Route definitions for message endpoints
 *
 * PURPOSE:
 *   Maps HTTP methods and paths to their corresponding
 *   controller functions, with validation middleware applied.
 *   Keeps routing declarations separate from business logic.
 */

const { Router } = require("express");
const messageController = require("../controllers/messageController");
const validateMessage = require("../middlewares/validateMessage");

const router = Router();

/**
 * POST /send-message
 * Send a WhatsApp message to a phone number.
 *
 * Body: { "number": "+923001234567", "message": "Welcome to AI Society" }
 * Response: { "success": true, "message": "..." }
 */
router.post("/send-message", validateMessage, messageController.sendMessage);

/**
 * GET /status
 * Check if the WhatsApp client is connected and ready.
 *
 * Response: { "success": true, "ready": true/false, "message": "..." }
 */
router.get("/status", messageController.getStatus);

module.exports = router;
