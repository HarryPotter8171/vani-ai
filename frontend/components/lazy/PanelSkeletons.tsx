'use client';

/**
 * Shared loading shells for lazily loaded feature panels.
 * Uses existing Skeleton tokens — no new motion or spacing system.
 */

import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

function PanelHeaderBones({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 border-b border-border px-4 py-3', className)}>
      <Skeleton rounded="lg" className="h-9 w-9 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton rounded="sm" className="h-3.5 w-[42%]" />
        <Skeleton rounded="sm" className="h-2.5 w-[58%]" />
      </div>
      <Skeleton rounded="full" className="h-8 w-8 shrink-0" />
    </div>
  );
}

/** Full-screen modal chrome (Settings, Memory, MCP, Analytics, dashboards). */
export function ModalPanelSkeleton({
  className,
  maxWidthClass = 'max-w-[720px]',
}: {
  className?: string;
  maxWidthClass?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6"
      role="status"
      aria-busy="true"
      aria-label="Loading panel"
    >
      <div className="absolute inset-0 modal-overlay" aria-hidden />
      <div
        className={cn(
          'relative flex h-[min(88vh,820px)] w-full flex-col overflow-hidden',
          maxWidthClass,
          'rounded-t-[28px] sm:rounded-[28px]',
          'border border-border bg-surface',
          'backdrop-blur-2xl backdrop-saturate-[1.6]',
          'shadow-[0_24px_80px_rgba(0,0,0,0.28)] dark:shadow-[0_28px_90px_rgba(0,0,0,0.65)]',
          className
        )}
      >
        <PanelHeaderBones className="px-5 py-4 sm:px-6" />
        <div className="custom-scrollbar flex flex-1 flex-col gap-4 overflow-hidden p-5 sm:p-6">
          <div className="flex gap-2">
            <Skeleton rounded="full" className="h-8 w-20" />
            <Skeleton rounded="full" className="h-8 w-24" />
            <Skeleton rounded="full" className="h-8 w-16" />
          </div>
          <Skeleton className="h-28 w-full" rounded="lg" />
          <SkeletonText lines={4} />
          <Skeleton className="h-20 w-full" rounded="lg" />
          <SkeletonText lines={3} />
        </div>
      </div>
    </div>
  );
}

/** Right-rail tool panels (Browser, Code Interpreter, Canvas, Artifacts). */
export function SidePanelSkeleton({
  className,
  widthClass = 'md:w-[460px] lg:w-[520px]',
}: {
  className?: string;
  widthClass?: string;
}) {
  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col',
        widthClass,
        'border-l border-border',
        'bg-surface-glass',
        'backdrop-blur-2xl backdrop-saturate-[1.6]',
        'shadow-[-12px_0_40px_rgba(0,0,0,0.04)] dark:shadow-[-16px_0_48px_rgba(0,0,0,0.35)]',
        className
      )}
      role="status"
      aria-busy="true"
      aria-label="Loading panel"
    >
      <PanelHeaderBones className="px-3 py-2.5" />
      <div className="flex flex-1 flex-col gap-3 p-3">
        <Skeleton className="h-10 w-full" rounded="md" />
        <Skeleton className="min-h-[180px] flex-1 w-full" rounded="lg" />
        <SkeletonText lines={3} />
        <div className="flex gap-2 pt-1">
          <Skeleton rounded="full" className="h-8 w-8" />
          <Skeleton rounded="full" className="h-8 w-24" />
          <Skeleton rounded="full" className="ml-auto h-8 w-20" />
        </div>
      </div>
    </aside>
  );
}

/** In-chat research / agent chrome cards. */
export function InlinePanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[22px]',
        'border border-border/70 bg-surface-glass',
        'backdrop-blur-xl',
        'shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_28px_rgba(0,0,0,0.25)]',
        className
      )}
      role="status"
      aria-busy="true"
      aria-label="Loading panel"
    >
      <PanelHeaderBones />
      <div className="space-y-3 px-4 py-3">
        <Skeleton className="h-2 w-full" rounded="full" />
        <SkeletonText lines={3} />
        <div className="flex gap-2">
          <Skeleton rounded="md" className="h-16 flex-1" />
          <Skeleton rounded="md" className="h-16 flex-1" />
        </div>
      </div>
    </div>
  );
}

/** Full-viewport voice mode shell. */
export function VoiceOverlaySkeleton() {
  return (
    <div
      className="fixed inset-0 z-[140] flex flex-col bg-[#0a0a0c] text-white"
      role="status"
      aria-busy="true"
      aria-label="Loading voice mode"
    >
      <div className="flex items-center justify-between px-5 py-4">
        <Skeleton pulse className="h-3 w-24 bg-white/10" rounded="sm" />
        <Skeleton pulse className="h-8 w-8 bg-white/10" rounded="full" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <Skeleton pulse className="h-28 w-28 bg-white/10" rounded="full" />
        <Skeleton pulse className="h-3 w-40 bg-white/10" rounded="sm" />
        <Skeleton pulse className="h-2.5 w-56 bg-white/10" rounded="sm" />
      </div>
      <div className="flex items-center justify-center gap-4 pb-10">
        <Skeleton pulse className="h-12 w-12 bg-white/10" rounded="full" />
        <Skeleton pulse className="h-14 w-14 bg-white/10" rounded="full" />
        <Skeleton pulse className="h-12 w-12 bg-white/10" rounded="full" />
      </div>
    </div>
  );
}

/** Compact permission / confirm dialog shell. */
export function DialogSkeleton() {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-5"
      role="status"
      aria-busy="true"
      aria-label="Loading dialog"
    >
      <div className="absolute inset-0 modal-overlay" aria-hidden />
      <div
        className={cn(
          'relative w-full max-w-[400px] overflow-hidden rounded-[22px]',
          'border border-border bg-surface p-6',
          'shadow-[0_24px_80px_rgba(0,0,0,0.28)]'
        )}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Skeleton rounded="lg" className="h-12 w-12" />
          <Skeleton rounded="sm" className="h-4 w-[55%]" />
          <SkeletonText lines={2} className="items-center" />
          <div className="mt-4 flex w-full gap-2.5">
            <Skeleton rounded="full" className="h-11 flex-1" />
            <Skeleton rounded="full" className="h-11 flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Composer control placeholder (agent / model selectors). */
export function CompactControlSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      rounded="full"
      className={cn('h-8 w-8 shrink-0 max-md:h-10 max-md:w-10', className)}
    />
  );
}
