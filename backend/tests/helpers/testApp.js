import { createApp } from "../../app.js";

let app;

/** Shared Express app instance for Supertest — built once per test process. */
export function getTestApp() {
  if (!app) app = createApp();
  return app;
}
