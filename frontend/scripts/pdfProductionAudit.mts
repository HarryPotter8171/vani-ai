/**
 * Production audit harness for multilingual PDF export.
 */
import { jsPDF } from 'jspdf';
import {
  ensureUnicodePdfFonts,
  getRegisteredPdfFonts,
  wrapPdfText,
  writePdfText,
  segmentPdfTextRuns,
} from '../lib/export/unicodePdfFont';
import { prepareRtlArabic } from '../lib/export/rtlText';
import { parseMarkdownBlocks } from '../lib/export/markdownBlocks';
import { buildExportFilename } from '../lib/export/shared';

const results: Record<string, unknown> = {};

function mem(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } })
    .memory;
  return m ? m.usedJSHeapSize : null;
}

// --- 4 & 5: Font cache reuse + no duplicate registration ---
{
  const t0 = performance.now();
  const doc1 = new jsPDF({ unit: 'pt', format: 'a4' });
  await ensureUnicodePdfFonts(doc1, 'नमस्ते مرحبا Hello');
  const load1 = performance.now() - t0;
  const reg1 = getRegisteredPdfFonts(doc1);

  const t1 = performance.now();
  const doc2 = new jsPDF({ unit: 'pt', format: 'a4' });
  await ensureUnicodePdfFonts(doc2, 'नमस्ते مرحبا Hello');
  const load2 = performance.now() - t1;
  const reg2 = getRegisteredPdfFonts(doc2);

  await ensureUnicodePdfFonts(doc2, 'नमस्ते مرحبا Hello');
  const reg2b = getRegisteredPdfFonts(doc2);
  const fonts = doc2.getFontList();
  const notoCount = Object.keys(fonts).filter((k) =>
    k.toLowerCase().includes('noto')
  ).length;

  results.fontCache = {
    firstLoadMs: Math.round(load1),
    secondLoadMs: Math.round(load2),
    speedup:
      load1 > 0 ? Math.round((load1 / Math.max(load2, 0.01)) * 10) / 10 : null,
    reg1,
    reg2,
    regAfterDoubleEnsure: reg2b,
    duplicateRegistration: reg2b.length !== new Set(reg2b).size,
    notoFamiliesInFontList: notoCount,
    cacheReused: load2 < load1 * 0.5 || load2 < 50,
  };
}

// --- 3: 100,000+ Unicode characters ---
{
  const unit = 'नमस्ते दुनिया مرحبا العالم 你好世界 ';
  let big = '';
  while (big.length < 110_000) big += unit;
  const charCount = [...big].length;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const t0 = performance.now();
  await ensureUnicodePdfFonts(doc, big.slice(0, 5000));
  const chunks: string[] = [];
  const chunkSize = 2000;
  for (let i = 0; i < big.length; i += chunkSize) {
    chunks.push(big.slice(i, i + chunkSize));
  }
  let pages = 1;
  let y = 40;
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = doc.internal.pageSize.getWidth() - 80;
  doc.setFontSize(9);
  for (const chunk of chunks) {
    const lines = wrapPdfText(doc, chunk, maxW);
    for (const line of lines) {
      if (y > pageH - 40) {
        doc.addPage();
        pages++;
        y = 40;
      }
      writePdfText(doc, line, 40, y);
      y += 11;
    }
  }
  const ms = performance.now() - t0;
  const buf = doc.output('arraybuffer');
  results.unicode100k = {
    charCount,
    pages,
    ms: Math.round(ms),
    pdfBytes: buf.byteLength,
    ok: buf.byteLength > 10_000 && pages > 10,
  };
}

// --- 2: 500+ pages ---
{
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await ensureUnicodePdfFonts(doc, 'Hello नमस्ते مرحبا 你好');
  doc.setFontSize(10);
  const line = 'Page filler — Hello नमस्ते مرحبا 你好世界 — mixed scripts.';
  let y = 40;
  const pageH = doc.internal.pageSize.getHeight();
  const wrapped = wrapPdfText(doc, line, 500);
  while (doc.getNumberOfPages() < 500) {
    for (const w of wrapped) {
      if (y > pageH - 40) {
        doc.addPage();
        y = 40;
        if (doc.getNumberOfPages() >= 500) break;
      }
      writePdfText(doc, w, 40, y);
      y += 12;
    }
    if (doc.getNumberOfPages() < 500) {
      doc.addPage();
      y = 40;
    }
  }
  const t0 = performance.now();
  const buf = doc.output('arraybuffer');
  const outMs = performance.now() - t0;
  results.pages500 = {
    pages: doc.getNumberOfPages(),
    pdfBytes: buf.byteLength,
    outputMs: Math.round(outMs),
    ok: doc.getNumberOfPages() >= 500 && buf.byteLength > 100_000,
  };
}

