/**
 * store.js — MongoDB connection & session store with verification
 *
 * PURPOSE:
 *   Manages the Mongoose connection to MongoDB Atlas and creates
 *   the MongoStore instance used by whatsapp-web.js RemoteAuth.
 *
 *   NEW: Exports verifySessionInDB() which queries the MongoDB
 *   session collection directly to confirm a valid token exists.
 *   Used by the /status endpoint for dynamic database re-verification
 *   before reporting ready: true.
 */

const mongoose = require("mongoose");
const { MongoStore } = require("wwebjs-mongo");
const { config } = require("./config");
const logger = require("./logger");

const log = logger.tagged("[Database Connection]");

/** @type {MongoStore|null} */
let store = null;

/**
 * Connect to MongoDB Atlas and initialize the session store.
 *
 * @returns {Promise<MongoStore>} The MongoStore instance for RemoteAuth
 */
async function connectAndCreateStore() {
  log.info("Connecting to MongoDB Atlas...");

  await mongoose.connect(config.mongodbUri);

  log.info("MongoDB connected successfully");
  log.info(`Database: ${mongoose.connection.name}`);
  log.info(`Host: ${mongoose.connection.host}`);

  // MongoStore wraps mongoose.connection to provide the interface
  // that RemoteAuth expects for saving/loading session data.
  store = new MongoStore({ mongoose });
  log.info("MongoStore initialized for RemoteAuth");

  return store;
}

/**
 * Verify that a valid session token exists in MongoDB.
 *
 * Queries the whatsapp-RemoteAuth-default session collection
 * directly to check if an authenticated session record is present.
 * This provides a ground-truth check beyond the in-memory isReady flag.
 *
 * @returns {Promise<{exists: boolean, lastModified: Date|null}>}
 */
async function verifySessionInDB() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      log.warn("MongoDB not connected — cannot verify session");
      return { exists: false, lastModified: null };
    }

    const db = mongoose.connection.db;

    // List collections to find the RemoteAuth session collection
    const collections = await db
      .listCollections({ name: /remoteauth/i })
      .toArray();

    if (collections.length === 0) {
      log.info("No RemoteAuth session collection found in database");
      return { exists: false, lastModified: null };
    }

    // Query the first RemoteAuth collection for a session document
    const collectionName = collections[0].name;
    const session = await db
      .collection(collectionName)
      .findOne({}, { sort: { _id: -1 } });

    if (session) {
      const lastModified = session.updatedAt || session.createdAt || null;
      log.info(
        `Session token found in ${collectionName} (last modified: ${lastModified})`
      );
      return { exists: true, lastModified };
    }

    log.info(`No session documents in ${collectionName}`);
    return { exists: false, lastModified: null };
  } catch (err) {
    log.error(`Session verification failed: ${err.message}`);
    return { exists: false, lastModified: null };
  }
}

/**
 * Get the current MongoStore instance.
 *
 * @returns {MongoStore|null}
 */
function getStore() {
  return store;
}

module.exports = { connectAndCreateStore, getStore, verifySessionInDB };
