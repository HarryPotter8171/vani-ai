import { configureMongoose, connectMongo, isMongoReady } from "./mongoReady.js";

configureMongoose();

/**
 * Connect to MongoDB. Prefer {@link connectMongo} for new call sites.
 * Exits the process on failure when used as a boot helper.
 */
export async function connectDB() {
  try {
    await connectMongo(undefined, { logger: console });
    console.log("✅ MongoDB Connected");
    return true;
  } catch (err) {
    console.error("❌ MongoDB Error:", err?.message || err);
    process.exit(1);
  }
}

export { isMongoReady, connectMongo, configureMongoose };
