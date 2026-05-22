/**
 * store.js — MongoDB connection & session store with verification
 *
 * PURPOSE:
 *   Manages the Mongoose connection to MongoDB Atlas and creates
 *   the MongoStore instance used by whatsapp-web.js RemoteAuth.
 *
 *   Exports verifySessionInDB() which queries the MongoDB session
 *   collection directly to confirm a valid token exists.
 *
 *   FIXES:
 *   - Explicitly logs the database name from the MONGODB_URI
 *   - Searches ALL collections (not just regex) for session data
 *   - Handles the wwebjs-mongo collection naming conventions
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

  // Log the URI (redact password for security)
  const redactedUri = config.mongodbUri.replace(
    /\/\/([^:]+):([^@]+)@/,
    "//$1:****@"
  );
  log.info(`URI: ${redactedUri}`);

  await mongoose.connect(config.mongodbUri);

  log.info("MongoDB connected successfully");
  log.info(`Database name: ${mongoose.connection.name}`);
  log.info(`Host: ${mongoose.connection.host}`);
  log.info(`ReadyState: ${mongoose.connection.readyState}`);

  // Verify we can actually write to this database
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    log.info(`Existing collections in database: ${collections.map((c) => c.name).join(", ") || "(none — fresh database)"}`);
  } catch (err) {
    log.error(`Failed to list collections: ${err.message}`);
  }

  // MongoStore wraps mongoose.connection to provide the interface
  // that RemoteAuth expects for saving/loading session data.
  store = new MongoStore({ mongoose });
  log.info("MongoStore initialized for RemoteAuth");

  return store;
}

/**
 * Verify that a valid session token exists in MongoDB.
 *
 * Searches ALL collections in the database for any document that
 * looks like a RemoteAuth session. The wwebjs-mongo library uses
 * collection names like "whatsapp-RemoteAuth-default.chunks" and
 * "whatsapp-RemoteAuth-default.files" (GridFS pattern).
 *
 * @returns {Promise<{exists: boolean, lastModified: Date|null, collection: string|null}>}
 */
async function verifySessionInDB() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      log.warn("MongoDB not connected — cannot verify session");
      return { exists: false, lastModified: null, collection: null };
    }

    const db = mongoose.connection.db;
    const allCollections = await db.listCollections().toArray();
    const collectionNames = allCollections.map((c) => c.name);

    log.info(`All collections: [${collectionNames.join(", ")}]`);

    // Search for any collection that might contain session data
    // wwebjs-mongo uses GridFS, so we look for .files collections
    const sessionCollections = collectionNames.filter(
      (name) =>
        name.toLowerCase().includes("remoteauth") ||
        name.toLowerCase().includes("whatsapp") ||
        name.toLowerCase().includes("session") ||
        name.toLowerCase().includes("wwebjs")
    );

    log.info(
      `Session-related collections: [${sessionCollections.join(", ") || "none found"}]`
    );

    if (sessionCollections.length === 0) {
      log.warn("No session-related collections found in the database");
      return { exists: false, lastModified: null, collection: null };
    }

    // Check each session-related collection for documents
    for (const colName of sessionCollections) {
      const count = await db.collection(colName).countDocuments();
      log.info(`  ${colName}: ${count} document(s)`);

      if (count > 0) {
        const doc = await db
          .collection(colName)
          .findOne({}, { sort: { _id: -1 } });

        const lastModified =
          doc?.updatedAt || doc?.uploadDate || doc?.createdAt || null;

        log.info(
          `Session token FOUND in ${colName} (last modified: ${lastModified})`
        );
        return { exists: true, lastModified, collection: colName };
      }
    }

    log.warn("Session collections exist but contain no documents");
    return { exists: false, lastModified: null, collection: null };
  } catch (err) {
    log.error(`Session verification error: ${err.message}`);
    return { exists: false, lastModified: null, collection: null };
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
