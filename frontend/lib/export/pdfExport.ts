import { jsPDF } from 'jspdf';
import type { Message } from '@/lib/types';
import { EXPORT_ROLE_LABEL, buildExportFilename, getExportableMessages } from '@/lib/export/shared';
import { parseMarkdownBlocks, type InlineToken, type MarkdownBlock } from '@/lib/export/markdownBlocks';
import {
  collectExportText,
  ensureUnicodePdfFonts,
  measurePdfTextWidth,
  setPdfFontForText,
  wrapPdfText,
  writePdfText,
} from '@/lib/export/unicodePdfFont';

type RGB = [number, number, number];

const MARGIN = 54;
const FONT_BODY = 10.5;
const FONT_SMALL = 9;
const FONT_CODE = 9;
const PARAGRAPH_GAP = 10;
const HEADING_SIZES = [16, 14.5, 13, 12, 11.5, 11];

const COLOR = {
  text: [29, 29, 31] as RGB,
  muted: [120, 120, 126] as RGB,
  userLabel: [0, 113, 227] as RGB,
  assistantLabel: [10, 130, 80] as RGB,
  codeBg: [244, 244, 247] as RGB,
  codeText: [40, 40, 46] as RGB,
  border: [225, 225, 230] as RGB,
};

interface Cursor {
  y: number;
}

function ensureSpace(doc: jsPDF, cursor: Cursor, needed: number, pageHeight: number): void {
  if (cursor.y + needed > pageHeight - MARGIN) {
    doc.addPage();
    cursor.y = MARGIN;
  }
}

/**
 * Word-wraps a run of styled inline tokens (bold/italic/inline-code) inside
 * `maxWidth`, drawing each line as it's completed and paginating mid-run if
 * needed. This is the one place font/color switches happen mid-line, so
 * every other block renderer below is just a thin wrapper around it.
 */
function drawTokens(
  doc: jsPDF,
  tokens: InlineToken[],
  x: number,
  maxWidth: number,
  cursor: Cursor,
  pageHeight: number,
  baseFontSize: number,
  lineHeight: number,
  color: RGB = COLOR.text
): void {
  type Word = InlineToken;

  const words: Word[] = [];
  for (const token of tokens) {
    for (const piece of token.text.split(/\s+/)) {
      if (piece) words.push({ text: piece, bold: token.bold, italic: token.italic, code: token.code });
    }
  }
  if (!words.length) return;

  const styleForWord = (w: Word) =>
    w.code ? 'normal' : w.bold ? 'bold' : w.italic ? 'italic' : 'normal';
  const preferredForWord = (w: Word) => (w.code ? 'courier' : 'helvetica');

  const measureWord = (w: Word) => {
    const size = w.code ? Math.max(baseFontSize - 1, 7) : baseFontSize;
    doc.setFontSize(size);
    return measurePdfTextWidth(doc, w.text, styleForWord(w), preferredForWord(w));
  };

  doc.setFontSize(baseFontSize);
  setPdfFontForText(doc, ' ', 'normal', 'helvetica');
  const spaceWidth = doc.getTextWidth(' ');

  let lineWords: Word[] = [];
  let lineWidth = 0;

  const flushLine = () => {
    if (!lineWords.length) return;
    ensureSpace(doc, cursor, lineHeight, pageHeight);
    let cx = x;
    for (const w of lineWords) {
      const size = w.code ? Math.max(baseFontSize - 1, 7) : baseFontSize;
      doc.setFontSize(size);
      const wWidth = measureWord(w);
      if (w.code) {
        doc.setFillColor(...COLOR.codeBg);
        doc.rect(cx - 1.5, cursor.y - lineHeight * 0.72, wWidth + 3, lineHeight * 0.82, 'F');
        doc.setTextColor(...COLOR.codeText);
      } else {
        doc.setTextColor(...color);
      }
      writePdfText(doc, w.text, cx, cursor.y, {
        style: styleForWord(w),
        preferred: preferredForWord(w),
      });
      cx += wWidth + spaceWidth;
    }
    cursor.y += lineHeight;
    lineWords = [];
    lineWidth = 0;
  };

  const pushWord = (w: Word) => {
    const wWidth = measureWord(w);
    const projected = lineWidth + (lineWords.length ? spaceWidth : 0) + wWidth;
    if (projected > maxWidth && lineWords.length) {
      flushLine();
      lineWidth = wWidth;
      lineWords = [w];
    } else {
      lineWidth = projected;
      lineWords.push(w);
    }
  };

  for (const w of words) {
    const wWidth = measureWord(w);
    if (wWidth > maxWidth) {
      // Hard-wrap pathologically long tokens (e.g. unbroken URLs) so they
      // can never overflow the page width.
      const chunks = wrapPdfText(doc, w.text, maxWidth, {
        style: styleForWord(w),
        preferred: preferredForWord(w),
      });
      chunks.forEach((chunk) => pushWord({ ...w, text: chunk }));
    } else {
      pushWord(w);
    }
  }
  flushLine();

  doc.setTextColor(...COLOR.text);
}

