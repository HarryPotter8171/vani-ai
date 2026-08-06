/**
 * Export Deep Research reports to Markdown and PDF.
 */

import { jsPDF } from 'jspdf';
import { downloadBlob, downloadTextFile } from '@/lib/export/download';
import {
  parseMarkdownBlocks,
  type InlineToken,
  type MarkdownBlock,
} from '@/lib/export/markdownBlocks';
import {
  collectExportText,
  ensureUnicodePdfFonts,
  wrapPdfText,
  writePdfText,
} from '@/lib/export/unicodePdfFont';
import type { ResearchCitation, ResearchState } from './types';

export function buildResearchMarkdown(state: ResearchState): string {
  const title = state.plan?.title || state.query || 'Deep Research Report';
  const lines: string[] = [
    `# ${title}`,
    '',
    `_Exported from VANI AI Deep Research on ${new Date().toLocaleString()}_`,
  ];

  if (state.confidence != null) {
    lines.push('', `**Confidence:** ${Math.round(state.confidence * 100)}%`);
  }

  if (state.query) {
    lines.push('', `**Question:** ${state.query}`);
  }

  lines.push('', '---', '', state.report.trim() || '_No report content._');

  if (state.followUpQuestions.length) {
    lines.push('', '## Follow-up questions', '');
    for (const q of state.followUpQuestions) lines.push(`- ${q}`);
  }

  if (state.citations.length && !/##\s+References/i.test(state.report)) {
    lines.push('', '## References', '');
    for (const c of state.citations) {
      lines.push(`${c.id}. [${c.title}](${c.url})`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function downloadResearchMarkdown(state: ResearchState): void {
  const md = buildResearchMarkdown(state);
  const slug = slugify(state.plan?.title || state.query || 'research');
  downloadTextFile(md, `vani-research-${slug}.md`, 'text/markdown');
}

export async function downloadResearchPdf(state: ResearchState): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const title = state.plan?.title || state.query || 'Deep Research Report';
  const md = buildResearchMarkdown(state);
  await ensureUnicodePdfFonts(
    doc,
    collectExportText([
      title,
      state.query,
      state.report,
      ...state.followUpQuestions,
      ...state.citations.map((c) => `${c.title} ${c.url}`),
      md,
    ])
  );
  doc.setProperties({
    title,
    subject: 'Deep Research export',
    author: 'VANI AI',
    creator: 'VANI AI',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 54;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFontSize(18);
  const titleLines = wrapPdfText(doc, title, maxWidth, { style: 'bold' });
  ensure(titleLines.length * 22);
  for (const line of titleLines) {
    writePdfText(doc, line, margin, y, { style: 'bold' });
    y += 22;
  }
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 126);
  const meta = [
    `VANI AI Deep Research · ${new Date().toLocaleString()}`,
    state.confidence != null ? `Confidence ${Math.round(state.confidence * 100)}%` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  ensure(14);
  writePdfText(doc, meta, margin, y, { style: 'normal' });
  y += 22;
  doc.setTextColor(29, 29, 31);

  const blocks = parseMarkdownBlocks(state.report || '');
  for (const block of blocks) {
    y = drawBlock(doc, block, margin, maxWidth, y, pageHeight);
  }

  if (state.citations.length) {
    ensure(28);
    doc.setFontSize(13);
    writePdfText(doc, 'References', margin, y, { style: 'bold' });
    y += 18;
    doc.setFontSize(9.5);
    for (const c of state.citations) {
      const line = `${c.id}. ${c.title} — ${c.url}`;
      const wrapped = wrapPdfText(doc, line, maxWidth, { style: 'normal' });
      ensure(wrapped.length * 12 + 4);
      for (const w of wrapped) {
        writePdfText(doc, w, margin, y, { style: 'normal' });
        y += 12;
      }
      y += 4;
    }
  }

  const slug = slugify(title);
  downloadBlob(doc.output('blob'), `vani-research-${slug}.pdf`);
}

function drawBlock(
  doc: jsPDF,
  block: MarkdownBlock,
  x: number,
  maxWidth: number,
  y: number,
  pageHeight: number
): number {
  const margin = 54;
  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    return y;
  };

  if (block.type === 'heading') {
    const size = Math.max(11, 16 - (block.level - 1));
    doc.setFontSize(size);
    const lines = wrapPdfText(doc, tokensToPlain(block.tokens), maxWidth, {
      style: 'bold',
    });
    y = ensure(lines.length * (size + 4) + 8);
    y += 8;
    for (const line of lines) {
      writePdfText(doc, line, x, y, { style: 'bold' });
      y += size + 4;
    }
    return y;
  }

  if (block.type === 'paragraph' || block.type === 'quote') {
    const style = block.type === 'quote' ? 'italic' : 'normal';
    doc.setFontSize(10.5);
    const lines = wrapPdfText(doc, tokensToPlain(block.tokens), maxWidth, {
      style,
    });
    y = ensure(lines.length * 14 + 4);
    for (const line of lines) {
      writePdfText(doc, line, x, y, { style });
      y += 14;
    }
    return y + 4;
  }

  if (block.type === 'list') {
    doc.setFontSize(10.5);
    for (let i = 0; i < block.items.length; i += 1) {
      const prefix = block.ordered ? `${i + 1}. ` : '• ';
      const lines = wrapPdfText(
        doc,
        prefix + tokensToPlain(block.items[i]),
        maxWidth,
        { style: 'normal' }
      );
      y = ensure(lines.length * 14 + 2);
      for (const line of lines) {
        writePdfText(doc, line, x, y, { style: 'normal' });
        y += 14;
      }
      y += 2;
    }
    return y + 4;
  }

  if (block.type === 'code') {
    doc.setFontSize(9);
    const text = block.lines.join('\n');
    const lines = wrapPdfText(doc, text, maxWidth, { preferred: 'courier' });
    y = ensure(lines.length * 12 + 10);
    doc.setFillColor(244, 244, 247);
    doc.rect(x - 4, y - 10, maxWidth + 8, lines.length * 12 + 12, 'F');
    for (const line of lines) {
      writePdfText(doc, line, x, y, { preferred: 'courier' });
      y += 12;
    }
    return y + 14;
  }

  if (block.type === 'table') {
    doc.setFontSize(9);
    const colCount = Math.max(block.headers.length, 1);
    const colWidth = maxWidth / colCount;
    const drawRow = (cells: InlineToken[][], header: boolean) => {
      y = ensure(14);
      cells.forEach((cell, ci) => {
        const plain = tokensToPlain(cell);
        const lines = wrapPdfText(doc, plain || ' ', colWidth - 4, {
          style: header ? 'bold' : 'normal',
        });
        writePdfText(doc, lines[0] || ' ', x + ci * colWidth, y, {
          style: header ? 'bold' : 'normal',
        });
      });
      y += 12;
      doc.setDrawColor(220, 220, 225);
      doc.line(x, y - 2, x + maxWidth, y - 2);
    };
    drawRow(block.headers, true);
    for (const row of block.rows) drawRow(row, false);
    return y + 8;
  }

  if (block.type === 'hr') {
    y = ensure(16);
    doc.setDrawColor(220, 220, 225);
    doc.line(x, y, x + maxWidth, y);
    return y + 14;
  }

  return y + 6;
}

function tokensToPlain(tokens: InlineToken[]): string {
  return tokens.map((t) => t.text).join('');
}

function slugify(text: string): string {
  return (
    String(text)
      .normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'report'
  );
}

export function formatCitation(c: ResearchCitation): string {
  return `${c.label} ${c.title}${c.hostname ? ` (${c.hostname})` : ''}`;
}
