'use client';

import { cn } from '@/lib/utils';
import { PROVIDER_COLORS, PROVIDER_LABELS } from '@/lib/models';

export default function ProviderBadge({
  provider,
  className,
}: {
  provider?: string | null;
  className?: string;
}) {
  if (!provider) return null;
  const label = PROVIDER_LABELS[provider] || provider;
  const color = PROVIDER_COLORS[provider] || '#86868b';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-micro font-semibold tracking-[-0.01em]',
        className
      )}
      style={{ color, background: `${color}18` }}
      title={label}
    >
      {label}
    </span>
  );
}
