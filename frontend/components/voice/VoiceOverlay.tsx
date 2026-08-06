'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Mic, MicOff, Square, X } from 'lucide-react';
import VaniOrb from '@/components/brand/VaniOrb';
import VoiceWaveform from '@/components/voice/VoiceWaveform';
import { cn } from '@/lib/utils';
import type { VoicePhase, VoiceTurn } from '@/lib/voice/types';

export interface VoiceOverlayProps {
  open: boolean;
  phase: VoicePhase;
  levels: number[];
  outputLevel: number;
  partialTranscript: string;
  finalTranscript: string;
  turns: VoiceTurn[];
  elapsedLabel: string;
  muted: boolean;
  speakerOn: boolean;
  socketConnected?: boolean;
  error: string | null;
  onMinimize: () => void;
  onEnd: () => void;
  onInterrupt: () => void;
  onToggleMute: () => void;
}

function phaseLabel(phase: VoicePhase, muted: boolean): string {
  if (muted) return 'Muted';
  switch (phase) {
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return 'Listening';
    case 'processing':
      return 'Thinking';
    case 'speaking':
      return 'Speaking';
    case 'error':
      return 'Something went wrong';
    case 'idle':
      return 'Idle';
    default:
      return 'Voice';
  }
}

function phaseHint(phase: VoicePhase, muted: boolean, error: string | null): string {
  if (error) return error;
  if (muted) return 'Microphone is muted';
  switch (phase) {
    case 'listening':
      return 'Say something — tap the mic to interrupt anytime';
    case 'processing':
      return 'Working on your request';
    case 'speaking':
      return 'Speak to interrupt';
    case 'connecting':
      return 'Starting voice mode';
    case 'error':
      return 'Try again in a moment';
    default:
      return 'Press the mic to talk';
  }
}

function orbState(phase: VoicePhase, muted: boolean) {
  if (muted) return 'idle' as const;
  if (phase === 'speaking') return 'speaking' as const;
  if (phase === 'listening') return 'listening' as const;
  if (phase === 'processing' || phase === 'connecting') return 'thinking' as const;
  return 'idle' as const;
}

/**
 * ChatGPT-style Voice Mode — dark premium full-screen surface.
 * States: Idle · Listening · Thinking · Speaking (+ connecting / muted / error).
 */
