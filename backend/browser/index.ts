/**
 * VANI AI — Browser Automation
 *
 * browser/
 * ├── BrowserManager.ts
 * ├── BrowserSession.ts
 * ├── BrowserController.ts
 * ├── BrowserPermissions.ts
 * ├── BrowserRecorder.ts
 * └── BrowserExecutor.ts
 */

export { BrowserManager, browserManager } from "./BrowserManager.ts";
export { BrowserSession, launchSharedBrowser } from "./BrowserSession.ts";
export { BrowserController } from "./BrowserController.ts";
export {
  BrowserPermissions,
  browserPermissions,
} from "./BrowserPermissions.ts";
export { BrowserRecorder } from "./BrowserRecorder.ts";
export { BrowserExecutor, buildBrowserPlan } from "./BrowserExecutor.ts";
export { browserLog } from "./logger.ts";
export {
  checkPlaywrightBrowsers,
  warnIfBrowsersMissing,
  PLAYWRIGHT_INSTALL_HINT,
} from "./ensureBrowsers.js";
export * from "./types.ts";
