'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { VoicePhase } from '@/lib/voice/types';

interface VoiceWaveformProps {
  levels: number[];
  phase: VoicePhase;
  className?: string;
}

export default function VoiceWaveform({ levels, phase, className }: VoiceWaveformProps) {
  const active = phase === 'listening' || phase === 'speaking';
  const speaking = phase === 'speaking';
  const processing = phase === 'processing' || phase === 'connecting';

  return (
    <div
      className={cn('flex h-16 w-full max-w-md items-center justify-center gap-[3px]', className)}
      aria-hidden
    >
      {levels.map((level, i) => {
        const idleAmp = processing ? 0.28 : 0.1;
        const amp = active ? Math.max(idleAmp, level) : idleAmp;
        const height = 8 + amp * 48;
        return (
          <motion.span
            key={i}
            className={cn(
              'w-[3px] rounded-full',
              speaking
                ? 'bg-accent shadow-[0_0_12px_var(--accent-glow)]'
                : phase === 'listening'
                  ? 'bg-white/75'
                  : 'bg-white/25',
              processing && 'animate-pulse'
            )}
            animate={{ height }}
            transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.4 }}
            style={{
              opacity: 0.45 + amp * 0.55,
              animationDelay: processing ? `${i * 40}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