function drawCodeBlock(
  doc: jsPDF,
  block: Extract<MarkdownBlock, { type: 'code' }>,
  x: number,
  maxWidth: number,
  cursor: Cursor,
  pageHeight: number
): void {
  const lineHeight = FONT_CODE * 1.45;
  const padding = 8;
  const innerWidth = maxWidth - padding * 2;

  doc.setFontSize(FONT_CODE);
  setPdfFontForText(doc, block.lines.join('\n') || ' ', 'normal', 'courier');

  const wrapped: string[] = [];
  for (const raw of block.lines.length ? block.lines : ['']) {
    const expanded = raw.replace(/\t/g, '    ');
    const split = wrapPdfText(doc, expanded || ' ', innerWidth, {
      preferred: 'courier',
    });
    wrapped.push(...(split.length ? split : ['']));
  }

  let idx = 0;
  while (idx < wrapped.length) {
    const available = pageHeight - MARGIN - cursor.y - padding * 2;
    const linesThisPage = Math.floor(available / lineHeight);
    if (linesThisPage < 1) {
      doc.addPage();
      cursor.y = MARGIN;
      continue;
    }

    const chunk = wrapped.slice(idx, idx + linesThisPage);
    const chunkHeight = chunk.length * lineHeight + padding * 2;

    doc.setFillColor(...COLOR.codeBg);
    doc.roundedRect(x, cursor.y, maxWidth, chunkHeight, 4, 4, 'F');
    doc.setTextColor(...COLOR.codeText);
    doc.setFontSize(FONT_CODE);

    let ty = cursor.y + padding + FONT_CODE * 0.8;
    for (const line of chunk) {
      writePdfText(doc, line, x + padding, ty, { preferred: 'courier' });
      ty += lineHeight;
    }

    cursor.y += chunkHeight;
    idx += chunk.length;

    if (idx < wrapped.length) {
      doc.addPage();
      cursor.y = MARGIN;
    }
  }

  doc.setTextColor(...COLOR.text);
  cursor.y += PARAGRAPH_GAP * 0.6;
}

function drawBlock(doc: jsPDF, block: MarkdownBlock, x: number, maxWidth: number, cursor: Cursor, pageHeight: number): void {
  switch (block.type) {
    case 'heading': {
      const size = HEADING_SIZES[Math.min(block.level - 1, HEADING_SIZES.length - 1)];
      const lineHeight = size * 1.35;
      ensureSpace(doc, cursor, lineHeight + 6, pageHeight);
      cursor.y += 6;
      drawTokens(doc, block.tokens, x, maxWidth, cursor, pageHeight, size, lineHeight);
      cursor.y += 2;
      break;
    }
    case 'paragraph':
      drawTokens(doc, block.tokens, x, maxWidth, cursor, pageHeight, FONT_BODY, FONT_BODY * 1.5);
      cursor.y += PARAGRAPH_GAP * 0.5;
      break;
    case 'quote': {
      const lineHeight = FONT_BODY * 1.5;
      const startY = cursor.y;
      drawTokens(doc, block.tokens, x + 14, maxWidth - 14, cursor, pageHeight, FONT_BODY, lineHeight, COLOR.muted);
      doc.setDrawColor(...COLOR.userLabel);
      doc.setLineWidth(2);
      doc.line(x + 4, startY - lineHeight * 0.72, x + 4, cursor.y - lineHeight * 0.72);
      cursor.y += PARAGRAPH_GAP * 0.5;
      break;
    }
    case 'list': {
      const lineHeight = FONT_BODY * 1.5;
      const indent = block.ordered ? 18 : 14;
      block.items.forEach((item, i) => {
        ensureSpace(doc, cursor, lineHeight, pageHeight);
        doc.setFontSize(FONT_BODY);
        doc.setTextColor(...COLOR.userLabel);
        writePdfText(doc, block.ordered ? `${i + 1}.` : '\u2022', x, cursor.y, {
          style: 'normal',
          preferred: 'helvetica',
        });
        drawTokens(doc, item, x + indent, maxWidth - indent, cursor, pageHeight, FONT_BODY, lineHeight);
      });
      cursor.y += PARAGRAPH_GAP * 0.5;
      break;
    }
    case 'code':
      drawCodeBlock(doc, block, x, maxWidth, cursor, pageHeight);
      break;
    case 'table': {
      const colCount = Math.max(block.headers.length, 1);
      const colWidth = maxWidth / colCount;
      const rowHeight = FONT_SMALL * 1.55;
      const drawRow = (cells: InlineToken[][], header: boolean) => {
        ensureSpace(doc, cursor, rowHeight + 4, pageHeight);
        const y0 = cursor.y;
        cells.forEach((cell, ci) => {
          const cellX = x + ci * colWidth + 3;
          const plain = cell.map((t) => t.text).join('');
          doc.setFontSize(FONT_SMALL);
          const lines = wrapPdfText(doc, plain || ' ', colWidth - 6, {
            style: header ? 'bold' : 'normal',
          });
          let ty = y0;
          for (const line of lines.slice(0, 3)) {
            writePdfText(doc, line, cellX, ty, {
              style: header ? 'bold' : 'normal',
            });
            ty += rowHeight * 0.85;
          }
        });
        cursor.y += rowHeight + 2;
        doc.setDrawColor(...COLOR.border);
        doc.setLineWidth(0.4);
        doc.line(x, cursor.y - 2, x + maxWidth, cursor.y - 2);
      };
      drawRow(block.headers, true);
      for (const row of block.rows) drawRow(row, false);
      cursor.y += PARAGRAPH_GAP * 0.5;
      break;
    }
    case 'hr':
      ensureSpace(doc, cursor, 16, pageHeight);
      cursor.y += 8;
      doc.setDrawColor(...COLOR.border);
      doc.setLineWidth(0.75);
      doc.line(x, cursor.y, x + maxWidth, cursor.y);
      cursor.y += 10;
      break;
  }
}

