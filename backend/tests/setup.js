import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";
import { configureMongoose, connectMongo } from "../config/mongoReady.js";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || "test-auth-secret-do-not-use-in-prod";
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "vani-test-project";
process.env.GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
process.env.VANI_ENABLE_BROWSER_AUTOMATION = process.env.VANI_ENABLE_BROWSER_AUTOMATION || "false";
// Local Echo MCP integration/unit tests need stdio; production always refuses.
process.env.MCP_ALLOW_STDIO = process.env.MCP_ALLOW_STDIO || "true";

configureMongoose();

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await connectMongo(process.env.MONGODB_URI);
  }
});

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.close();
});
