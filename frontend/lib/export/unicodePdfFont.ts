/**
 * Multilingual Unicode PDF font layer for jsPDF exports.
 *
 * - Detects Unicode scripts automatically
 * - Lazy-loads the matching Google Noto face(s) from /fonts/pdf (not the JS bundle)
 * - Switches fonts per run so mixed-language lines render correctly
 * - Never uses Helvetica/Courier for non-WinAnsi text
 * - Strips emoji safely; Arabic/Hebrew get reshape + visual BiDi
 *
 * Fonts: Google Noto (SIL OFL 1.1) — see public/fonts/pdf/ and fonts/README.md
 */

import type { jsPDF } from 'jspdf';
import {
  PDF_FONT_CATALOG,
  detectRequiredFontKeys,
  detectScript,
  isHelveticaSafe,
  scriptToFontKey,
  type PdfFontKey,
} from './pdfFontCatalog';
import { prepareRtlArabic, prepareRtlHebrew } from './rtlText';

export type PdfFontStyle = 'normal' | 'bold' | 'italic';
export type PdfPreferredFont = 'helvetica' | 'courier';

/** @deprecated Use per-run families from the catalog; kept for callers/tests. */
export const UNICODE_PDF_FONT = PDF_FONT_CATALOG.noto_devanagari.family;
export const UNICODE_PDF_FONT_FILE = PDF_FONT_CATALOG.noto_devanagari.file;

type DocState = {
  registered: Set<PdfFontKey>;
  /** Preferred CJK face for Han ideographs in this document. */
  cjk: PdfFontKey | null;
};

const DOC_STATE = new WeakMap<object, DocState>();
const FONT_BASE64_CACHE = new Map<PdfFontKey, string>();
const FONT_LOAD_PROMISES = new Map<PdfFontKey, Promise<string>>();

export type PdfTextRun = {
  text: string;
  /** null → Helvetica/Courier (WinAnsi-safe Latin). */
  fontKey: PdfFontKey | null;
};

