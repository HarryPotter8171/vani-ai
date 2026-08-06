#!/usr/bin/env node
/**
 * Fail if `/` first-load JS (uncompressed) exceeds the Public Beta budget.
 * Reads Next diagnostics:
 *   frontend/.next/diagnostics/route-bundle-stats.json
 *
 * Usage: node scripts/checkBundleBudget.mjs
 * Env: BUNDLE_BUDGET_BYTES (default 1887436 ≈ 1.8 MB)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const BUDGET = Number(process.env.BUNDLE_BUDGET_BYTES) || Math.floor(1.8 * 1024 * 1024);

function readBytes() {
  const diag = path.join(root, ".next/diagnostics/route-bundle-stats.json");
  if (fs.existsSync(diag)) {
    const json = JSON.parse(fs.readFileSync(diag, "utf8"));
    if (Array.isArray(json)) {
      const route = json.find((r) => r && r.route === "/") || json[0];
      if (route && typeof route.firstLoadUncompressedJsBytes === "number") {
        return route.firstLoadUncompressedJsBytes;
      }
    } else if (json && typeof json === "object") {
      const route = json["/"] || json;
      if (typeof route === "number") return route;
      if (route && typeof route.firstLoadUncompressedJsBytes === "number") {
        return route.firstLoadUncompressedJsBytes;
      }
      if (route && typeof route.firstLoadJS === "number") return route.firstLoadJS;
    }
  }
  const after = path.join(__dirname, "bundle-after.json");
  if (fs.existsSync(after)) {
    const json = JSON.parse(fs.readFileSync(after, "utf8"));
    if (typeof json.firstLoadJS === "number") return json.firstLoadJS;
    if (typeof json.bytes === "number") return json.bytes;
  }
  return null;
}

const bytes = readBytes();
if (bytes == null) {
  console.warn(
    "[bundle-budget] No stats found (.next/diagnostics or bundle-after.json). Skipping gate."
  );
  process.exit(0);
}

const mb = (bytes / (1024 * 1024)).toFixed(3);
const budgetMb = (BUDGET / (1024 * 1024)).toFixed(3);
console.log(`[bundle-budget] / first-load JS = ${bytes} bytes (${mb} MB); budget ${budgetMb} MB`);
if (bytes > BUDGET) {
  console.error(`[bundle-budget] FAILED: exceeds Public Beta budget of ${BUDGET} bytes`);
  process.exit(1);
}
console.log("[bundle-budget] OK");
