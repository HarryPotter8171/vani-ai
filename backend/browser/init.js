import { browserManager, browserPermissions } from "./index.ts";
import { createMongoBrowserPermissionStore } from "./persist.js";
import {
  checkPlaywrightBrowsers,
  warnIfBrowsersMissing,
} from "./ensureBrowsers.js";

let initialized = false;

/**
 * Wire persistence + idle cleanup, and verify Playwright Chromium is present.
 * Safe to call multiple times.
 * @param {{ useMongo?: boolean }} [options]
 */
export function initBrowser(options = {}) {
  if (initialized) return browserManager;

  const useMongo = options.useMongo !== false;
  if (useMongo) {
    browserPermissions.setStore(createMongoBrowserPermissionStore());
  }
  browserManager.startCleanupMonitor(60_000);

  initialized = true;

  const browsers = checkPlaywrightBrowsers();
  if (browsers.ok) {
    console.log("✅ Browser automation ready (Chromium available)");
  } else {
    console.log("✅ Browser automation registered");
    warnIfBrowsersMissing();
  }

  return browserManager;
}

export {
  browserManager,
  browserPermissions,
  checkPlaywrightBrowsers,
  warnIfBrowsersMissing,
};
