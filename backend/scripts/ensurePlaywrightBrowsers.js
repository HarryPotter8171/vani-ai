/**
 * Ensure Playwright's Chromium binary is installed.
 * Used as the backend `postinstall` hook and via `npm run install:browsers`.
 *
 * Skips when PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 (e.g. Docker deps stage,
 * where browsers are installed later with OS deps via `playwright install --with-deps`).
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { checkPlaywrightBrowsers } from "../browser/ensureBrowsers.js";

const skip =
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1" ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "true";

if (skip) {
  console.log(
    "[playwright] Skipping browser download (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD set)"
  );
  process.exit(0);
}

const existing = checkPlaywrightBrowsers();
if (existing.ok) {
  console.log(`[playwright] Chromium already installed at ${existing.executablePath}`);
  process.exit(0);
}

console.log("[playwright] Installing Chromium for browser automation...");

const require = createRequire(import.meta.url);
const playwrightRoot = path.dirname(require.resolve("playwright/package.json"));
const cli = path.join(playwrightRoot, "cli.js");

const result = spawnSync(process.execPath, [cli, "install", "chromium"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("[playwright] Failed to start install:", result.error.message);
  console.error(checkPlaywrightBrowsers().hint);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `[playwright] Chromium install failed (exit ${result.status ?? "unknown"}).`
  );
  console.error(checkPlaywrightBrowsers().hint);
  process.exit(result.status ?? 1);
}

const after = checkPlaywrightBrowsers();
if (!after.ok) {
  console.error("[playwright] Chromium still missing after install.");
  console.error(after.hint);
  process.exit(1);
}

console.log(`[playwright] Chromium ready at ${after.executablePath}`);
process.exit(0);
