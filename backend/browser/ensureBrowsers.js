/**
 * Playwright browser install checks for local development and startup.
 * Chromium is the default engine used by BrowserManager.
 */

import { existsSync } from "node:fs";
import { chromium } from "playwright";

export const PLAYWRIGHT_INSTALL_HINT = [
  "Playwright Chromium is not installed (required for browser automation).",
  "",
  "Install it with either:",
  "  cd backend && npm run install:browsers",
  "  cd backend && npx playwright install chromium",
  "",
  "Then restart the backend.",
].join("\n");

/**
 * @returns {{
 *   ok: boolean,
 *   engine: "chromium",
 *   executablePath: string | null,
 *   error?: string,
 *   hint: string | null,
 * }}
 */
export function checkPlaywrightBrowsers() {
  try {
    const executablePath = chromium.executablePath();
    const ok = Boolean(executablePath && existsSync(executablePath));
    return {
      ok,
      engine: "chromium",
      executablePath,
      hint: ok ? null : PLAYWRIGHT_INSTALL_HINT,
    };
  } catch (err) {
    return {
      ok: false,
      engine: "chromium",
      executablePath: null,
      error: err instanceof Error ? err.message : String(err),
      hint: PLAYWRIGHT_INSTALL_HINT,
    };
  }
}

/** Print a friendly console warning when Chromium is missing. */
export function warnIfBrowsersMissing() {
  const status = checkPlaywrightBrowsers();
  if (status.ok) return status;

  console.warn("⚠️  " + PLAYWRIGHT_INSTALL_HINT.split("\n")[0]);
  for (const line of PLAYWRIGHT_INSTALL_HINT.split("\n").slice(1)) {
    if (line) console.warn("   " + line);
    else console.warn("");
  }
  if (status.executablePath) {
    console.warn(`   Expected path: ${status.executablePath}`);
  }
  return status;
}

/**
 * Re-throw launch failures with an install hint when the executable is missing.
 * @param {unknown} err
 * @param {string} [engine]
 * @returns {never}
 */
export function rethrowFriendlyLaunchError(err, engine = "chromium") {
  throw toFriendlyLaunchError(err, engine);
}

/**
 * @param {unknown} err
 * @param {string} [engine]
 * @returns {Error}
 */
export function toFriendlyLaunchError(err, engine = "chromium") {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /Executable doesn't exist|browserType\.launch|Failed to launch|ENOENT/i.test(
      message
    )
  ) {
    const detected =
      /firefox/i.test(message) ? "firefox" :
      /webkit/i.test(message) ? "webkit" :
      engine || "chromium";
    const hint =
      detected === "chromium"
        ? PLAYWRIGHT_INSTALL_HINT
        : [
            `Playwright ${detected} is not installed.`,
            "",
            "Install it with:",
            `  cd backend && npx playwright install ${detected}`,
            "",
            "Chromium is the default engine; optional engines must be installed separately.",
          ].join("\n");
    return new Error(`${message}\n\n${hint}`);
  }
  return err instanceof Error ? err : new Error(message);
}
