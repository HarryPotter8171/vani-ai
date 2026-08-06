import { PDF_PAGE_MAX_CHARS } from "../config.js";
import { normalizePlainText } from "../../parsers/shared.js";

/**
 * Detect headings from page text using typographic heuristics.
 * Returns [{ text, page, level }] where level is 1–3.
 */
export function extractHeadings(pages = []) {
  const headings = [];
  const seen = new Set();

  for (const page of pages) {
    const pageNum = page.page;
    const lines = String(page.text || "")
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines.slice(0, 80)) {
      if (line.length < 3 || line.length > 120) continue;
      if (/^page\s+\d+/i.test(line)) continue;

      let level = 0;
      if (/^[A-Z0-9][A-Z0-9\s\-&,.:/()]{4,}$/.test(line) && /[A-Z]{3,}/.test(line)) {
        level = 1;
      } else if (/^\d+(\.\d+)*\.?\s+\S/.test(line) && line.length < 100) {
        level = line.match(/\./g)?.length >= 2 ? 3 : 2;
      } else if (
        /^(chapter|section|article|clause|appendix|schedule)\b/i.test(line)
      ) {
        level = 1;
      } else if (
        /^(abstract|introduction|conclusion|references|summary|experience|education|skills)\b/i.test(
          line
        )
      ) {
        level = 2;
      }

      if (!level) continue;
      const key = `${pageNum}:${line.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      headings.push({ text: line, page: pageNum, level });
    }
  }

  return headings;
}

/**
 * Heuristic + native table extraction → structured JSON:
 * [{ columns: [...], rows: [...], page }]
 */
export function extractTablesFromPages(pages = [], nativeTables = []) {
  const tables = [];

  for (const nt of nativeTables) {
    const page = nt.page || nt.num || null;
    const raw = nt.tables || (Array.isArray(nt) ? [nt] : []);
    for (const table of raw) {
      const matrix = normalizeMatrix(table);
      if (!matrix) continue;
      tables.push(matrixToStructured(matrix, page));
    }
  }

  for (const page of pages) {
    const found = detectTextTables(page.text || "", page.page);
    for (const t of found) tables.push(t);
  }

  return dedupeTables(tables);
}

function normalizeMatrix(table) {
  if (!table) return null;
  if (Array.isArray(table) && Array.isArray(table[0])) return table;
  if (Array.isArray(table?.rows)) return table.rows;
  if (Array.isArray(table?.data)) return table.data;
  return null;
}

function matrixToStructured(matrix, page) {
  const cols = Math.max(...matrix.map((r) => r.length), 0);
  if (cols < 2 || matrix.length < 2) return null;
  const normalized = matrix.map((row) => {
    const next = row.map((c) => String(c ?? "").trim());
    while (next.length < cols) next.push("");
    return next.slice(0, cols);
  });
  const columns = normalized[0].map((c, i) => c || `Column ${i + 1}`);
  const rows = normalized.slice(1).map((r) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = r[i] ?? "";
    });
    return obj;
  });
  return {
    columns,
    rows: rows.map((r) => columns.map((c) => r[c])),
    page: page ?? null,
  };
}

/**
 * Detect pipe / whitespace-aligned tables in plain text.
 */
export function detectTextTables(text, page) {
  const lines = String(text || "")
    .split(/\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());

  const tables = [];
  let i = 0;
  while (i < lines.length) {
    const pipe = tryPipeTable(lines, i);
    if (pipe) {
      const structured = matrixToStructured(pipe.matrix, page);
      if (structured) tables.push(structured);
      i = pipe.next;
      continue;
    }
    const ws = tryWhitespaceTable(lines, i);
    if (ws) {
      const structured = matrixToStructured(ws.matrix, page);
      if (structured) tables.push(structured);
      i = ws.next;
      continue;
    }
    i += 1;
  }
  return tables;
}

function tryPipeTable(lines, start) {
  if (!lines[start]?.includes("|")) return null;
  const matrix = [];
  let i = start;
  while (i < lines.length && lines[i].includes("|")) {
    const cells = lines[i]
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => !(idx === 0 && arr[0] === "") && !(idx === arr.length - 1 && arr[arr.length - 1] === ""));
    // Skip markdown separator rows
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) {
      i += 1;
      continue;
    }
    if (cells.length >= 2) matrix.push(cells);
    else break;
    i += 1;
  }
  if (matrix.length < 2) return null;
  return { matrix, next: i };
}

function tryWhitespaceTable(lines, start) {
  // Need ≥3 consecutive lines with ≥2 multi-space gaps aligned-ish.
  const block = [];
  let i = start;
  while (i < lines.length && /\S\s{2,}\S/.test(lines[i])) {
    block.push(lines[i]);
    i += 1;
    if (block.length >= 40) break;
  }
  if (block.length < 3) return null;

  const matrix = block.map((line) =>
    line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
  );
  const colCounts = matrix.map((r) => r.length);
  const multi = colCounts.filter((c) => c >= 2).length;
  if (multi < 3 || multi / matrix.length < 0.7) return null;

  const freq = new Map();
  for (const c of colCounts) freq.set(c, (freq.get(c) || 0) + 1);
  let modal = 2;
  let best = 0;
  for (const [c, n] of freq) {
    if (c >= 2 && n >= best) {
      best = n;
      modal = c;
    }
  }
  const aligned = matrix
    .filter((r) => r.length >= 2)
    .map((r) => {
      if (r.length === modal) return r;
      if (r.length > modal) return r.slice(0, modal);
      const next = [...r];
      while (next.length < modal) next.push("");
      return next;
    });
  if (aligned.length < 3) return null;
  return { matrix: aligned, next: i };
}

function dedupeTables(tables) {
  const out = [];
  const seen = new Set();
  for (const t of tables) {
    if (!t) continue;
    const key = `${t.page}|${t.columns.join(",")}|${JSON.stringify(t.rows).slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Extract form-like key/value pairs from page text.
 */
export function extractForms(pages = []) {
  const fields = [];
  const kvRe =
    /^([A-Za-z][A-Za-z0-9 /&.\-]{1,60}?)\s*[:=\-–]\s*(.+)$/;

  for (const page of pages) {
    const lines = String(page.text || "").split(/\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 200) continue;
      const m = trimmed.match(kvRe);
      if (!m) continue;
      const key = m[1].trim();
      const value = m[2].trim();
      if (key.length < 2 || value.length < 1) continue;
      if (/^(http|www\.)/i.test(key)) continue;
      fields.push({ key, value, page: page.page });
    }
  }
  return fields;
}

/**
 * Inventory embedded images from pdf-parse getImage() result.
 */
export function extractImageInventory(imageResult) {
  const images = [];
  for (const page of imageResult?.pages || []) {
    const pageNum = page.pageNumber || page.num || null;
    for (const img of page.images || []) {
      images.push({
        page: pageNum,
        name: img.name || img.id || null,
        width: img.width ?? null,
        height: img.height ?? null,
        kind: img.kind || img.type || null,
      });
    }
  }
  return images;
}

/**
 * Cap page text for memory efficiency.
 */
export function truncatePageText(text, limit = PDF_PAGE_MAX_CHARS) {
  const normalized = normalizePlainText(text || "");
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}\n\n[Truncated]`;
}
