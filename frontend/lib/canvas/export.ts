import { jsPDF } from 'jspdf';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { downloadBlob, downloadTextFile } from '@/lib/export/download';
import {
  collectExportText,
  ensureUnicodePdfFonts,
  wrapPdfText,
  writePdfText,
} from '@/lib/export/unicodePdfFont';
import type { CanvasDocument, CanvasExportFormat, CanvasType } from '@/lib/canvas/types';
import { CANVAS_TYPE_LABELS } from '@/lib/canvas/types';

export type { CanvasExportFormat };
function safeFilename(title: string, ext: string): string {
  const base =
    (title || 'canvas')
      .normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'canvas';
  return `${base}.${ext}`;
}

function toHtmlDocument(title: string, body: string, type: CanvasType): string {
  const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (type === 'html') {
    if (/<html[\s>]/i.test(body)) return body;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapedTitle}</title></head><body>${body}</body></html>`;
  }

  const content =
    type === 'markdown' || type === 'richtext' || type === 'plaintext'
      ? `<pre style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6">${escapeHtml(body)}</pre>`
      : `<pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px">${escapeHtml(body)}</pre>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapedTitle}</title>
  <style>body{margin:40px;color:#1d1d1f;background:#fff}</style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  ${content}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toMarkdownExport(doc: CanvasDocument): string {
  if (doc.type === 'markdown') return doc.content;
  return `# ${doc.title}\n\n\`\`\`${doc.language || doc.type}\n${doc.content}\n\`\`\`\n`;
}

export async function exportCanvas(
  doc: CanvasDocument,
  format: CanvasExportFormat
): Promise<void> {
  const title = doc.title || 'Canvas';

  if (format === 'txt') {
    downloadTextFile(doc.content, safeFilename(title, 'txt'), 'text/plain');
    return;
  }

  if (format === 'markdown') {
    downloadTextFile(toMarkdownExport(doc), safeFilename(title, 'md'), 'text/markdown');
    return;
  }

  if (format === 'html') {
    downloadTextFile(
      toHtmlDocument(title, doc.content, doc.type),
      safeFilename(title, 'html'),
      'text/html'
    );
    return;
  }

  if (format === 'pdf') {
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    await ensureUnicodePdfFonts(
      pdf,
      collectExportText([title, CANVAS_TYPE_LABELS[doc.type], doc.content])
    );
    pdf.setProperties({
      title,
      subject: 'Canvas export',
      author: 'VANI AI',
      creator: 'VANI AI',
    });
    const margin = 54;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    pdf.setFontSize(16);
    writePdfText(pdf, title, margin, y, { style: 'bold' });
    y += 22;

    pdf.setFontSize(9);
    pdf.setTextColor(120);
    writePdfText(pdf, `${CANVAS_TYPE_LABELS[doc.type]} · VANI Canvas`, margin, y, {
      style: 'normal',
    });
    y += 20;
    pdf.setTextColor(29, 29, 31);
    pdf.setFontSize(10);

    const preferred =
      doc.type === 'code' ||
      doc.type === 'html' ||
      doc.type === 'react' ||
      doc.type === 'json' ||
      doc.type === 'csv' ||
      doc.type === 'mermaid'
        ? 'courier'
        : 'helvetica';
    const lines = wrapPdfText(pdf, doc.content || ' ', maxWidth, { preferred });
    for (const line of lines) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      writePdfText(pdf, line, margin, y, { preferred });
      y += 13;
    }

    pdf.save(safeFilename(title, 'pdf'));
    return;
  }

  if (format === 'docx') {
    const paragraphs = (doc.content || ' ').split(/\n/).map((line) => {
      if (line.startsWith('# ')) {
        return new Paragraph({
          text: line.replace(/^#\s+/, ''),
          heading: HeadingLevel.HEADING_1,
        });
      }
      if (line.startsWith('## ')) {
        return new Paragraph({
          text: line.replace(/^##\s+/, ''),
          heading: HeadingLevel.HEADING_2,
        });
      }
      return new Paragraph({
        children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })],
        spacing: { after: 80 },
      });
    });

    const document = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: title,
              heading: HeadingLevel.TITLE,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `${CANVAS_TYPE_LABELS[doc.type]} · Exported from VANI`,
                  italics: true,
                  size: 18,
                  color: '888888',
                }),
              ],
              spacing: { after: 240 },
            }),
            ...paragraphs,
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(document);
    downloadBlob(blob, safeFilename(title, 'docx'));
  }
}
