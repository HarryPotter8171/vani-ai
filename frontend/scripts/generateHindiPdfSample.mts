/**
 * Generate a small Hindi verification PDF using the production Unicode font path.
 *
 * From frontend/:
 *   npx vite-node scripts/generateHindiPdfSample.mts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';
import {
  ensureUnicodePdfFonts,
  wrapPdfText,
  writePdfText,
} from '../lib/export/unicodePdfFont';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../tmp');
const outPath = path.join(outDir, 'hindi-unicode-sample.pdf');

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
ensureUnicodePdfFonts(doc);

const margin = 54;
const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
let y = margin;

doc.setFontSize(18);
writePdfText(doc, 'VANI AI — Unicode PDF Verification', margin, y, {
  style: 'bold',
});
y += 28;

doc.setFontSize(11);
doc.setTextColor(80);
writePdfText(doc, 'Noto Sans Devanagari + Helvetica mixed-script sample', margin, y);
y += 24;
doc.setTextColor(29, 29, 31);

const samples = [
  'नमस्ते! यह एक हिंदी परीक्षण है।',
  'Mixed: Hello दुनिया — English + हिंदी in one line.',
  'Bullet list style: आज का मौसम अच्छा है।',
  'Emoji stripped gracefully: नमस्ते 🙏 (prayer emoji removed)',
  'Digits + Hindi: आज तापमान 32°C है।',
];

doc.setFontSize(12);
for (const sample of samples) {
  const lines = wrapPdfText(doc, sample, maxWidth);
  for (const line of lines) {
    writePdfText(doc, line, margin, y);
    y += 18;
  }
  y += 8;
}

doc.setFontSize(9);
doc.setTextColor(120);
writePdfText(
  doc,
  `Generated ${new Date().toISOString()} · font: NotoSansDevanagari`,
  margin,
  y
);

fs.mkdirSync(outDir, { recursive: true });
const buf = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