export default function VoiceOverlay({
  open,
  phase,
  levels,
  outputLevel,
  partialTranscript,
  finalTranscript,
  turns,
  elapsedLabel,
  muted,
  error,
  onMinimize,
  onEnd,
  onInterrupt,
  onToggleMute,
}: VoiceOverlayProps) {
  const reduceMotion = useReducedMotion();
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const liveLine = (partialTranscript || finalTranscript || '').trim();
  const speaking = phase === 'speaking';
  const listening = phase === 'listening' && !muted;
  const thinking = phase === 'processing' || phase === 'connecting';

  useEffect(() => {
    if (!showTranscript) return;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, liveLine, showTranscript]);

  const handlePrimaryMic = () => {
    if (speaking) {
      onInterrupt();
      return;
    }
    onToggleMute();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="VANI Voice Mode"
          className="fixed inset-0 z-[90] flex flex-col text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          {/* Forced dark premium canvas */}
          <div className="absolute inset-0 bg-[#0a0a0a]" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: speaking
                ? 'radial-gradient(ellipse 75% 55% at 50% 40%, rgba(99,102,241,0.22), transparent 68%)'
                : listening
                  ? 'radial-gradient(ellipse 75% 55% at 50% 40%, rgba(255,255,255,0.08), transparent 68%)'
                  : thinking
                    ? 'radial-gradient(ellipse 70% 50% at 50% 42%, rgba(129,140,248,0.14), transparent 70%)'
                    : 'radial-gradient(ellipse 60% 45% at 50% 38%, rgba(255,255,255,0.04), transparent 70%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Top bar */}
          <div className="relative z-10 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 sm:px-8">
            <div className="flex items-center gap-2.5">
              <span className="text-body font-semibold tracking-[-0.04em] text-white">
                VANI
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-micro font-medium tracking-[0.06em] text-white/60 backdrop-blur-md">
                VOICE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-caption tabular-nums text-white/40">
                {elapsedLabel}
              </span>
              <button
                type="button"
                onClick={onMinimize}
                className="hidden h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-3 text-caption font-medium text-white/70 backdrop-blur-md transition-colors hover:bg-white/10 sm:flex"
                aria-label="Minimize voice mode"
              >
                Minimize
              </button>
              <button
                type="button"
                onClick={onEnd}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 backdrop-blur-md transition-colors hover:bg-white/10"
                aria-label="Close voice mode"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Center stage */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-6">
            <motion.div
              className="relative mb-2 flex items-center justify-center"
              animate={
                reduceMotion
                  ? undefined
                  : { scale: speaking ? 1.05 : listening ? 1.03 : thinking ? 1.01 : 1 }
              }
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            >
              {/* Animated mic ring while listening */}
              {listening && !reduceMotion ? (
                <>
                  <span className="absolute h-[210px] w-[210px] rounded-full border border-white/10 animate-ping opacity-30" />
                  <span className="absolute h-[190px] w-[190px] rounded-full border border-white/15 opacity-40" />
                </>
              ) : null}
              <VaniOrb state={orbState(phase, muted)} size={168} glow />
            </motion.div>

            <p className="mt-7 text-heading font-medium tracking-[-0.045em] text-white sm:text-heading">
              {phaseLabel(phase, muted)}
            </p>
            <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-white/45">
              {phaseHint(phase, muted, error)}
            </p>

            <div className="mt-9 w-full max-w-md">
              <VoiceWaveform
                levels={
                  speaking
                    ? levels.map((l, i) =>
                        Math.max(l, 0.14 + outputLevel * (0.4 + (i % 5) * 0.05))
                      )
                    : levels
                }
                phase={muted ? 'muted' : phase}
                className="[&_span]:!bg-white/70 data-[speaking=true]:[&_span]:!bg-accent"
              />
            </div>

            <div className="mt-7 min-h-[3.25rem] w-full max-w-lg px-2 text-center">
              {liveLine ? (
                <p className="text-body leading-relaxed tracking-[-0.02em] text-white/70">
                  {liveLine}
                  {partialTranscript ? (
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-white/50 align-middle" />
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-white/25">
                  {listening ? 'Listening for your voice…' : '\u00A0'}
                </p>
              )}
            </div>

            <AnimatePresence initial={false}>
              {showTranscript ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 w-full max-w-lg overflow-hidden"
                >
                  <div className="max-h-[26vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                    {turns.length === 0 && !liveLine ? (
                      <p className="text-center text-sm text-white/35">
                        Conversation will appear here
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {turns.map((turn) => (
                          <li key={turn.id} className="text-left">
                            <span className="mb-0.5 block text-micro font-medium uppercase tracking-[0.08em] text-white/35">
                              {turn.role === 'user' ? 'You' : 'VANI'}
                            </span>
                            <p className="text-sm leading-relaxed text-white/75">
                              {turn.text}
                            </p>
                          </li>
                        ))}
                        <div ref={transcriptEndRef} />
                      </ul>
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="relative z-10 flex flex-col items-center gap-5 px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              className="text-caption font-medium tracking-[-0.01em] text-white/40 transition-colors hover:text-white/70"
            >
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
            </button>

            <div className="flex items-center gap-6">
              {speaking ? (
                <button
                  type="button"
                  onClick={onInterrupt}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-white/12 bg-white/[0.08] text-white/90 backdrop-blur-xl transition-transform hover:bg-white/[0.14] active:scale-[0.96]"
                  aria-label="Stop speaking"
                >
                  <Square className="h-4 w-4 fill-current" strokeWidth={0} />
                </button>
              ) : (
                <span className="h-14 w-14" aria-hidden />
              )}

              <button
                type="button"
                onClick={handlePrimaryMic}
                className={cn(
                  'relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform active:scale-[0.96]',
                  muted
                    ? 'bg-white/15 text-white'
                    : speaking
                      ? 'bg-white text-[#0a0a0a] shadow-[0_0_40px_rgba(255,255,255,0.2)]'
                      : listening
                        ? 'bg-white text-[#0a0a0a] shadow-[0_0_48px_rgba(255,255,255,0.28)]'
                        : 'bg-white/90 text-[#0a0a0a]'
                )}
                aria-label={
                  speaking
                    ? 'Interrupt'
                    : muted
                      ? 'Unmute microphone'
                      : 'Mute microphone'
                }
              >
                {listening && !reduceMotion ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />
                ) : null}
                {muted ? (
                  <MicOff className="relative h-7 w-7" strokeWidth={1.75} />
                ) : (
                  <Mic className="relative h-7 w-7" strokeWidth={1.75} />
                )}
              </button>

              <button
                type="button"
                onClick={onEnd}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-[0_8px_32px_rgba(255,59,48,0.4)] transition-transform active:scale-[0.96]"
                aria-label="End voice mode"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
