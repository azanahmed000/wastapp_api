/**
 * store.js — MongoDB connection & session store
 *
 * PURPOSE:
 *   Manages the Mongoose connection to MongoDB Atlas and creates
 *   the MongoStore instance used by whatsapp-web.js RemoteAuth.
 *
 *   RemoteAuth stores the entire browser session (cookies, tokens,
 *   IndexedDB data) in MongoDB instead of the local filesystem.
 *   This means the session survives container restarts, redeploys,
 *   and even moving to a completely different server.
 */

const mongoose = require("mongoose");
const { MongoStore } = require("wwebjs-mongo");
const { config } = require("./config");
const logger = require("./logger");

/** @type {MongoStore|null} */
let store = null;

/**
 * Connect to MongoDB Atlas and initialize the session store.
 *
 * @returns {Promise<MongoStore>} The MongoStore instance for RemoteAuth
 */
async function connectAndCreateStore() {
  logger.info("Connecting to MongoDB Atlas...");

  await mongoose.connect(config.mongodbUri);

  logger.info("MongoDB connected successfully");

  // MongoStore wraps mongoose.connection to provide the interface
  // that RemoteAuth expects for saving/loading session data.
  store = new MongoStore({ mongoose });

  return store;
}

/**
 * Get the current MongoStore instance.
 *
 * @returns {MongoStore|null}
 */
function getStore() {
  return store;
}

module.exports = { connectAndCreateStore, getStore };
