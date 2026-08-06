'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { PhoneOff } from 'lucide-react';
import VaniOrb from '@/components/brand/VaniOrb';
import { cn } from '@/lib/utils';
import type { VoicePhase } from '@/lib/voice/types';

export interface FloatingVoiceOrbProps {
  visible: boolean;
  phase: VoicePhase;
  muted: boolean;
  elapsedLabel: string;
  onExpand: () => void;
  onEnd: () => void;
}

function orbState(phase: VoicePhase, muted: boolean) {
  if (muted) return 'idle' as const;
  if (phase === 'speaking') return 'speaking' as const;
  if (phase === 'listening') return 'listening' as const;
  if (phase === 'processing' || phase === 'connecting') return 'thinking' as const;
  return 'idle' as const;
}

function phaseHint(phase: VoicePhase, muted: boolean): string {
  if (muted) return 'Muted';
  if (phase === 'speaking') return 'Speaking';
  if (phase === 'listening') return 'Listening';
  if (phase === 'processing') return 'Thinking';
  if (phase === 'connecting') return 'Connecting';
  return 'Voice';
}

/**
 * Compact floating presence while Voice Mode continues in the background.
 */
export default function FloatingVoiceOrb({
  visible,
  phase,
  muted,
  elapsedLabel,
  onExpand,
  onEnd,
}: FloatingVoiceOrbProps) {
  const reduceMotion = useReducedMotion();
  if (!visible) return null;

  return (
    <motion.div
      className="pointer-events-none fixed bottom-6 right-5 z-[85] flex items-end gap-2 sm:bottom-8 sm:right-8"
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-2 rounded-full border border-white/12',
          'bg-[#141414]/92 py-1.5 pl-1.5 pr-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)]',
          'backdrop-blur-2xl'
        )}
      >
        <button
          type="button"
          onClick={onExpand}
          className="group flex items-center gap-2.5 rounded-full pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label="Restore voice mode"
        >
          <span className="relative flex h-12 w-12 items-center justify-center">
            {!reduceMotion && (phase === 'listening' || phase === 'speaking') ? (
              <span
                className={cn(
                  'absolute inset-0 rounded-full opacity-40',
                  phase === 'speaking'
                    ? 'animate-ping bg-accent/30'
                    : 'animate-pulse bg-white/15'
                )}
              />
            ) : null}
            <VaniOrb state={orbState(phase, muted)} size={48} glow={false} />
          </span>
          <span className="min-w-0 pr-1">
            <span className="block text-caption font-semibold tracking-[-0.03em] text-white">
              {phaseHint(phase, muted)}
            </span>
            <span className="block font-mono text-micro tabular-nums text-white/45">
              {elapsedLabel}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEnd();
          }}
          className="mr-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff3b30]/90 text-white transition-transform hover:bg-[#ff3b30] active:scale-[0.96]"
          aria-label="End voice mode"
        >
          <PhoneOff className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </motion.div>
  );
}
