'use client';

/**
 * Empty chat surface — Phase 3 Dynamic Home.
 * Kept as EmptyState for existing imports; renders the premium home experience.
 */

import DynamicHome, { type DynamicHomeProps } from '@/components/home/DynamicHome';

export type EmptyStateProps = DynamicHomeProps;

export default function EmptyState(props: EmptyStateProps) {
  return <DynamicHome {...props} />;
}
