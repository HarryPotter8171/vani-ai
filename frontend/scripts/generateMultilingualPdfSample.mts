/**
 * Generate a sample PDF containing text from every supported language.
 *
 * From frontend/:
 *   npx vite-node scripts/generateMultilingualPdfSample.mts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';
import {
  LANGUAGE_SCRIPT_MAP,
  PDF_FONT_CATALOG,
  detectRequiredFontKeys,
} from '../lib/export/pdfFontCatalog';
import {
  ensureUnicodePdfFonts,
  getRegisteredPdfFonts,
  wrapPdfText,
  writePdfText,
} from '../lib/export/unicodePdfFont';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../tmp');
const outPath = path.join(outDir, 'multilingual-unicode-sample.pdf');
const reportPath = path.join(outDir, 'multilingual-pdf-report.json');

async function main() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const allText = Object.values(LANGUAGE_SCRIPT_MAP)
    .map((e) => `${e.label}: ${e.sample}`)
    .join('\n');

  const tLoad0 = performance.now();
  await ensureUnicodePdfFonts(doc, allText);
  const loadMs = performance.now() - tLoad0;

  const margin = 48;
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  doc.setFontSize(16);
  writePdfText(doc, 'VANI AI — Worldwide Multilingual PDF Sample', margin, y, {
    style: 'bold',
  });
  y += 22;

  doc.setFontSize(9);
  doc.setTextColor(100);
  writePdfText(
    doc,
    `Auto script detection · Noto embedded fonts · Generated ${new Date().toISOString()}`,
    margin,
    y
  );
  y += 18;
  doc.setTextColor(29, 29, 31);

  // Mixed-script stress line
  doc.setFontSize(11);
  writePdfText(doc, 'Mixed: Hello नमस्ते مرحبا 你好 こんにちは 안녕하세요', margin, y);
  y += 20;

  doc.setFontSize(10);
  const tDraw0 = performance.now();
  for (const [code, entry] of Object.entries(LANGUAGE_SCRIPT_MAP)) {
    const fonts = [...detectRequiredFontKeys(entry.sample)]
      .map((k) => PDF_FONT_CATALOG[k].family)
      .join(', ');
    const line = `${entry.label} (${code}): ${entry.sample}`;
    const wrapped = wrapPdfText(doc, line, maxWidth);
    for (const w of wrapped) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      writePdfText(doc, w, margin, y);
      y += 13;
    }
    if (fonts) {
      doc.setFontSize(7);
      doc.setTextColor(140);
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      writePdfText(doc, `  → ${fonts || 'Helvetica (WinAnsi)'}`, margin, y);
      y += 10;
      doc.setFontSize(10);
      doc.setTextColor(29, 29, 31);
    }
  }
  const drawMs = performance.now() - tDraw0;

  // Markdown structure smoke
  doc.addPage();
  y = margin;
  doc.setFontSize(14);
  writePdfText(doc, 'Structure preservation', margin, y, { style: 'bold' });
  y += 20;
  doc.setFontSize(10);
  const bullets = [
    '• Bullet list item with हिंदी',
    '1. Ordered item with العربية',
    'Code: const x = "你好";',
  ];
  for (const b of bullets) {
    writePdfText(doc, b, margin, y);
    y += 14;
  }

  const registered = getRegisteredPdfFonts(doc);
  fs.mkdirSync(outDir, { recursive: true });
  const buf = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outPath, buf);

  const fontDir = path.resolve(__dirname, '../public/fonts/pdf');
  const fontFiles = fs.existsSync(fontDir)
    ? fs.readdirSync(fontDir).filter((f) => /\.(ttf|otf)$/i.test(f))
    : [];
  let fontsBytes = 0;
  for (const f of fontFiles) {
    fontsBytes += fs.statSync(path.join(fontDir, f)).size;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    samplePdf: outPath,
    samplePdfBytes: buf.length,
    pages: doc.getNumberOfPages(),
    languages: Object.keys(LANGUAGE_SCRIPT_MAP).length,
    fontsRegistered: registered.map((k) => ({
      key: k,
      family: PDF_FONT_CATALOG[k].family,
      file: PDF_FONT_CATALOG[k].file,
    })),
    fontAssetsOnDisk: {
      count: fontFiles.length,
      totalBytes: fontsBytes,
      totalMB: Math.round((fontsBytes / (1024 * 1024)) * 10) / 10,
      files: fontFiles,
    },
    performance: {
      fontLoadMs: Math.round(loadMs),
      drawMs: Math.round(drawMs),
    },
    notes: [
      'Fonts are served from /public/fonts/pdf and lazy-loaded per export (not inlined in the JS bundle).',
      'JS bundle no longer embeds Noto Devanagari base64 (~286 KB savings vs prior approach).',
      'Tibetan uses Noto Serif Tibetan (no Sans Regular upstream).',
      'Arabic/Persian/Urdu use presentation-form reshaping + visual BiDi (not full HarfBuzz).',
      'Complex Indic conjuncts depend on jsPDF glyph cmap; OpenType GSUB shaping is limited.',
    ],
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Wrote ${outPath} (${buf.length} bytes, ${report.pages} pages)`);
  console.log(`Fonts registered: ${registered.join(', ')}`);
  console.log(`Font load ${report.performance.fontLoadMs}ms · draw ${report.performance.drawMs}ms`);
  console.log(`Disk font assets: ${report.fontAssetsOnDisk.totalMB} MB (${report.fontAssetsOnDisk.count} files)`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
