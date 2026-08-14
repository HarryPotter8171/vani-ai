'use client';

import {
  type TurnMeta,
  type TurnUsage,
} from '@/lib/models';

/**
 * Subtle post-reply metadata — model name + latency only.
 * Avoids repeating provider badges when the model label already names the family.
 */
export default function UsageFooter({
  usage,
  meta,
}: {
  usage?: TurnUsage | null;
  meta?: TurnMeta | null;
}) {
  if (!usage && !meta) return null;

  const modelLabel =
    meta?.displayName || usage?.model || meta?.model || usage?.modelKey;

  const latency =
    usage?.latencyMs != null && !Number.isNaN(usage.latencyMs)
      ? usage.latencyMs < 1000
        ? `${Math.round(usage.latencyMs)} ms`
        : `${(usage.latencyMs / 1000).toFixed(1)} s`
      : null;

  if (!modelLabel && !latency) return null;

  const parts: string[] = [];
  if (modelLabel) parts.push(modelLabel);
  if (latency) parts.push(latency);

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-1.5 text-caption font-medium tracking-[-0.01em] text-text-tertiary/85"
      data-testid="usage-footer"
    >
      <span>{parts.join(' · ')}</span>
    </div>
  );
}