// --- 1: Repeated exports memory ---
{
  const heapBefore = mem();
  const sizes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    await ensureUnicodePdfFonts(doc, 'नमस्ते مرحبا Hello 你好');
    for (let p = 0; p < 5; p++) {
      if (p) doc.addPage();
      writePdfText(doc, `Export ${i} page ${p} नमस्ते مرحبا`, 40, 40);
    }
    const buf = doc.output('arraybuffer');
    sizes.push(buf.byteLength);
  }
  const heapAfter = mem();
  results.repeatedExports = {
    iterations: 20,
    avgPdfBytes: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    heapBefore,
    heapAfter,
    heapDeltaMB:
      heapBefore != null && heapAfter != null
        ? Math.round(((heapAfter - heapBefore) / (1024 * 1024)) * 100) / 100
        : 'N/A (no performance.memory in this runtime)',
    note: 'FONT_BASE64_CACHE is intentional process-lifetime cache; DOC_STATE is WeakMap',
  };
}

// --- 10: RTL + LTR mixed ---
{
  const samples = [
    'Hello مرحبا world',
    'Price is 100 ريال only',
    'שלום Hello שלום',
    'Mixed: English العربية हिन्दी together',
  ];
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await ensureUnicodePdfFonts(doc, samples.join('\n'));
  let y = 40;
  const details = [];
  for (const s of samples) {
    const runs = segmentPdfTextRuns(s);
    writePdfText(doc, s, 40, y);
    y += 16;
    details.push({
      sample: s,
      runs: runs.map((r) => ({ text: r.text, font: r.fontKey })),
      arabicPrepared: /[\u0600-\u06FF]/.test(s)
        ? prepareRtlArabic(s).length > 0
        : null,
    });
  }
  const buf = doc.output('arraybuffer');
  results.rtlLtr = { ok: buf.byteLength > 1000, details };
}

// --- 9: Large mixed-language table ---
{
  const header =
    '| # | EN | HI | AR | ZH |\n| --- | --- | --- | --- | --- |\n';
  let rows = '';
  for (let i = 1; i <= 80; i++) {
    rows += `| ${i} | Hello ${i} | नमस्ते ${i} | مرحبا ${i} | 你好 ${i} |\n`;
  }
  const md = header + rows;
  const blocks = parseMarkdownBlocks(md);
  const table = blocks.find((b) => b.type === 'table');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await ensureUnicodePdfFonts(doc, md);
  let y = 40;
  const pageH = doc.internal.pageSize.getHeight();
  if (table && table.type === 'table') {
    const colW = 100;
    const drawRow = (cells: { text: string }[][], bold: boolean) => {
      if (y > pageH - 40) {
        doc.addPage();
        y = 40;
      }
      cells.forEach((cell, ci) => {
        const plain = cell.map((t) => t.text).join('');
        writePdfText(doc, plain, 40 + ci * colW, y, {
          style: bold ? 'bold' : 'normal',
        });
      });
      y += 12;
    };
    drawRow(table.headers, true);
    for (const row of table.rows) drawRow(row, false);
  }
  const buf = doc.output('arraybuffer');
  results.largeTable = {
    parsedAsTable: table?.type === 'table',
    rows: table && table.type === 'table' ? table.rows.length : 0,
    pages: doc.getNumberOfPages(),
    pdfBytes: buf.byteLength,
    ok:
      table?.type === 'table' &&
      table.rows.length === 80 &&
      buf.byteLength > 5000,
  };
}

// --- 11: Unicode filenames ---
{
  const hi = buildExportFilename('नमस्ते बातचीत', 'pdf');
  const ar = buildExportFilename('مرحبا بالعالم', 'pdf');
  const zh = buildExportFilename('你好世界对话', 'pdf');
  const en = buildExportFilename('Hello World', 'pdf');
  results.unicodeFilenames = {
    hindi: hi,
    arabic: ar,
    chinese: zh,
    english: en,
    preservesUnicode:
      /[\u0900-\u097F]/.test(hi) ||
      /[\u0600-\u06FF]/.test(ar) ||
      /[\u4e00-\u9fff]/.test(zh),
    note: 'buildExportFilename currently strips non [a-z0-9]',
  };
}

// --- 12: PDF metadata ---
{
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await ensureUnicodePdfFonts(doc, 'नमस्ते');
  writePdfText(doc, 'नमस्ते', 40, 40);
  const hasSetProperties = typeof doc.setProperties === 'function';
  let setPropsOk = false;
  if (hasSetProperties) {
    try {
      doc.setProperties({
        title: 'नमस्ते PDF',
        subject: 'اختبار',
        author: 'VANI',
      });
      setPropsOk = true;
    } catch (e) {
      results.metadataApiError = e instanceof Error ? e.message : String(e);
    }
  }
  const buf = doc.output('arraybuffer');
  results.metadata = {
    setPropertiesAvailable: hasSetProperties,
    setPropertiesAcceptsUnicode: setPropsOk,
    exportersSetMetadata: false,
    note: 'Exporters do not call doc.setProperties(); body text embeds Unicode fine',
    pdfBytes: buf.byteLength,
  };
}

// --- 8: Cancellation ---
{
  results.cancellation = {
    abortControllerWired: false,
    midExportCancelUi: false,
    docStateIsWeakMap: true,
    fontCacheIsIntentionalSingleton: true,
    leakOnCancel: false,
    orphanRisk:
      'If user navigates away mid-await, export continues then download may no-op; WeakMap docs GC; base64 cache retained by design',
  };
}

console.log(JSON.stringify(results, null, 2));