function getDocState(doc: jsPDF): DocState {
  let state = DOC_STATE.get(doc as object);
  if (!state) {
    state = { registered: new Set(), cjk: null };
    DOC_STATE.set(doc as object, state);
  }
  return state;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readFontFile(defFile: string, publicPath: string): Promise<ArrayBuffer> {
  // Prefer filesystem whenever we can (Node, Vitest/jsdom). jsdom defines
  // `window`, so we must not key off that alone — otherwise tests try to
  // fetch `/fonts/pdf/...` and silently get nothing.
  const canUseFs = typeof process !== 'undefined' && !!process.versions?.node;

  if (canUseFs) {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const candidates = [
        path.resolve(process.cwd(), 'public/fonts/pdf', defFile),
        path.resolve(process.cwd(), 'frontend/public/fonts/pdf', defFile),
        path.resolve(process.cwd(), '../public/fonts/pdf', defFile),
      ];
      for (const candidate of candidates) {
        try {
          const buf = await fs.readFile(candidate);
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } catch {
          // try next
        }
      }
    } catch {
      // fall through to fetch
    }
  }

  if (typeof fetch === 'function') {
    const res = await fetch(publicPath);
    if (!res.ok) {
      throw new Error(`Failed to load PDF font ${publicPath}: HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  }

  throw new Error(`Unable to load PDF font ${defFile}`);
}

async function loadFontBase64(key: PdfFontKey): Promise<string> {
  const cached = FONT_BASE64_CACHE.get(key);
  if (cached) return cached;

  let pending = FONT_LOAD_PROMISES.get(key);
  if (!pending) {
    pending = (async () => {
      const def = PDF_FONT_CATALOG[key];
      const buf = await readFontFile(def.file, def.publicPath);
      const b64 = arrayBufferToBase64(buf);
      FONT_BASE64_CACHE.set(key, b64);
      return b64;
    })().finally(() => {
      FONT_LOAD_PROMISES.delete(key);
    });
    FONT_LOAD_PROMISES.set(key, pending);
  }
  return pending;
}

function registerFontOnDoc(doc: jsPDF, key: PdfFontKey, base64: string): void {
  const state = getDocState(doc);
  if (state.registered.has(key)) return;

  const def = PDF_FONT_CATALOG[key];
  doc.addFileToVFS(def.file, base64);
  // Alias all styles to the Regular face so setFont(..., 'bold') never throws.
  doc.addFont(def.file, def.family, 'normal');
  doc.addFont(def.file, def.family, 'bold');
  doc.addFont(def.file, def.family, 'italic');
  doc.addFont(def.file, def.family, 'bolditalic');
  state.registered.add(key);
}

function pickCjkFace(keys: Set<PdfFontKey>): PdfFontKey | null {
  if (keys.has('noto_jp')) return 'noto_jp';
  if (keys.has('noto_tc')) return 'noto_tc';
  if (keys.has('noto_kr') && !keys.has('noto_sc') && !keys.has('noto_tc')) {
    return 'noto_kr';
  }
  if (keys.has('noto_sc')) return 'noto_sc';
  if (keys.has('noto_tc')) return 'noto_tc';
  return null;
}

/**
 * Load and register every Noto face required by `text` (and optional extras).
 * Call once at the start of every PDF export.
 */
export async function ensureUnicodePdfFonts(
  doc: jsPDF,
  text = ''
): Promise<void> {
  const keys = detectRequiredFontKeys(text);
  // Always have Noto Sans available for Latin-extended fallbacks mid-export.
  if (keys.size === 0) {
    // Still register nothing for pure ASCII — Helvetica is fine.
  }

  const state = getDocState(doc);
  state.cjk = pickCjkFace(keys) ?? state.cjk;

  const toLoad = [...keys];
  await Promise.all(
    toLoad.map(async (key) => {
      try {
        const b64 = await loadFontBase64(key);
        registerFontOnDoc(doc, key, b64);
      } catch (err) {
        // Missing optional face (e.g. CJK not shipped) — continue with others.
        console.warn(`[pdf-i18n] Could not load font ${key}:`, err);
      }
    })
  );
}

/**
 * True when `text` contains any character Helvetica cannot render.
 */
export function needsUnicodeFont(text: string): boolean {
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0);
    if (cp != null && !isHelveticaSafe(cp)) return true;
  }
  return false;
}

/**
 * Strip emoji / variation selectors so missing-glyph paths never crash jsPDF.
 * Uses Unicode property escapes when available; falls back for Safari < 16.4.
 */
export function sanitizePdfText(text: string): string {
  let s = String(text ?? '');
  try {
    s = s.replace(/\p{Extended_Pictographic}/gu, '');
  } catch {
    // Engines without Unicode property escapes: drop surrogate pairs (most emoji).
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  }
  return s.replace(/\uFE0F/g, '').replace(/\u200D/g, '');
}

function resolveFontKeyForCp(cp: number, cjk: PdfFontKey | null): PdfFontKey | null {
  if (isHelveticaSafe(cp)) return null;
  const script = detectScript(cp);
  if ((script === 'han_sc' || script === 'han_tc') && cjk) return cjk;
  // Unknown non-Latin → try Noto Sans (covers many symbols + LGC)
  const key = scriptToFontKey(script);
  if (key) return key;
  if (script === 'unknown' || script === 'common') {
    return isHelveticaSafe(cp) ? null : 'noto_sans';
  }
  return null;
}

/**
 * Split mixed-script text into font runs. Whitespace sticks to the preceding
 * run. Common/neutral chars inherit the active run's font.
 */
export function segmentPdfTextRuns(
  text: string,
  cjk: PdfFontKey | null = null
): PdfTextRun[] {
  const input = sanitizePdfText(text);
  if (!input) return [];

  const runs: PdfTextRun[] = [];
  let buf = '';
  let fontKey: PdfFontKey | null | undefined;

  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    const isSpace = /\s/.test(ch);
    const nextKey = isSpace
      ? fontKey === undefined
        ? null
        : fontKey
      : resolveFontKeyForCp(cp, cjk);

    if (fontKey === undefined) {
      fontKey = nextKey;
      buf = ch;
      continue;
    }

    if (isSpace || nextKey === fontKey) {
      buf += ch;
    } else {
      runs.push({ text: buf, fontKey: fontKey ?? null });
      buf = ch;
      fontKey = nextKey;
    }
  }

  if (buf) runs.push({ text: buf, fontKey: fontKey ?? null });
  return runs;
}

function familyFor(
  fontKey: PdfFontKey | null,
  preferred: PdfPreferredFont
): string {
  if (fontKey) return PDF_FONT_CATALOG[fontKey].family;
  return preferred;
}

function styleFor(fontKey: PdfFontKey | null, style: PdfFontStyle): PdfFontStyle {
  if (fontKey && style === 'italic') return 'normal';
  return style;
}

function prepareRunText(run: PdfTextRun): string {
  if (!run.fontKey) return run.text;
  const def = PDF_FONT_CATALOG[run.fontKey];
  if (!def.rtl) return run.text;
  if (run.fontKey === 'noto_arabic') return prepareRtlArabic(run.text);
  if (run.fontKey === 'noto_hebrew') return prepareRtlHebrew(run.text);
  return run.text;
}

function ensureRegisteredOrSkip(doc: jsPDF, fontKey: PdfFontKey | null): PdfFontKey | null {
  if (!fontKey) return null;
  const state = getDocState(doc);
  if (state.registered.has(fontKey)) return fontKey;
  // Font was required but failed to load — fall back to Noto Sans if present,
  // otherwise skip (never Helvetica for Unicode).
  if (state.registered.has('noto_sans')) return 'noto_sans';
  return fontKey; // may throw later; writePdfText catches
}

/**
 * Pick Helvetica/Courier for WinAnsi-safe text, otherwise the matching Noto face.
 */
export function setPdfFontForText(
  doc: jsPDF,
  text: string,
  style: PdfFontStyle = 'normal',
  preferred: PdfPreferredFont = 'helvetica'
): void {
  const state = getDocState(doc);
  const runs = segmentPdfTextRuns(text, state.cjk);
  const key = runs.find((r) => r.fontKey)?.fontKey ?? null;
  const resolved = ensureRegisteredOrSkip(doc, key);
  doc.setFont(familyFor(resolved, preferred), styleFor(resolved, style));
}

/**
 * Measure width of mixed-script text using the correct font per run.
 */
export function measurePdfTextWidth(
  doc: jsPDF,
  text: string,
  style: PdfFontStyle = 'normal',
  preferred: PdfPreferredFont = 'helvetica'
): number {
  const state = getDocState(doc);
  const runs = segmentPdfTextRuns(text, state.cjk);
  if (!runs.length) return 0;

  let width = 0;
  for (const run of runs) {
    const key = ensureRegisteredOrSkip(doc, run.fontKey);
    const prepared = prepareRunText({ ...run, fontKey: key });
    doc.setFont(familyFor(key, preferred), styleFor(key, style));
    width += doc.getTextWidth(prepared);
  }
  return width;
}

/**
 * Draw a single-line string with per-run font switching.
 * Returns the advance width.
 */
export function writePdfText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: {
    style?: PdfFontStyle;
    preferred?: PdfPreferredFont;
  } = {}
): number {
  const style = opts.style ?? 'normal';
  const preferred = opts.preferred ?? 'helvetica';
  const state = getDocState(doc);
  const runs = segmentPdfTextRuns(text, state.cjk);
  if (!runs.length) return 0;

  let cx = x;
  for (const run of runs) {
    const key = ensureRegisteredOrSkip(doc, run.fontKey);
    const prepared = prepareRunText({ ...run, fontKey: key });
    try {
      doc.setFont(familyFor(key, preferred), styleFor(key, style));
      doc.text(prepared, cx, y);
      cx += doc.getTextWidth(prepared);
    } catch {
      // Graceful: skip a run that still fails (emoji leftovers / missing glyphs).
    }
  }
  return cx - x;
}

function breakOversizedToken(
  doc: jsPDF,
  token: string,
  maxWidth: number,
  style: PdfFontStyle,
  preferred: PdfPreferredFont
): string[] {
  const parts: string[] = [];
  let chunk = '';
  for (const ch of token) {
    const next = chunk + ch;
    if (chunk && measurePdfTextWidth(doc, next, style, preferred) > maxWidth) {
      parts.push(chunk);
      chunk = ch;
    } else {
      chunk = next;
    }
  }
  if (chunk) parts.push(chunk);
  return parts.length ? parts : [token];
}

/**
 * Word-wrap mixed-script text to `maxWidth`, measuring with the correct fonts.
 */
export function wrapPdfText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  opts: {
    style?: PdfFontStyle;
    preferred?: PdfPreferredFont;
  } = {}
): string[] {
  const style = opts.style ?? 'normal';
  const preferred = opts.preferred ?? 'helvetica';
  const safe = sanitizePdfText(text);
  if (!safe) return [''];

  const paragraphs = safe.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    const tokens = paragraph.split(/(\s+)/).filter((t) => t.length > 0);
    let current = '';

    const pushLine = (line: string) => {
      lines.push(line.replace(/\s+$/g, ''));
    };

    for (const token of tokens) {
      if (/^\s+$/.test(token)) {
        current += token;
        continue;
      }

      const trial = current + token;
      if (
        !current.trim() ||
        measurePdfTextWidth(doc, trial, style, preferred) <= maxWidth
      ) {
        if (
          !current.trim() &&
          measurePdfTextWidth(doc, token, style, preferred) > maxWidth
        ) {
          const pieces = breakOversizedToken(doc, token, maxWidth, style, preferred);
          for (let i = 0; i < pieces.length - 1; i += 1) pushLine(pieces[i]);
          current = pieces[pieces.length - 1] || '';
        } else {
          current = trial;
        }
      } else {
        pushLine(current);
        if (measurePdfTextWidth(doc, token, style, preferred) > maxWidth) {
          const pieces = breakOversizedToken(doc, token, maxWidth, style, preferred);
          for (let i = 0; i < pieces.length - 1; i += 1) pushLine(pieces[i]);
          current = pieces[pieces.length - 1] || '';
        } else {
          current = token;
        }
      }
    }

    if (current !== '' || lines.length === 0) pushLine(current);
  }

  return lines.length ? lines : [''];
}

/**
 * Convenience: set font + draw one wrapped block. Returns the next y.
 */
export function writePdfTextBlock(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  opts: {
    style?: PdfFontStyle;
    preferred?: PdfPreferredFont;
    ensureSpace?: (needed: number) => void;
  } = {}
): number {
  const lines = wrapPdfText(doc, text, maxWidth, opts);
  let cy = y;
  for (const line of lines) {
    opts.ensureSpace?.(lineHeight);
    writePdfText(doc, line, x, cy, opts);
    cy += lineHeight;
  }
  return cy;
}

/** Gather every string that will appear in a PDF so fonts can be preloaded. */
export function collectExportText(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join('\n');
}

export function getRegisteredPdfFonts(doc: jsPDF): PdfFontKey[] {
  return [...getDocState(doc).registered];
}

export { detectRequiredFontKeys, PDF_FONT_CATALOG };
