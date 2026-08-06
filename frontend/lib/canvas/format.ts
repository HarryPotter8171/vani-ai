import type { CanvasType } from '@/lib/canvas/types';

/** Best-effort document formatter for supported canvas types. */
export function formatCanvasDocument(type: CanvasType, content: string, language?: string | null): string {
  const text = content ?? '';

  if (type === 'json' || (type === 'code' && language === 'json')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  if (type === 'csv') {
    return text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  if (type === 'markdown' || type === 'plaintext' || type === 'richtext') {
    return text
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '\n');
  }

  if (type === 'html') {
    return prettyPrintMarkup(text);
  }

  return text;
}

function prettyPrintMarkup(input: string): string {
  const flat = input.replace(/>\s+</g, '><').trim();
  if (!flat) return input;

  const tokens = flat.replace(/></g, '>\n<').split('\n');
  let depth = 0;
  const out: string[] = [];

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token) || /^<(br|hr|img|input|meta|link)\b/i.test(token);
    if (isClosing) depth = Math.max(depth - 1, 0);
    out.push(`${'  '.repeat(depth)}${token}`);
    if (!isClosing && !isSelfClosing && /^<[A-Za-z]/.test(token) && !token.includes('</')) {
      depth += 1;
    }
  }
  return out.join('\n') + '\n';
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countLines(text: string): number {
  if (!text) return 1;
  return text.split('\n').length;
}
