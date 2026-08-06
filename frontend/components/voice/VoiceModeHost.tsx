'use client';

import { Suspense, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { VoiceOverlay } from '@/components/lazy/FeaturePanels';
import { VoiceOverlaySkeleton } from '@/components/lazy/PanelSkeletons';
import FloatingMicButton from '@/components/voice/FloatingMicButton';
import FloatingVoiceOrb from '@/components/voice/FloatingVoiceOrb';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import type { Message } from '@/lib/types';

export interface VoiceModeHostProps {
  chatId?: string | null;
  projectId?: string | null;
  messages: Message[];
  isChatLoading: boolean;
  sendMessage: (
    text: string,
    attachments?: undefined,
    options?: { voiceMode?: boolean }
  ) => void | Promise<void>;
  stopGenerating: () => void;
  /** Registers openVoiceMode so the composer / dock can start or restore Voice Mode. */
  onRegisterOpen: (open: () => void) => void;
  /** Notifies the shell when a voice session is active (hide chat bubbles, etc.). */
  onLiveChange?: (live: boolean) => void;
  /** When true, collapse the full UI to the floating orb without ending the call. */
  minimizeSignal?: number;
}

/**
 * Isolates high-frequency voice state so ChatPage / the message list do not
 * re-render on every waveform tick.
 *
 * ChatGPT-style UX:
 * - Idle → floating mic FAB (press once to start)
 * - Active expanded → dark premium Voice Overlay
 * - Minimized → compact floating orb (session continues)
 */
export default function VoiceModeHost({
  chatId,
  projectId,
  messages,
  isChatLoading,
  sendMessage,
  stopGenerating,
  onRegisterOpen,
  onLiveChange,
  minimizeSignal = 0,
}: VoiceModeHostProps) {
  const voice = useVoiceMode({
    chatId,
    projectId,
    messages,
    isChatLoading,
    sendMessage,
    stopGenerating,
  });

  const openVoiceMode = voice.openVoiceMode;
  useEffect(() => {
    onRegisterOpen(() => {
      void openVoiceMode();
    });
  }, [onRegisterOpen, openVoiceMode]);

  useEffect(() => {
    onLiveChange?.(voice.isLive);
  }, [voice.isLive, onLiveChange]);

  useEffect(() => {
    if (!minimizeSignal) return;
    if (voice.isLive && voice.isExpanded) {
      voice.minimizeVoiceMode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to signal bumps
  }, [minimizeSignal]);

  const showIdleFab = !voice.isLive;

  return (
    <>
      <AnimatePresence>
        {showIdleFab ? (
          <FloatingMicButton
            visible
            onClick={() => {
              void openVoiceMode();
            }}
          />
        ) : null}
      </AnimatePresence>

      {voice.isExpanded ? (
        <Suspense fallback={<VoiceOverlaySkeleton />}>
          <VoiceOverlay
            open={voice.isExpanded}
            phase={voice.phase}
            levels={voice.levels}
            outputLevel={voice.outputLevel}
            partialTranscript={voice.partialTranscript}
            finalTranscript={voice.finalTranscript}
            turns={voice.turns}
            elapsedLabel={voice.elapsedLabel}
            muted={voice.muted}
            speakerOn={voice.speakerOn}
            socketConnected={voice.socketConnected}
            error={voice.error}
            onMinimize={voice.minimizeVoiceMode}
            onEnd={voice.closeVoiceMode}
            onInterrupt={voice.interrupt}
            onToggleMute={voice.toggleMute}
          />
        </Suspense>
      ) : null}

      <AnimatePresence>
        {voice.isMinimized ? (
          <FloatingVoiceOrb
            visible
            phase={voice.phase}
            muted={voice.muted}
            elapsedLabel={voice.elapsedLabel}
            onExpand={voice.expandVoiceMode}
            onEnd={voice.closeVoiceMode}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
