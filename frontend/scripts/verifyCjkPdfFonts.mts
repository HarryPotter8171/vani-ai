import { jsPDF } from 'jspdf';
import {
  ensureUnicodePdfFonts,
  getRegisteredPdfFonts,
  writePdfText,
} from '../lib/export/unicodePdfFont';

const cases: [string, string][] = [
  ['SC', '你好，世界 — PDF 导出。'],
  ['TC', '繁體中文 匯出 PDF'],
  ['JP', 'こんにちは世界'],
  ['KR', '안녕하세요'],
];

for (const [label, text] of cases) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await ensureUnicodePdfFonts(doc, text);
  writePdfText(doc, text, 40, 40);
  const buf = doc.output('arraybuffer');
  console.log(label, getRegisteredPdfFonts(doc).join(','), `bytes=${buf.byteLength}`);
}
