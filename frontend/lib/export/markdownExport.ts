import type { Message } from '@/lib/types';
import { EXPORT_ROLE_LABEL, getExportableMessages } from '@/lib/export/shared';

/**
 * Renders the conversation as a single Markdown document. Message content is
 * copied through verbatim — since assistant replies are already Markdown
 * (headings, lists, fenced code blocks, etc.), this preserves that
 * formatting exactly rather than re-deriving it.
 */
export function buildMarkdownExport(messages: Message[], title: string): string {
  const exportable = getExportableMessages(messages);
  const lines: string[] = [
    `# ${title.trim() || 'Conversation'}`,
    '',
    `_Exported from VANI AI on ${new Date().toLocaleString()}_`,
    '',
    '---',
  ];

  for (const message of exportable) {
    lines.push('', `## ${EXPORT_ROLE_LABEL[message.role] ?? message.role}`, '');

    if (message.content.trim()) {
      lines.push(message.content.trim());
    }

    if (message.attachments?.length) {
      if (message.content.trim()) lines.push('');
      lines.push(...message.attachments.map((a) => `📎 \`${a.name}\``));
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
