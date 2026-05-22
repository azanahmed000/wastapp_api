/**
 * messageController.js — Business logic for message endpoints
 *
 * PURPOSE:
 *   Handles the POST /send-message request. By the time a request
 *   reaches here, validation has already passed (via middleware).
 *   This controller normalizes the phone number if needed, calls
 *   the WhatsApp service to dispatch the message, and returns a
 *   structured JSON response.
 */

const whatsappService = require("../services/whatsappService");
const config = require("../config/env");
const logger = require("../utils/logger");

/**
 * POST /send-message
 *
 * Sends a WhatsApp message to the given phone number.
 *
 * Expects cleaned data on req.cleanNumber and req.cleanMessage
 * (set by the validateMessage middleware).
 */
async function sendMessage(req, res) {
  try {
    let number = req.cleanNumber;
    const message = req.cleanMessage;

    // ── Normalize local numbers ──
    // If the number starts with '0' (local format like 03001234567),
    // strip the leading zero and prepend the default country code.
    if (number.startsWith("0")) {
      number = config.defaultCountryCode + number.slice(1);
      logger.info(`Normalized local number to international format: ${number}`);
    }

    await whatsappService.sendMessage(number, message);

    return res.status(200).json({
      success: true,
      message: `Message sent successfully to ${number}`,
    });
  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);

    // Differentiate between "not ready" errors and unexpected failures
    const statusCode = error.message.includes("not ready") ? 503 : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * GET /status
 *
 * Returns the current WhatsApp client connection status.
 */
async function getStatus(req, res) {
  const ready = whatsappService.getStatus();

  return res.status(200).json({
    success: true,
    ready,
    message: ready
      ? "WhatsApp client is connected and ready."
      : "WhatsApp client is NOT ready. Please scan the QR code in the terminal.",
  });
}

module.exports = {
  sendMessage,
  getStatus,
};