/**
 * Renders the conversation to a real, selectable-text PDF (not a rasterized
 * screenshot) — assistant replies go through the Markdown block parser so
 * headings, lists, blockquotes, tables, and fenced code blocks keep their
 * structure and formatting; user messages are drawn verbatim (preserving
 * explicit line breaks) since the chat UI never treats them as Markdown either.
 *
 * Multilingual: scripts are detected up-front and matching Noto faces are
 * embedded so Hindi, Arabic, CJK, etc. never fall back to Helvetica.
 */
export async function exportConversationToPdf(
  messages: Message[],
  title: string
): Promise<void> {
  const exportable = getExportableMessages(messages);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const corpus = collectExportText([
    title,
    ...exportable.flatMap((m) => [
      m.content,
      ...(m.attachments?.map((a) => a.name) ?? []),
    ]),
  ]);
  await ensureUnicodePdfFonts(doc, corpus);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const cursor: Cursor = { y: MARGIN };
  const docTitle = title.trim() || 'Conversation';
  doc.setProperties({
    title: docTitle,
    subject: 'Conversation export',
    author: 'VANI AI',
    creator: 'VANI AI',
  });

  doc.setFontSize(19);
  doc.setTextColor(...COLOR.text);
  for (const line of wrapPdfText(doc, docTitle, contentWidth, { style: 'bold' })) {
    ensureSpace(doc, cursor, 24, pageHeight);
    writePdfText(doc, line, MARGIN, cursor.y, { style: 'bold' });
    cursor.y += 24;
  }

  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(...COLOR.muted);
  writePdfText(
    doc,
    `Exported from VANI AI on ${new Date().toLocaleString()}`,
    MARGIN,
    cursor.y,
    { style: 'normal' }
  );
  cursor.y += 18;

  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, cursor.y, MARGIN + contentWidth, cursor.y);
  cursor.y += 24;

  exportable.forEach((message, index) => {
    ensureSpace(doc, cursor, 20, pageHeight);
    const label = EXPORT_ROLE_LABEL[message.role] ?? message.role;
    doc.setFontSize(10);
    doc.setTextColor(...(message.role === 'user' ? COLOR.userLabel : COLOR.assistantLabel));
    writePdfText(doc, label.toUpperCase(), MARGIN, cursor.y, { style: 'bold' });
    cursor.y += 16;

    if (message.content.trim()) {
      if (message.role === 'user') {
        for (const para of message.content.trim().split('\n')) {
          drawTokens(doc, [{ text: para }], MARGIN, contentWidth, cursor, pageHeight, FONT_BODY, FONT_BODY * 1.5);
        }
      } else {
        for (const block of parseMarkdownBlocks(message.content)) {
          drawBlock(doc, block, MARGIN, contentWidth, cursor, pageHeight);
        }
      }
    }

    if (message.attachments?.length) {
      doc.setFontSize(FONT_SMALL);
      doc.setTextColor(...COLOR.muted);
      for (const att of message.attachments) {
        ensureSpace(doc, cursor, 14, pageHeight);
        writePdfText(doc, `Attachment: ${att.name}`, MARGIN, cursor.y, {
          style: 'italic',
        });
        cursor.y += 14;
      }
      doc.setTextColor(...COLOR.text);
    }

    if (index < exportable.length - 1) {
      cursor.y += PARAGRAPH_GAP * 0.5;
      ensureSpace(doc, cursor, 12, pageHeight);
      doc.setDrawColor(...COLOR.border);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, cursor.y, MARGIN + contentWidth, cursor.y);
      cursor.y += PARAGRAPH_GAP;
    }
  });

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setPdfFontForText(doc, `${p} / ${pageCount}`, 'normal', 'helvetica');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR.muted);
    doc.text(`${p} / ${pageCount}`, pageWidth - MARGIN, pageHeight - 24, { align: 'right' });
  }

  doc.save(buildExportFilename(docTitle, 'pdf'));
}
