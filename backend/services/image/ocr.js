import path from "path";
import fs from "fs";
import os from "os";
import { createRequire } from "module";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import {
  ImageProcessingError,
  OCR_LANG,
  OCR_MAX_CHARS,
  OCR_MAX_EDGE,
  normalizePlainText,
} from "./shared.js";

const require = createRequire(import.meta.url);

/**
 * Resolve a local tessdata directory so production OCR does not depend on
 * downloading language packs at runtime.
 *
 * For multi-lang (eng+hin), copies/links each pack into a shared cache dir
 * so Tesseract can load both from one langPath.
 */
function resolveTrainedDataFile(lang) {
  const code = String(lang || "").trim();
  if (!code) return null;
  try {
    const pkgRoot = path.dirname(
      require.resolve(`@tesseract.js-data/${code}/package.json`)
    );
    const file = path.join(pkgRoot, "4.0.0", `${code}.traineddata.gz`);
    if (fs.existsSync(file)) return file;
  } catch {
    // package not installed
  }
  return null;
}

function ensureLocalLangPath(langSpec) {
  const langs = String(langSpec || "eng")
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!langs.length) return undefined;

  // Single vendored eng pack — use package path directly (legacy fast path).
  if (langs.length === 1 && langs[0] === "eng") {
    try {
      const pkgRoot = path.dirname(
        require.resolve("@tesseract.js-data/eng/package.json")
      );
      return path.join(pkgRoot, "4.0.0");
    } catch {
      return undefined;
    }
  }

  const cacheDir = path.join(os.tmpdir(), "vani-tessdata-4.0.0");
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch {
    return undefined;
  }

  for (const lang of langs) {
    const dest = path.join(cacheDir, `${lang}.traineddata.gz`);
    if (fs.existsSync(dest)) continue;
    const src = resolveTrainedDataFile(lang);
    if (!src) continue;
    try {
      fs.copyFileSync(src, dest);
    } catch {
      try {
        fs.linkSync(src, dest);
      } catch {
        // leave missing — tesseract may still download if network allowed
      }
    }
  }

  return cacheDir;
}

/** Pool size: default 2, env OCR_WORKER_POOL_SIZE capped to 1–4. */
function resolvePoolSize() {
  const raw = Number(process.env.OCR_WORKER_POOL_SIZE);
  if (!Number.isFinite(raw)) return 2;
  return Math.min(4, Math.max(1, Math.floor(raw)));
}

/**
 * @typedef {{
 *   promise: Promise<object>|null,
 *   lang: string|null,
 *   busy: Promise<void>,
 * }} OcrPoolSlot
 */

/** @type {OcrPoolSlot[]} */
const pool = Array.from({ length: resolvePoolSize() }, () => ({
  promise: null,
  lang: null,
  busy: Promise.resolve(),
}));

let rrCursor = 0;

/**
 * Get or create a Tesseract worker for a pool slot.
 * Recreates the worker when the requested language changes.
 * @param {OcrPoolSlot} slot
 * @param {string} lang
 */
async function getWorkerForSlot(slot, lang = OCR_LANG) {
  const wanted = String(lang || OCR_LANG).trim() || "eng";

  if (slot.promise && slot.lang === wanted) {
    return slot.promise;
  }

  // Language changed — terminate prior worker before creating a new one.
  if (slot.promise) {
    try {
      const prev = await slot.promise;
      await prev.terminate();
    } catch {
      // ignore
    } finally {
      slot.promise = null;
      slot.lang = null;
    }
  }

  slot.lang = wanted;
  slot.promise = (async () => {
    const langPath = ensureLocalLangPath(wanted);
    const options = {
      logger: () => {},
      gzip: true,
    };
    if (langPath) {
      options.langPath = langPath;
      options.cacheMethod = "none";
    }

    const worker = await createWorker(wanted, 1, options);
    return worker;
  })().catch((err) => {
    slot.promise = null;
    slot.lang = null;
    throw err;
  });

  return slot.promise;
}

/**
 * Dispatch OCR work to a free pool slot (round-robin + per-slot busy chain).
 * Each worker serializes its own recognize() calls.
 * @template T
 * @param {string} lang
 * @param {(worker: object) => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withPoolWorker(lang, fn) {
  const slot = pool[rrCursor % pool.length];
  rrCursor += 1;

  const run = slot.busy.then(
    () => getWorkerForSlot(slot, lang).then(fn),
    () => getWorkerForSlot(slot, lang).then(fn)
  );
  slot.busy = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Downscale / normalize for OCR: honor EXIF orientation, cap edge length,
 * greyscale + mild contrast so Tesseract stays fast and accurate.
 */
async function preprocessForOcr(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: OCR_MAX_EDGE,
      height: OCR_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .greyscale()
    .normalize()
    .png()
    .toBuffer();
}

/**
 * Run OCR on an image buffer.
 *
 * @param {Buffer} buffer
 * @param {{ lang?: string, includeBlocks?: boolean, maxChars?: number }} [options]
 * @returns {Promise<{
 *   ocrText: string,
 *   confidence: number|null,
 *   language: string,
 *   blocks?: object[]|null,
 * }>}
 */
export async function extractOcrText(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ImageProcessingError("Image buffer is empty.");
  }

  const lang = String(options.lang || OCR_LANG).trim() || "eng";
  const includeBlocks = Boolean(options.includeBlocks);
  const maxChars = Number(options.maxChars) || OCR_MAX_CHARS;

  try {
    const prepared = await preprocessForOcr(buffer);

    const page = await withPoolWorker(lang, async (worker) => {
      const output = includeBlocks
        ? { text: true, blocks: true }
        : { text: true };
      const { data } = await worker.recognize(prepared, {}, output);
      return data;
    });

    let ocrText = normalizePlainText(page?.text || "");
    if (ocrText.length > maxChars) {
      ocrText = `${ocrText.slice(0, maxChars)}\n\n[OCR truncated — exceeded ${maxChars} characters]`;
    }

    const confidence =
      typeof page?.confidence === "number"
        ? Math.round(page.confidence * 10) / 10
        : null;

    return {
      ocrText,
      confidence,
      language: lang,
      ...(includeBlocks ? { blocks: page?.blocks || null } : {}),
    };
  } catch (err) {
    if (err instanceof ImageProcessingError) throw err;
    throw new ImageProcessingError(`OCR failed: ${err.message}`, err);
  }
}

/** Best-effort teardown of all pool workers (tests / graceful shutdown). */
export async function shutdownOcrWorker() {
  await Promise.all(
    pool.map(async (slot) => {
      if (!slot.promise) return;
      try {
        const worker = await slot.promise;
        await worker.terminate();
      } catch {
        // ignore
      } finally {
        slot.promise = null;
        slot.lang = null;
        slot.busy = Promise.resolve();
      }
    })
  );
}
