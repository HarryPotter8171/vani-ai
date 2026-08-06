import { jsPDF } from 'jspdf';
import { downloadBlob } from '@/lib/export/download';
import {
  collectExportText,
  ensureUnicodePdfFonts,
  measurePdfTextWidth,
  writePdfText,
} from '@/lib/export/unicodePdfFont';

type Row = [string, string | number];

export async function exportAnalyticsPdf(
  title: string,
  rows: Row[],
  filename: string
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const corpus = collectExportText([
    title,
    ...rows.flatMap(([label, value]) => [String(label), String(value)]),
  ]);
  await ensureUnicodePdfFonts(doc, corpus);
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setProperties({
    title,
    subject: 'Analytics export',
    author: 'VANI AI',
    creator: 'VANI AI',
  });

  doc.setFontSize(16);
  doc.setTextColor(29, 29, 31);
  writePdfText(doc, title, margin, y, { style: 'bold' });
  y += 22;

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 126);
  writePdfText(doc, `Generated ${new Date().toLocaleString()}`, margin, y, {
    style: 'normal',
  });
  y += 28;

  doc.setDrawColor(225, 225, 230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFontSize(11);
  for (const [label, value] of rows) {
    if (y > 780) {
      doc.addPage();
      y = margin;
    }
    doc.setTextColor(80, 80, 86);
    writePdfText(doc, String(label), margin, y, { style: 'normal' });

    const valueText = String(value);
    doc.setTextColor(29, 29, 31);
    const valueWidth = measurePdfTextWidth(doc, valueText, 'bold', 'helvetica');
    writePdfText(doc, valueText, pageWidth - margin - valueWidth, y, {
      style: 'bold',
    });
    y += 20;
  }

  downloadBlob(doc.output('blob'), filename);
}
