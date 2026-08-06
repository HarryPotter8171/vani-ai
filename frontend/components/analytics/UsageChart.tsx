'use client';

import { cn } from '@/lib/utils';
import type { ChartPoint } from '@/lib/analytics';

export interface UsageChartProps {
  points: ChartPoint[];
  metricKey?: string;
  className?: string;
  height?: number;
}

function valueOf(point: ChartPoint, metricKey?: string): number {
  if (metricKey) return Number(point.metrics?.[metricKey]) || 0;
  if (typeof point.total === 'number') return point.total;
  const m = point.metrics || {};
  return (
    (m.chat_requests || 0) +
    (m.research_runs || 0) +
    (m.browser_sessions || 0) +
    (m.code_executions || 0) +
    (m.mcp_calls || 0) +
    (m.image_generation || 0)
  );
}

export default function UsageChart({
  points,
  metricKey,
  className,
  height = 120,
}: UsageChartProps) {
  const values = points.map((p) => valueOf(p, metricKey));
  const max = Math.max(1, ...values);

  return (
    <div className={cn('w-full', className)}>
      <div
        className="flex items-end gap-[3px] sm:gap-1"
        style={{ height }}
        role="img"
        aria-label="Usage chart"
      >
        {points.map((point, i) => {
          const v = values[i];
          const pct = Math.max(4, (v / max) * 100);
          const label = point.label || point.date || '';
          return (
            <div
              key={`${label}-${i}`}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
              style={{ height: '100%' }}
              title={`${label}: ${v.toLocaleString()}`}
            >
              <div
                className={cn(
                  'w-full max-w-[18px] rounded-t-[4px] transition-all duration-300',
                  'bg-gradient-to-t from-accent/75 to-accent-hover',
                  'dark:from-accent/70 dark:to-accent',
                  'group-hover:from-accent group-hover:to-accent-hover'
                )}
                style={{ height: `${pct}%` }}
 />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-micro tabular-nums text-muted-foreground">
        <span>{points[0]?.label || points[0]?.date || ''}</span>
        <span>
          {points[points.length - 1]?.label || points[points.length - 1]?.date || ''}
        </span>
      </div>
    </div>
  );
}
