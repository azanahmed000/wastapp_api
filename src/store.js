/**
 * store.js — MongoDB connection & session store
 *
 * PURPOSE:
 *   Connects to MongoDB Atlas and creates the MongoStore for
 *   whatsapp-web.js RemoteAuth. Also provides verifySessionInDB()
 *   for the /status endpoint to confirm a saved session exists.
 */

const mongoose = require("mongoose");
const { MongoStore } = require("wwebjs-mongo");
const { config } = require("./config");
const logger = require("./logger");

const log = logger.tagged("[Database]");

/** @type {MongoStore|null} */
let store = null;

/**
 * Connect to MongoDB Atlas and initialize the session store.
 *
 * @returns {Promise<MongoStore>}
 */
async function connectAndCreateStore() {
  log.info("Connecting to MongoDB Atlas...");

  const redactedUri = config.mongodbUri.replace(
    /\/\/([^:]+):([^@]+)@/,
    "//$1:****@"
  );
  log.info(`URI: ${redactedUri}`);

  await mongoose.connect(config.mongodbUri);

  log.info("Connected successfully");
  log.info(`Database: ${mongoose.connection.name}`);
  log.info(`Host: ${mongoose.connection.host}`);

  // List existing collections for diagnostics
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    log.info(
      `Collections: ${collections.map((c) => c.name).join(", ") || "(empty database)"}`
    );
  } catch (err) {
    log.warn(`Could not list collections: ${err.message}`);
  }

  store = new MongoStore({ mongoose });
  log.info("MongoStore initialized for RemoteAuth");

  return store;
}

/**
 * Verify a session token exists in MongoDB.
 *
 * @returns {Promise<{exists: boolean, lastModified: Date|null, collection: string|null}>}
 */
async function verifySessionInDB() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return { exists: false, lastModified: null, collection: null };
    }

    const db = mongoose.connection.db;
    const allCollections = await db.listCollections().toArray();
    const names = allCollections.map((c) => c.name);

    const sessionCollections = names.filter(
      (n) =>
        n.toLowerCase().includes("remoteauth") ||
        n.toLowerCase().includes("whatsapp") ||
        n.toLowerCase().includes("session") ||
        n.toLowerCase().includes("wwebjs")
    );

    for (const colName of sessionCollections) {
      const count = await db.collection(colName).countDocuments();
      if (count > 0) {
        const doc = await db
          .collection(colName)
          .findOne({}, { sort: { _id: -1 } });
        const lastModified =
          doc?.updatedAt || doc?.uploadDate || doc?.createdAt || null;
        return { exists: true, lastModified, collection: colName };
      }
    }

    return { exists: false, lastModified: null, collection: null };
  } catch (err) {
    log.error(`Session verification error: ${err.message}`);
    return { exists: false, lastModified: null, collection: null };
  }
}

function getStore() {
  return store;
}

module.exports = { connectAndCreateStore, getStore, verifySessionInDB };
