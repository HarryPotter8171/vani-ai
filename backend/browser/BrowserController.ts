/**
 * BrowserController — low-level Playwright page operations.
 */

import type { Page, Dialog, Download } from "playwright";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { BrowserActionInput, BrowserStepAction } from "./types.ts";
import {
  DEFAULT_ACTION_TIMEOUT_MS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  TRANSIENT_RETRY_COUNT,
  assertHttpUrl,
} from "./safety.ts";
import { browserLog } from "./logger.ts";

const TRANSIENT_RE = /timeout|net::|Target closed|Navigation failed|interrupted/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class BrowserController {
  private page: Page;
  private dialogHandler: ((dialog: Dialog) => Promise<void>) | null = null;
  private lastDownload: Download | null = null;
  private lastDialogMessage: string | null = null;
  private readonly downloadDir: string | null;

  constructor(page: Page, options: { downloadDir?: string } = {}) {
    this.page = page;
    this.downloadDir = options.downloadDir || null;
    this.page.on("dialog", async (dialog) => {
      this.lastDialogMessage = dialog.message();
      if (this.dialogHandler) {
        await this.dialogHandler(dialog);
      } else {
        // Default: dismiss to avoid hanging automation.
        await dialog.dismiss().catch(() => undefined);
      }
    });

    this.page.on("download", (download) => {
      this.lastDownload = download;
    });
  }

  setPage(page: Page): void {
    this.page = page;
  }

  getPage(): Page {
    return this.page;
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  async title(): Promise<string> {
    return this.page.title().catch(() => "");
  }

  async execute(
    input: BrowserActionInput
  ): Promise<Record<string, unknown>> {
    const action = input.action;
    const timeout = input.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= TRANSIENT_RETRY_COUNT; attempt++) {
      try {
        return await this.executeOnce(action, input, timeout);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const transient = TRANSIENT_RE.test(lastError.message);
        if (!transient || attempt === TRANSIENT_RETRY_COUNT) break;
        browserLog.warn("controller", "Retrying transient failure", {
          action,
          attempt: attempt + 1,
          error: lastError.message,
        });
        await sleep(250 * (attempt + 1));
      }
    }
    throw lastError || new Error(`Browser action failed: ${action}`);
  }

  private async executeOnce(
    action: BrowserStepAction,
    input: BrowserActionInput,
    timeout: number
  ): Promise<Record<string, unknown>> {
    switch (action) {
      case "open":
      case "navigate":
        return this.navigate(input.url || "", timeout);
      case "click":
        return this.click(input.selector || "", timeout);
      case "fill":
        return this.fill(input.selector || "", input.value ?? "", timeout);
      case "type":
        return this.type(input.selector || "", input.value ?? "", timeout);
      case "upload":
        return this.upload(input.selector || "", input.filePath || "", timeout);
      case "download":
        return this.download(input.selector, timeout);
      case "screenshot":
        return this.screenshot();
      case "extract":
        return this.extract();
      case "wait":
        return this.waitFor(input.selector, input.value, timeout);
      case "scroll":
        return this.scroll(input.value);
      case "switch_tab":
        return this.switchTab(input.value);
      case "handle_dialog":
        return this.handleDialog(input.value || "dismiss");
      case "press":
        return this.press(input.value || "Enter", input.selector, timeout);
      case "hover":
        return this.hover(input.selector || "", timeout);
      case "select":
        return this.select(input.selector || "", input.value ?? "", timeout);
      default:
        throw new Error(`Unsupported browser action: ${action}`);
    }
  }

  private async navigate(url: string, timeout: number) {
    assertHttpUrl(url);
    const response = await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: Math.max(timeout, DEFAULT_NAVIGATION_TIMEOUT_MS),
    });
    return {
      url: this.page.url(),
      status: response?.status() ?? null,
      title: await this.title(),
    };
  }

  private async click(selector: string, timeout: number) {
    if (!selector) throw new Error("selector is required for click");
    await this.page.locator(selector).first().click({ timeout });
    return { clicked: selector, url: this.page.url() };
  }

  private async fill(selector: string, value: string, timeout: number) {
    if (!selector) throw new Error("selector is required for fill");
    await this.page.locator(selector).first().fill(value, { timeout });
    return { filled: selector, length: value.length };
  }

  private async type(selector: string, value: string, timeout: number) {
    if (!selector) throw new Error("selector is required for type");
    const locator = this.page.locator(selector).first();
    await locator.click({ timeout });
    await locator.pressSequentially(value, { delay: 20, timeout });
    return { typed: selector, length: value.length };
  }

  private async upload(selector: string, filePath: string, timeout: number) {
    if (!filePath) throw new Error("filePath is required for upload");

    if (selector) {
      await this.page.locator(selector).first().setInputFiles(filePath, {
        timeout,
      });
      return { uploaded: filePath, via: "selector" };
    }

    throw new Error(
      "Upload requires a file input selector (e.g. input[type=file])"
    );
  }

  private async download(selector: string | undefined, timeout: number) {
    if (selector) {
      const [download] = await Promise.all([
        this.page.waitForEvent("download", { timeout }),
        this.page.locator(selector).first().click({ timeout }),
      ]);
      this.lastDownload = download;
    }

    if (!this.lastDownload) {
      throw new Error("No download detected");
    }

    const suggested = this.lastDownload.suggestedFilename() || "download.bin";
    let savedPath: string | null = null;

    if (this.downloadDir) {
      await mkdir(this.downloadDir, { recursive: true });
      // Sanitize filename to a single path segment.
      const safeName = suggested.replace(/[/\\]/g, "_").slice(0, 180) || "download.bin";
      savedPath = path.join(this.downloadDir, safeName);
      await this.lastDownload.saveAs(savedPath);
    } else {
      savedPath = (await this.lastDownload.path()) || null;
    }

    return {
      filename: suggested,
      path: savedPath,
      url: this.lastDownload.url(),
    };
  }

  private async screenshot() {
    const buffer = await this.page.screenshot({
      type: "jpeg",
      quality: 72,
      fullPage: false,
    });
    return {
      mimeType: "image/jpeg",
      data: buffer.toString("base64"),
      url: this.page.url(),
    };
  }

  private async extract() {
    const content = await this.page.evaluate(() => {
      const root = document.body;
      const text = (root?.innerText || "").replace(/\s+\n/g, "\n").trim();
      const title = document.title || "";
      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 40)
        .map((a) => ({
          text: (a.textContent || "").trim().slice(0, 120),
          href: (a as HTMLAnchorElement).href,
        }))
        .filter((l) => l.text || l.href);

      const inputs = Array.from(
        document.querySelectorAll("input, textarea, select, button")
      )
        .slice(0, 60)
        .map((el) => {
          const html = el as HTMLInputElement;
          return {
            tag: el.tagName.toLowerCase(),
            type: html.type || null,
            name: html.name || null,
            id: html.id || null,
            placeholder: html.placeholder || null,
            text: (el.textContent || "").trim().slice(0, 80) || null,
          };
        });

      return {
        title,
        text: text.slice(0, 12_000),
        links,
        inputs,
        url: location.href,
      };
    });

    return content as Record<string, unknown>;
  }

  private async waitFor(
    selector: string | undefined,
    value: string | undefined,
    timeout: number
  ) {
    if (selector) {
      await this.page.locator(selector).first().waitFor({
        state: "visible",
        timeout,
      });
      return { waited: "selector", selector };
    }
    const ms = Math.min(
      Math.max(Number(value) || 500, 0),
      DEFAULT_ACTION_TIMEOUT_MS
    );
    await sleep(ms);
    return { waited: "time", ms };
  }

  private async scroll(value?: string) {
    const direction = String(value || "down").toLowerCase();
    const delta =
      direction === "up" ? -800 : direction === "top" ? -10_000 : 800;
    await this.page.evaluate((y) => window.scrollBy(0, y), delta);
    if (direction === "top") {
      await this.page.evaluate(() => window.scrollTo(0, 0));
    }
    return { scrolled: direction };
  }

  private async switchTab(value?: string) {
    const pages = this.page.context().pages();
    if (!pages.length) throw new Error("No tabs available");

    let index = Number(value);
    if (!Number.isFinite(index)) {
      // Prefer the most recently opened page.
      index = pages.length - 1;
    }
    index = Math.max(0, Math.min(pages.length - 1, Math.floor(index)));
    const target = pages[index];
    await target.bringToFront();
    this.setPage(target);
    return { tabIndex: index, url: target.url(), tabs: pages.length };
  }

  private async handleDialog(mode: string) {
    const normalized = mode.toLowerCase();
    this.dialogHandler = async (dialog) => {
      if (normalized === "accept" || normalized === "ok") {
        await dialog.accept().catch(() => undefined);
      } else {
        await dialog.dismiss().catch(() => undefined);
      }
    };
    return {
      dialogMode: normalized,
      lastMessage: this.lastDialogMessage,
    };
  }

  private async press(
    key: string,
    selector: string | undefined,
    timeout: number
  ) {
    if (selector) {
      await this.page.locator(selector).first().press(key, { timeout });
    } else {
      await this.page.keyboard.press(key);
    }
    return { pressed: key };
  }

  private async hover(selector: string, timeout: number) {
    if (!selector) throw new Error("selector is required for hover");
    await this.page.locator(selector).first().hover({ timeout });
    return { hovered: selector };
  }

  private async select(selector: string, value: string, timeout: number) {
    if (!selector) throw new Error("selector is required for select");
    const values = await this.page
      .locator(selector)
      .first()
      .selectOption(value, { timeout });
    return { selected: values };
  }

  /** Handle new popup windows by adopting them as the active page. */
  async adoptPopup(timeout = 10_000): Promise<string | null> {
    const popup = await this.page
      .waitForEvent("popup", { timeout })
      .catch(() => null);
    if (!popup) return null;
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    this.setPage(popup);
    return popup.url();
  }
}
