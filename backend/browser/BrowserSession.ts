/**
 * BrowserSession — isolated Playwright context with optional cookie persistence.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type {
  BrowserEngine,
  BrowserSessionMode,
  BrowserSessionOptions,
} from "./types.ts";
import { BrowserController } from "./BrowserController.ts";
import { browserLog } from "./logger.ts";
import { SESSION_IDLE_TTL_MS } from "./safety.ts";
import { toFriendlyLaunchError } from "./ensureBrowsers.js";

const ENGINE_LAUNCHERS = {
  chromium,
  firefox,
  webkit,
} as const;

const STORAGE_ROOT = path.resolve(
  process.cwd(),
  process.env.VANI_BROWSER_STORAGE_DIR || ".browser-data"
);

export class BrowserSession {
  readonly id: string;
  readonly userId: string;
  readonly engine: BrowserEngine;
  readonly mode: BrowserSessionMode;
  readonly persistCookies: boolean;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private controller: BrowserController | null = null;
  private closed = false;
  private lastUsedAt = Date.now();
  private readonly headless: boolean;
  private readonly viewport: { width: number; height: number };
  private readonly downloadDir: string;
  private readonly sharedBrowser: Browser | null;

  constructor(
    options: BrowserSessionOptions,
    sharedBrowser: Browser | null = null
  ) {
    this.id = `bs_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.userId = options.userId;
    this.engine = options.engine || "chromium";
    this.mode = options.mode || "isolated";
    this.persistCookies =
      options.persistCookies === true && this.mode === "persistent";
    this.headless = options.headless !== false;
    this.viewport = options.viewport || { width: 1280, height: 800 };
    this.downloadDir =
      options.downloadDir ||
      path.join(STORAGE_ROOT, "downloads", this.userId, this.id);
    this.sharedBrowser = sharedBrowser;
  }

  touch(): void {
    this.lastUsedAt = Date.now();
  }

  isIdle(now = Date.now()): boolean {
    return now - this.lastUsedAt > SESSION_IDLE_TTL_MS;
  }

  isClosed(): boolean {
    return this.closed;
  }

  getController(): BrowserController {
    if (!this.controller) {
      throw new Error("Browser session is not started");
    }
    this.touch();
    return this.controller;
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error("Session already closed");
    if (this.controller) return;

    await mkdir(this.downloadDir, { recursive: true });

    const launcher = ENGINE_LAUNCHERS[this.engine];
    if (!launcher) {
      throw new Error(`Unsupported browser engine: ${this.engine}`);
    }

    try {
      this.browser =
        this.sharedBrowser ||
        (await launcher.launch({
          headless: this.headless,
          args:
            this.engine === "chromium"
              ? ["--disable-dev-shm-usage", "--no-sandbox"]
              : undefined,
        }));
    } catch (err) {
      throw toFriendlyLaunchError(err, this.engine);
    }

    const storageStatePath = this.storageStatePath();
    let storageState: string | undefined;
    if (this.persistCookies) {
      try {
        await readFile(storageStatePath, "utf8");
        storageState = storageStatePath;
      } catch {
        storageState = undefined;
      }
    }

    this.context = await this.browser.newContext({
      viewport: this.viewport,
      acceptDownloads: true,
      ignoreHTTPSErrors: false,
      ...(storageState ? { storageState } : {}),
      ...(this.mode === "private"
        ? {
            // Fresh context, no storage — private mode.
          }
        : {}),
    });

    this.context.setDefaultTimeout(30_000);
    this.context.setDefaultNavigationTimeout(45_000);

    this.page = await this.context.newPage();
    this.controller = new BrowserController(this.page, {
      downloadDir: this.downloadDir,
    });
    this.touch();

    browserLog.info("session", "Started browser session", {
      sessionId: this.id,
      engine: this.engine,
      mode: this.mode,
      persistCookies: this.persistCookies,
    });
  }

  private storageStatePath(): string {
    return path.join(
      STORAGE_ROOT,
      "cookies",
      this.userId,
      `${this.engine}.json`
    );
  }

  async persistStorage(): Promise<void> {
    if (!this.persistCookies || !this.context) return;
    const file = this.storageStatePath();
    await mkdir(path.dirname(file), { recursive: true });
    await this.context.storageState({ path: file });
  }

  async currentUrl(): Promise<string> {
    // Prefer the controller's active page so switch_tab / popup adoption stay accurate.
    if (this.controller) {
      return this.controller.currentUrl();
    }
    if (!this.page) return "about:blank";
    return this.page.url();
  }

  async screenshotJpeg(): Promise<{ data: string; url: string; mimeType: string }> {
    const ctrl = this.getController();
    const result = await ctrl.execute({ action: "screenshot" });
    return {
      data: String(result.data || ""),
      url: String(result.url || (await this.currentUrl())),
      mimeType: String(result.mimeType || "image/jpeg"),
    };
  }

  getDownloadDir(): string {
    return this.downloadDir;
  }

  ownsBrowser(): boolean {
    return !this.sharedBrowser && !!this.browser;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  async close({ persist = true }: { persist?: boolean } = {}): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    try {
      if (persist && this.persistCookies) {
        await this.persistStorage();
      }
    } catch (err) {
      browserLog.warn("session", "Failed to persist cookies", {
        sessionId: this.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await this.context?.close();
    } catch {
      // ignore
    }

    // Only close browser if this session launched it (not a shared pool browser).
    if (this.ownsBrowser()) {
      try {
        await this.browser?.close();
      } catch {
        // ignore
      }
    }

    this.controller = null;
    this.page = null;
    this.context = null;
    this.browser = null;

    browserLog.info("session", "Closed browser session", {
      sessionId: this.id,
    });
  }
}

export async function launchSharedBrowser(
  engine: BrowserEngine,
  headless = true
): Promise<Browser> {
  const launcher = ENGINE_LAUNCHERS[engine];
  try {
    return await launcher.launch({
      headless,
      args:
        engine === "chromium"
          ? ["--disable-dev-shm-usage", "--no-sandbox"]
          : undefined,
    });
  } catch (err) {
    throw toFriendlyLaunchError(err, engine);
  }
}

/** Utility for verification scripts. */
export async function writeTextFile(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}
