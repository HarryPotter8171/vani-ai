import { getApiBaseUrl } from '@/lib/constants';
import { apiFetch } from '@/lib/apiClient';

export interface SharedAttachment {
  name: string;
  mimeType?: string;
  kind?: string;
}

export interface SharedMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: SharedAttachment[];
}

export interface SharedChat {
  title: string;
  messages: SharedMessage[];
  sharedAt?: string;
  updatedAt?: string;
}

interface ShareStatus {
  isShared: boolean;
  shareId: string | null;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.error || fallback;
}

export async function fetchShareStatus(chatId: string): Promise<ShareStatus> {
  const response = await apiFetch(`/chat/${chatId}/share`);
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Unable to load share status'));
  return response.json();
}

export async function enableSharing(chatId: string): Promise<ShareStatus> {
  const response = await apiFetch(`/chat/${chatId}/share`, { method: 'POST' });
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Unable to share this conversation'));
  return response.json();
}

export async function disableSharing(chatId: string): Promise<ShareStatus> {
  const response = await apiFetch(`/chat/${chatId}/unshare`, { method: 'POST' });
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Unable to revoke this share link'));
  return response.json();
}

/** Fetches a shared conversation by its public share id — no auth, callable from the public `/share/[shareId]` page. */
export async function fetchSharedChat(shareId: string): Promise<SharedChat> {
  const response = await fetch(`${getApiBaseUrl()}/chat/shared/${shareId}`);
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'This shared conversation is unavailable. The link may have been revoked.'
        : await parseErrorMessage(response, 'Unable to load this conversation')
    );
  }
  return response.json();
}

export function buildShareUrl(shareId: string): string {
  if (typeof window === 'undefined') return `/share/${shareId}`;
  return `${window.location.origin}/share/${shareId}`;
}
