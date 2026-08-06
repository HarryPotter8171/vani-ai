/**
 * Best-effort table reconstruction from Tesseract word bounding boxes.
 * Clusters words into rows by Y, then into columns by X gaps.
 */

function wordCenterY(word) {
  const b = word?.bbox;
  if (!b) return 0;
  return (Number(b.y0) + Number(b.y1)) / 2;
}

function wordCenterX(word) {
  const b = word?.bbox;
  if (!b) return 0;
  return (Number(b.x0) + Number(b.x1)) / 2;
}

function wordWidth(word) {
  const b = word?.bbox;
  if (!b) return 0;
  return Math.max(1, Number(b.x1) - Number(b.x0));
}

/**
 * Collect words from Tesseract blocks hierarchy.
 * @param {import('tesseract.js').Block[]|null|undefined} blocks
 */
export function collectWordsFromBlocks(blocks) {
  const words = [];
  if (!Array.isArray(blocks)) return words;

  for (const block of blocks) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          const text = String(word?.text || "").trim();
          if (!text) continue;
          words.push({
            text,
            confidence:
              typeof word.confidence === "number" ? word.confidence : null,
            bbox: word.bbox
              ? {
                  x0: Number(word.bbox.x0),
                  y0: Number(word.bbox.y0),
                  x1: Number(word.bbox.x1),
                  y1: Number(word.bbox.y1),
                }
              : null,
          });
        }
      }
    }
  }
  return words;
}

/**
 * Cluster words into rows using median word height as the Y tolerance.
 * @param {Array<{text:string,bbox:object|null}>} words
 */
export function clusterRows(words) {
  if (!words.length) return [];

  const heights = words
    .map((w) => (w.bbox ? Math.max(1, w.bbox.y1 - w.bbox.y0) : 0))
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const medianH = heights.length
    ? heights[Math.floor(heights.length / 2)]
    : 16;
  const yTol = Math.max(8, medianH * 0.6);

  const sorted = [...words].sort((a, b) => wordCenterY(a) - wordCenterY(b));
  const rows = [];

  for (const word of sorted) {
    const y = wordCenterY(word);
    const last = rows[rows.length - 1];
    if (last && Math.abs(y - last.y) <= yTol) {
      last.words.push(word);
      last.y = (last.y * (last.words.length - 1) + y) / last.words.length;
    } else {
      rows.push({ y, words: [word] });
    }
  }

  for (const row of rows) {
    row.words.sort((a, b) => wordCenterX(a) - wordCenterX(b));
  }
  return rows;
}

/**
 * Split a row into cells when horizontal gaps exceed ~1.5× median word width.
 */
function splitRowIntoCells(rowWords) {
  if (!rowWords.length) return [];
  if (rowWords.length === 1) return [rowWords[0].text];

  const widths = rowWords.map(wordWidth).sort((a, b) => a - b);
  const medianW = widths[Math.floor(widths.length / 2)] || 12;
  const gapThreshold = Math.max(18, medianW * 1.5);

  const cells = [];
  let current = [rowWords[0]];

  for (let i = 1; i < rowWords.length; i += 1) {
    const prev = rowWords[i - 1];
    const next = rowWords[i];
    const gap =
      prev.bbox && next.bbox
        ? Number(next.bbox.x0) - Number(prev.bbox.x1)
        : 0;

    if (gap > gapThreshold) {
      cells.push(current.map((w) => w.text).join(" "));
      current = [next];
    } else {
      current.push(next);
    }
  }
  cells.push(current.map((w) => w.text).join(" "));
  return cells;
}

function escapeCell(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .trim();
}

/**
 * Build markdown table from a rectangular cell matrix.
 * @param {string[][]} matrix
 */
export function matrixToMarkdown(matrix) {
  if (!matrix.length) return "";
  const cols = Math.max(...matrix.map((r) => r.length));
  if (cols < 2) return "";

  const normalized = matrix.map((row) => {
    const next = [...row];
    while (next.length < cols) next.push("");
    return next.map(escapeCell);
  });

  const header = normalized[0];
  const sep = header.map(() => "---");
  const body = normalized.slice(1);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

/**
 * Detect tables from OCR blocks.
 * Returns structured tables + optional markdown appended to plain text.
 *
 * @param {import('tesseract.js').Block[]|null|undefined} blocks
 * @returns {{ tables: Array<{rows:string[][], markdown:string}>, markdown: string }}
 */
export function extractTablesFromBlocks(blocks) {
  const words = collectWordsFromBlocks(blocks);
  const rows = clusterRows(words);
  if (rows.length < 2) {
    return { tables: [], markdown: "" };
  }

  const matrix = rows.map((r) => splitRowIntoCells(r.words));
  const colCounts = matrix.map((r) => r.length);
  const multiColRows = colCounts.filter((c) => c >= 2).length;

  // Need a majority of rows with ≥2 columns to treat as a table.
  if (multiColRows < 2 || multiColRows / matrix.length < 0.5) {
    return { tables: [], markdown: "" };
  }

  // Align to modal column count so sparse rows don't explode width.
  const freq = new Map();
  for (const c of colCounts) freq.set(c, (freq.get(c) || 0) + 1);
  let modalCols = 2;
  let best = 0;
  for (const [c, n] of freq) {
    if (c >= 2 && n >= best) {
      best = n;
      modalCols = c;
    }
  }

  const aligned = matrix
    .filter((r) => r.length >= 2)
    .map((r) => {
      if (r.length === modalCols) return r;
      if (r.length > modalCols) return r.slice(0, modalCols);
      const next = [...r];
      while (next.length < modalCols) next.push("");
      return next;
    });

  if (aligned.length < 2) {
    return { tables: [], markdown: "" };
  }

  const markdown = matrixToMarkdown(aligned);
  if (!markdown) return { tables: [], markdown: "" };

  return {
    tables: [{ rows: aligned, markdown, columnCount: modalCols }],
    markdown,
  };
}
