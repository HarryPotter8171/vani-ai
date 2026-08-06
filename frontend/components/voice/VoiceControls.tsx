'use client';

import {
  Hand,
  Mic,
  MicOff,
  PhoneOff,
  Settings2,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VoiceMode, VoiceOption, VoicePhase, VoiceSettings } from '@/lib/voice/types';

interface VoiceControlsProps {
  phase: VoicePhase;
  mode: VoiceMode;
  muted: boolean;
  speakerOn: boolean;
  outputLevel: number;
  settings: VoiceSettings;
  voices: VoiceOption[];
  showSettings: boolean;
  onToggleSettings: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onEnd: () => void;
  onInterrupt: () => void;
  onSetMode: (mode: VoiceMode) => void;
  onUpdateSettings: (patch: Partial<VoiceSettings>) => void;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void;
}

const controlBtn =
  'flex h-12 w-12 items-center justify-center rounded-full transition-[background-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96]';

export default function VoiceControls({
  phase,
  mode,
  muted,
  speakerOn,
  outputLevel,
  settings,
  voices,
  showSettings,
  onToggleSettings,
  onToggleMute,
  onToggleSpeaker,
  onEnd,
  onInterrupt,
  onSetMode,
  onUpdateSettings,
  onPushToTalkStart,
  onPushToTalkEnd,
}: VoiceControlsProps) {
  const isSpeaking = phase === 'speaking';
  const volumePct = Math.round((settings.volume ?? 1) * 100);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      {showSettings && (
        <div className="w-full max-w-sm rounded-[22px] border border-black/[0.04] bg-white/55 p-4 backdrop-blur-2xl dark:border-white/[0.06] dark:bg-white/[0.06]">
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => onSetMode('hands-free')}
              className={cn(
                'flex-1 rounded-full px-3 py-2 text-sm font-medium tracking-[-0.01em] transition-colors',
                mode === 'hands-free'
                  ? 'bg-accent text-text-on-accent'
                  : 'bg-surface-hover text-muted-foreground'
              )}
            >
              Hands-free
            </button>
            <button
              type="button"
              onClick={() => onSetMode('push-to-talk')}
              className={cn(
                'flex-1 rounded-full px-3 py-2 text-sm font-medium tracking-[-0.01em] transition-colors',
                mode === 'push-to-talk'
                  ? 'bg-accent text-text-on-accent'
                  : 'bg-surface-hover text-muted-foreground'
              )}
            >
              Push to talk
            </button>
          </div>

          <label className="mb-3 block">
            <span className="mb-1.5 block text-micro font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
              Voice
            </span>
            <select
              value={settings.voice}
              onChange={(e) => onUpdateSettings({ voice: e.target.value })}
              className="w-full rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2.5 text-sidebar dark:border-white/[0.08] dark:bg-black/30"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.gender} · {v.style}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-3 block">
            <span className="mb-1.5 flex items-center justify-between text-micro font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
              <span>Speed</span>
              <span className="normal-case tracking-normal text-foreground/70">
                {settings.speed.toFixed(1)}×
              </span>
            </span>
            <input
              type="range"
              min={0.7}
              max={1.5}
              step={0.1}
              value={settings.speed}
              onChange={(e) => onUpdateSettings({ speed: Number(e.target.value) })}
              className="w-full accent-accent"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1.5 flex items-center justify-between text-micro font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
              <span>Volume</span>
              <span className="normal-case tracking-normal text-foreground/70">{volumePct}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => onUpdateSettings({ volume: Number(e.target.value) })}
              className="w-full accent-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-micro font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
              Language
            </span>
            <select
              value={settings.language}
              onChange={(e) =>
                onUpdateSettings({
                  language: e.target.value as VoiceSettings['language'],
                })
              }
              className="w-full rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2.5 text-sidebar dark:border-white/[0.08] dark:bg-black/30"
            >
              <option value="auto">Auto detect</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="hi-en">Hinglish</option>
            </select>
          </label>
        </div>
      )}

      {/* Output volume indicator */}
      <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-100"
          style={{
            width: `${Math.round(
              (speakerOn ? Math.max(settings.volume * 0.15, outputLevel) : 0) * 100
            )}%`,
          }}
 />
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onToggleSettings}
          className={cn(
            controlBtn,
            'bg-black/[0.05] text-foreground/70 hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]',
            showSettings && 'ring-2 ring-accent/40'
          )}
          aria-label="Voice settings"
        >
          <Settings2 size={18} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          className={cn(
            controlBtn,
            muted
              ? 'bg-[#ff3b30]/15 text-[#ff3b30]'
              : 'bg-black/[0.05] text-foreground/70 hover:bg-black/[0.08] dark:bg-white/[0.08]'
          )}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {muted ? <MicOff size={18} strokeWidth={1.75} /> : <Mic size={18} strokeWidth={1.75} />}
        </button>

        {mode === 'push-to-talk' ? (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              onPushToTalkStart();
            }}
            onPointerUp={onPushToTalkEnd}
            onPointerCancel={onPushToTalkEnd}
            onPointerLeave={(e) => {
              if (e.buttons === 0) return;
              onPushToTalkEnd();
            }}
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full',
              'bg-accent text-text-on-accent shadow-[0_8px_28px_var(--accent-glow)]',
              'transition-transform duration-150 active:scale-95',
              phase === 'listening' && 'ring-4 ring-accent/25'
            )}
            aria-label="Hold to talk"
          >
            <Hand size={22} strokeWidth={1.75} />
          </button>
        ) : isSpeaking ? (
          <button
            type="button"
            onClick={onInterrupt}
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full',
              'bg-accent text-text-on-accent shadow-[0_8px_28px_var(--accent-glow)]'
            )}
            aria-label="Stop speaking"
          >
            <Square size={18} strokeWidth={2.5} fill="currentColor" />
          </button>
        ) : (
          <div
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full',
              'bg-accent-muted text-accent',
              phase === 'listening' && 'animate-pulse',
              phase === 'processing' && 'ring-2 ring-accent/30'
            )}
            aria-hidden
          >
            <Mic size={22} strokeWidth={1.75} />
          </div>
        )}

        <button
          type="button"
          onClick={onToggleSpeaker}
          className={cn(
            controlBtn,
            !speakerOn
              ? 'bg-[#ff3b30]/15 text-[#ff3b30]'
              : 'bg-black/[0.05] text-foreground/70 hover:bg-black/[0.08] dark:bg-white/[0.08]'
          )}
          aria-label={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
        >
          {speakerOn ? (
            <Volume2 size={18} strokeWidth={1.75} />
          ) : (
            <VolumeX size={18} strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          onClick={onEnd}
          className={cn(
            controlBtn,
            'bg-[#ff3b30] text-white shadow-[0_6px_20px_rgba(255,59,48,0.28)] hover:brightness-110'
          )}
          aria-label="End voice call"
        >
          <PhoneOff size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
