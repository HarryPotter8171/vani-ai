'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
  decimals?: number;
}

/**
 * Count-up animation for dashboard metrics. Lazy — only animates when mounted.
 */
export default function AnimatedCounter({
  value,
  duration = 0.9,
  className,
  format,
  decimals = 0,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);

  const text = format
    ? format(display)
    : decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return (
    <motion.span
      className={cn('animated-counter', className)}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
    >
      {text}
    </motion.span>
  );
}
