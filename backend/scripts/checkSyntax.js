/**
 * Syntax-check every backend source file with `node --check`.
 * Used by `npm run build` — a fast, dependency-free sanity check that every
 * file at least parses, run before the real test suite.
 *
 * Run: node scripts/checkSyntax.js
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules",
  "coverage",
  "uploads",
  ".browser-data",
  ".code-interpreter",
  "tests",
  "keys",
]);

const EXTENSIONS = new Set([".js", ".ts"]);

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
    } else if (EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const files = collectFiles(ROOT);
let failures = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    failures += 1;
    console.error(`✖ ${path.relative(ROOT, file)}`);
    console.error(err.stderr?.toString() || err.message);
  }
}

if (failures) {
  console.error(`\n${failures} file(s) failed syntax check (of ${files.length}).`);
  process.exit(1);
}

console.log(`✅ ${files.length} files passed syntax check.`);
