import type { Message } from '@/lib/types';
import { EXPORT_ROLE_LABEL, getExportableMessages } from '@/lib/export/shared';

function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // [text](url) -> text (url)
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/\*([^*\n]+)\*/g, '$1') // *italic*
    .replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, '$1'); // _italic_
}

function stripLine(line: string): string {
  if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) return '-'.repeat(40); // hr

  const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
  if (heading) return stripInline(heading[1]).trim();

  const quote = line.match(/^\s{0,3}>\s?(.*)$/);
  if (quote) return `> ${stripInline(quote[1])}`;

  const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (bullet) return `${bullet[1]}- ${stripInline(bullet[2])}`;

  return stripInline(line);
}

/**
 * Converts Markdown into readable prose for plain-text export: headings and
 * emphasis markers are dropped (keeping their text), while fenced code
 * blocks are preserved as indented, clearly-delimited sections rather than
 * being stripped down and losing their structure.
 */
export function stripMarkdown(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;

  for (const raw of lines) {
    const fence = raw.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      inCode = !inCode;
      out.push(inCode ? `[code${fence[1] ? `: ${fence[1]}` : ''}]` : '[/code]');
      continue;
    }
    out.push(inCode ? `    ${raw}` : stripLine(raw));
  }

  return out.join('\n');
}

/**
 * Renders the conversation as human-readable plain text. Assistant replies
 * are stripped of Markdown syntax (see `stripMarkdown`); user messages are
 * copied verbatim since they were never Markdown to begin with (the chat UI
 * renders them as raw text too).
 */
export function buildTextExport(messages: Message[], title: string): string {
  const exportable = getExportableMessages(messages);
  const divider = '='.repeat(48);
  const lines: string[] = [
    title.trim() || 'Conversation',
    `Exported from VANI AI on ${new Date().toLocaleString()}`,
    divider,
  ];

  for (const message of exportable) {
    const label = EXPORT_ROLE_LABEL[message.role] ?? message.role;
    lines.push('', `${label}:`, '');

    if (message.content.trim()) {
      const body = message.role === 'assistant'
        ? stripMarkdown(message.content.trim())
        : message.content.trim();
      lines.push(body);
    }

    if (message.attachments?.length) {
      if (message.content.trim()) lines.push('');
      lines.push(...message.attachments.map((a) => `[attachment] ${a.name}`));
    }

    lines.push('', '-'.repeat(32));
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
