import type { Message } from '@/lib/types';

export const EXPORT_ROLE_LABEL: Record<Message['role'], string> = {
  user: 'You',
  assistant: 'VANI',
};

/** Drops empty streaming placeholders — everything else (including attachment-only sends) is exportable. */
export function getExportableMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.content.trim() || m.attachments?.length);
}

/** Builds a filesystem-safe `<slug>-<yyyy-mm-dd>.<ext>` export filename.
 * Preserves Unicode letters (Hindi, Arabic, CJK, …) while stripping path-
 * dangerous characters. */
export function buildExportFilename(title: string, extension: string): string {
  const slug = title
    .trim()
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const date = new Date().toISOString().slice(0, 10);
  return `${slug || 'conversation'}-${date}.${extension}`;
}
