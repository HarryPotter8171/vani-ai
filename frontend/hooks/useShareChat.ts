'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildShareUrl, disableSharing, enableSharing, fetchShareStatus } from '@/lib/share';

/**
 * Manages the public-share toggle for a single chat. Status is loaded
 * lazily (via `ensureStatusLoaded`, meant to be called when the share panel
 * opens) rather than eagerly on every `chatId` change, so switching between
 * conversations never fires a request the user hasn't asked for.
 */
export function useShareChat(chatId: string | null) {
  const [isShared, setIsShared] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const loadedForRef = useRef<string | null>(null);

  // Switching chats invalidates whatever status was last loaded (it belongs
  // to the previous conversation) — the next `ensureStatusLoaded` call will
  // fetch fresh state for the new one.
  const [scopedChatId, setScopedChatId] = useState(chatId);
  if (scopedChatId !== chatId) {
    setScopedChatId(chatId);
    setIsShared(false);
    setShareId(null);
    setError(null);
  }

  // Keep the lazy-load cache key aligned with the active chat.
  useEffect(() => {
    loadedForRef.current = null;
  }, [chatId]);

  const ensureStatusLoaded = useCallback(() => {
    if (!chatId || loadedForRef.current === chatId) return;
    loadedForRef.current = chatId;

    const requestId = ++requestIdRef.current;
    setIsLoadingStatus(true);
    setError(null);

    fetchShareStatus(chatId)
      .then((status) => {
        if (requestId !== requestIdRef.current) return;
        setIsShared(status.isShared);
        setShareId(status.shareId);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        loadedForRef.current = null; // allow retrying on next open
        setError((err as Error).message || 'Unable to load share status');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoadingStatus(false);
      });
  }, [chatId]);

  const enable = useCallback(async () => {
    if (!chatId) return;
    setIsToggling(true);
    setError(null);
    try {
      const status = await enableSharing(chatId);
      setIsShared(status.isShared);
      setShareId(status.shareId);
    } catch (err) {
      setError((err as Error).message || 'Unable to share this conversation');
    } finally {
      setIsToggling(false);
    }
  }, [chatId]);

  const disable = useCallback(async () => {
    if (!chatId) return;
    setIsToggling(true);
    setError(null);
    try {
      const status = await disableSharing(chatId);
      setIsShared(status.isShared);
    } catch (err) {
      setError((err as Error).message || 'Unable to revoke this share link');
    } finally {
      setIsToggling(false);
    }
  }, [chatId]);

  return {
    isShared,
    shareUrl: isShared && shareId ? buildShareUrl(shareId) : null,
    isLoadingStatus,
    isToggling,
    error,
    ensureStatusLoaded,
    enable,
    disable,
  };
}
