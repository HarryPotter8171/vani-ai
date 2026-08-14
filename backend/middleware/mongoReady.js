/**
 * Fail-fast Mongo gate for all /api routes.
 * Health probes must be mounted before this middleware.
 */

export {
  requireMongoReady,
  ensureMongoReady,
  isMongoReady,
  isMongoUnavailableError,
  sendDatabaseUnavailable,
  databaseUnavailableError,
} from "../config/mongoReady.js";
