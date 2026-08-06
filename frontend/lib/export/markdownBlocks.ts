/**
 * A small, dependency-free Markdown block/inline parser used only for PDF
 * export — it's *not* a full CommonMark implementation, just enough to
 * faithfully reproduce what the chat UI's `react-markdown` renderer already
 * shows (headings, paragraphs, lists, blockquotes, fenced code, hr, and
 * bold/italic/inline-code spans) as real, paginated PDF layout instructions.
 */

export interface InlineToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type MarkdownBlock =
  | { type: 'heading'; level: number; tokens: InlineToken[] }
  | { type: 'paragraph'; tokens: InlineToken[] }
  | { type: 'code'; lang?: string; lines: string[] }
  | { type: 'list'; ordered: boolean; items: InlineToken[][] }
  | { type: 'quote'; tokens: InlineToken[] }
  | { type: 'table'; headers: InlineToken[][]; rows: InlineToken[][][] }
  | { type: 'hr' };

const INLINE_PATTERN = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

export function tokenizeInline(raw: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  INLINE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(raw))) {
    if (match.index > lastIndex) tokens.push({ text: raw.slice(lastIndex, match.index) });

    const [full, bold, code, italicStar, italicUnderscore] = match;
    if (bold) tokens.push({ text: bold.slice(2, -2), bold: true });
    else if (code) tokens.push({ text: code.slice(1, -1), code: true });
    else if (italicStar) tokens.push({ text: italicStar.slice(1, -1), italic: true });
    else if (italicUnderscore) tokens.push({ text: italicUnderscore.slice(1, -1), italic: true });

    lastIndex = match.index + full.length;
  }
  if (lastIndex < raw.length) tokens.push({ text: raw.slice(lastIndex) });

  return tokens.length ? tokens : [{ text: raw }];
}

function matchFence(line: string): { lang: string } | null {
  const m = line.match(/^\s*```\s*([\w+-]*)\s*$/);
  return m ? { lang: m[1] } : null;
}

function isHr(line: string): boolean {
  return /^\s*([-*_])\s*(\1\s*){2,}$/.test(line);
}

function matchHeading(line: string): { level: number; text: string } | null {
  const m = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
  return m ? { level: m[1].length, text: m[2].trim() } : null;
}

function matchQuote(line: string): string | null {
  const m = line.match(/^\s{0,3}>\s?(.*)$/);
  return m ? m[1] : null;
}

function matchListItem(line: string): { ordered: boolean; text: string } | null {
  const bullet = line.match(/^\s{0,3}[-*+]\s+(.*)$/);
  if (bullet) return { ordered: false, text: bullet[1] };
  const numbered = line.match(/^\s{0,3}\d+\.\s+(.*)$/);
  if (numbered) return { ordered: true, text: numbered[1] };
  return null;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:]*-{3,}[\s:]*(\|[\s:]*-{3,}[\s:]*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  let raw = line.trim();
  if (raw.startsWith('|')) raw = raw.slice(1);
  if (raw.endsWith('|')) raw = raw.slice(0, -1);
  return raw.split('|').map((c) => c.trim());
}

function matchTable(
  lines: string[],
  start: number
): { headers: string[]; rows: string[][]; consumed: number } | null {
  if (start + 1 >= lines.length) return null;
  const headerLine = lines[start];
  const sepLine = lines[start + 1];
  if (!headerLine.includes('|') || !isTableSeparator(sepLine)) return null;

  const headers = splitTableRow(headerLine);
  if (headers.length < 2) return null;

  const rows: string[][] = [];
  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || !line.includes('|')) break;
    if (isTableSeparator(line)) break;
    const cells = splitTableRow(line);
    while (cells.length < headers.length) cells.push('');
    rows.push(cells.slice(0, headers.length));
    i++;
  }

  return { headers, rows, consumed: i - start };
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuf.length) return;
    blocks.push({ type: 'paragraph', tokens: tokenizeInline(paragraphBuf.join(' ').trim()) });
    paragraphBuf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = matchFence(line);
    if (fence) {
      flushParagraph();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !matchFence(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence (or run off the end gracefully)
      blocks.push({ type: 'code', lang: fence.lang || undefined, lines: codeLines });
      continue;
    }

    if (isHr(line)) {
      flushParagraph();
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading.level, tokens: tokenizeInline(heading.text) });
      i++;
      continue;
    }

    const quote = matchQuote(line);
    if (quote !== null) {
      flushParagraph();
      const quoteLines = [quote];
      i++;
      while (i < lines.length) {
        const next = matchQuote(lines[i]);
        if (next === null) break;
        quoteLines.push(next);
        i++;
      }
      blocks.push({ type: 'quote', tokens: tokenizeInline(quoteLines.join(' ').trim()) });
      continue;
    }

    const listItem = matchListItem(line);
    if (listItem) {
      flushParagraph();
      const { ordered } = listItem;
      const items: InlineToken[][] = [tokenizeInline(listItem.text)];
      i++;
      // Stop the run as soon as the marker style switches (e.g. "- a" then
      // "1. b") so a bullet list followed by a numbered one renders as two
      // distinct blocks instead of one block with the wrong marker type.
      while (i < lines.length) {
        const next = matchListItem(lines[i]);
        if (!next || next.ordered !== ordered) break;
        items.push(tokenizeInline(next.text));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const table = matchTable(lines, i);
    if (table) {
      flushParagraph();
      blocks.push({
        type: 'table',
        headers: table.headers.map((h) => tokenizeInline(h)),
        rows: table.rows.map((row) => row.map((c) => tokenizeInline(c))),
      });
      i += table.consumed;
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      i++;
      continue;
    }

    paragraphBuf.push(line.trim());
    i++;
  }

  flushParagraph();
  return blocks;
}
