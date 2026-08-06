/**
 * Verify Playwright browser automation end-to-end.
 *
 * Usage:
 *   VANI_ENABLE_BROWSER_AUTOMATION=true node scripts/verifyBrowser.js
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initBrowser, browserManager } from "../browser/init.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", ".browser-data", "verify");
const USER_ID = "000000000000000000000001";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function section(title, fn) {
  process.stdout.write(`\n▸ ${title}... `);
  await fn();
  process.stdout.write("ok\n");
}

async function main() {
  process.env.VANI_ENABLE_BROWSER_AUTOMATION = "true";
  // In-memory permissions for offline verification (no Mongo required).
  initBrowser({ useMongo: false });
  await mkdir(tmpDir, { recursive: true });

  const uploadPath = path.join(tmpDir, "sample-upload.png");
  // Minimal 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  await writeFile(uploadPath, png);

  await section("Search Google", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Search Google for Playwright",
      url: "https://www.google.com/search?q=Playwright",
      engine: "chromium",
      mode: "isolated",
      autoApprove: "allow_once",
      headless: true,
    });
    assert(result.ok, result.error || "Google search failed");
    assert(
      String(result.report?.url || "").includes("google."),
      "Expected google URL"
    );
    assert(
      (result.snapshot.screenshots?.length || 0) > 0,
      "Expected screenshot"
    );
  });

  await section("Fill demo form", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Fill the-internet login form",
      engine: "chromium",
      autoApprove: "allow_once",
      steps: [
        { action: "open", url: "https://the-internet.herokuapp.com/login" },
        { action: "fill", selector: "#username", value: "tomsmith" },
        { action: "fill", selector: "#password", value: "SuperSecretPassword!" },
        { action: "click", selector: "button[type=submit]" },
        { action: "wait", selector: "#flash" },
        { action: "extract" },
        { action: "screenshot" },
      ],
    });
    assert(result.ok, result.error || "Form fill failed");
    const text = String(result.report?.extract?.text || "");
    assert(
      /secure area|you logged into/i.test(text),
      "Expected login success text"
    );
  });

  await section("Upload image", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Upload a sample image",
      engine: "chromium",
      autoApprove: "allow_once",
      steps: [
        { action: "open", url: "https://the-internet.herokuapp.com/upload" },
        {
          action: "upload",
          selector: "#file-upload",
          filePath: uploadPath,
        },
        { action: "click", selector: "#file-submit" },
        { action: "wait", selector: "#uploaded-files" },
        { action: "extract" },
        { action: "screenshot" },
      ],
    });
    assert(result.ok, result.error || "Upload failed");
    const text = String(result.report?.extract?.text || "");
    assert(/sample-upload\.png/i.test(text), "Expected uploaded filename");
  });

  await section("Download sample file", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Download a sample file",
      engine: "chromium",
      autoApprove: "allow_once",
      steps: [
        { action: "open", url: "https://the-internet.herokuapp.com/download" },
        {
          action: "download",
          selector: ".example a",
        },
        { action: "screenshot" },
      ],
    });
    assert(result.ok, result.error || "Download failed");
    const downloadResult = (result.report?.results || []).find(
      (r) => r && (r.filename || r.path)
    );
    assert(downloadResult?.filename, "Expected download filename");
  });

  await section("Navigate multi-page site", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Navigate multi-page site",
      engine: "chromium",
      autoApprove: "allow_once",
      steps: [
        { action: "open", url: "https://the-internet.herokuapp.com/" },
        { action: "click", selector: "a[href='/abtest']" },
        { action: "wait", selector: "h3" },
        { action: "extract" },
        { action: "screenshot" },
      ],
    });
    assert(result.ok, result.error || "Multi-page navigation failed");
    assert(
      String(result.report?.url || "").includes("/abtest"),
      "Expected /abtest URL"
    );
  });

  await section("Screenshot + extract (example.com)", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Screenshot example.com",
      url: "https://example.com",
      engine: "chromium",
      autoApprove: "allow_once",
      steps: [
        { action: "open", url: "https://example.com" },
        { action: "screenshot" },
        { action: "extract" },
      ],
    });
    assert(result.ok, result.error || "Screenshot extract failed");
    assert(result.snapshot.latestScreenshotId, "Expected screenshot id");
  });

  await section("Multi-tab: open popup window and switch", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Open a new window and switch tabs",
      engine: "chromium",
      autoApprove: "allow_once",
      steps: [
        { action: "open", url: "https://the-internet.herokuapp.com/windows" },
        { action: "click", selector: ".example a" },
        { action: "wait", value: "800" },
        { action: "switch_tab", value: "1" },
        { action: "extract" },
        { action: "screenshot" },
      ],
    });
    assert(result.ok, result.error || "Multi-tab path failed");
    const text = String(result.report?.extract?.text || "");
    assert(
      /new window/i.test(text) ||
        String(result.report?.url || "").includes("windows/new"),
      "Expected new-window content after tab switch"
    );
  });

  await section("Safety: block non-http navigation", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Attempt file URL",
      engine: "chromium",
      autoApprove: "allow_once",
      steps: [
        { action: "open", url: "file:///etc/passwd" },
        { action: "screenshot" },
      ],
    });
    assert(!result.ok, "file: navigation must fail");
    assert(
      /Blocked non-http|file:/i.test(String(result.error || "")),
      `Expected blocked non-http error, got: ${result.error}`
    );
  });

  await section("Safety: deny purchase-like plan without approval", async () => {
    const result = await browserManager.runAutomation({
      userId: USER_ID,
      goal: "Buy now and complete payment",
      engine: "chromium",
      autoApprove: "deny",
      steps: [
        { action: "open", url: "https://example.com/checkout" },
        {
          action: "click",
          selector: "#pay-now",
          label: "Complete payment",
        },
      ],
    });
    assert(!result.ok, "Dangerous plan should not succeed when denied");
  });

  await browserManager.shutdown();
  console.log("\n✅ Browser automation verification passed\n");
}

main().catch(async (err) => {
  console.error("\n❌ verifyBrowser failed:", err);
  try {
    await browserManager.shutdown();
  } catch {
    // ignore
  }
  process.exit(1);
});
