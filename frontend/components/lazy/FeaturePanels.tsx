'use client';

/**
 * Lazy feature panels — kept out of the initial `/` route chunk.
 * Each module loads on first open; loading shells use shared panel skeletons
 * so users never see a blank flash (see UI_AUDIT L-1).
 */

import dynamic from 'next/dynamic';
import {
  CompactControlSkeleton,
  DialogSkeleton,
  InlinePanelSkeleton,
  ModalPanelSkeleton,
  SidePanelSkeleton,
  VoiceOverlaySkeleton,
} from '@/components/lazy/PanelSkeletons';

const modalLoading = () => <ModalPanelSkeleton />;
const analyticsLoading = () => <ModalPanelSkeleton maxWidthClass="max-w-[820px]" />;
const sideLoading = () => <SidePanelSkeleton />;
const browserSideLoading = () => (
  <SidePanelSkeleton widthClass="md:w-[420px] lg:w-[460px]" />
);
const codeSideLoading = () => (
  <SidePanelSkeleton widthClass="md:w-[460px] lg:w-[520px]" />
);
const artifactSideLoading = () => (
  <SidePanelSkeleton widthClass="md:w-[480px] lg:w-[520px]" />
);
const inlineLoading = () => <InlinePanelSkeleton />;
const voiceLoading = () => <VoiceOverlaySkeleton />;
const dialogLoading = () => <DialogSkeleton />;

export const ArtifactPanel = dynamic(
  () => import('@/components/artifacts/ArtifactPanel'),
  { ssr: false, loading: artifactSideLoading }
);

export const CanvasPanel = dynamic(
  () => import('@/components/canvas/CanvasPanel'),
  { ssr: false, loading: sideLoading }
);

export const VoiceOverlay = dynamic(
  () => import('@/components/voice/VoiceOverlay'),
  { ssr: false, loading: voiceLoading }
);

export const MemoryManager = dynamic(
  () => import('@/components/memory/MemoryManager'),
  { ssr: false, loading: modalLoading }
);

export const McpSettings = dynamic(
  () => import('@/components/settings/McpSettings'),
  { ssr: false, loading: modalLoading }
);

export const BillingSettings = dynamic(
  () => import('@/components/settings/BillingSettings'),
  { ssr: false, loading: modalLoading }
);

export const AnalyticsPanel = dynamic(
  () => import('@/components/analytics/AnalyticsPanel'),
  { ssr: false, loading: analyticsLoading }
);

export const AdminDashboard = dynamic(
  () => import('@/components/analytics/AdminDashboard'),
  { ssr: false, loading: analyticsLoading }
);

export const AiDashboard = dynamic(
  () => import('@/components/dashboard/AiDashboard'),
  { ssr: false, loading: analyticsLoading }
);

export const ResearchPanel = dynamic(
  () => import('@/components/research/ResearchPanel'),
  { ssr: false, loading: inlineLoading }
);

export const BrowserPanel = dynamic(
  () => import('@/components/browser/BrowserPanel'),
  { ssr: false, loading: browserSideLoading }
);

export const BrowserPermissionDialog = dynamic(
  () => import('@/components/browser/BrowserPermissionDialog'),
  { ssr: false, loading: dialogLoading }
);

export const CodeInterpreterPanel = dynamic(
  () => import('@/components/codeInterpreter/CodeInterpreterPanel'),
  { ssr: false, loading: codeSideLoading }
);

export const ExecutionTimeline = dynamic(
  () => import('@/components/agents/ExecutionTimeline'),
  { ssr: false, loading: inlineLoading }
);

export const AgentStatus = dynamic(
  () => import('@/components/agents/AgentStatus'),
  { ssr: false, loading: inlineLoading }
);

export {
  CompactControlSkeleton,
  DialogSkeleton,
  InlinePanelSkeleton,
  ModalPanelSkeleton,
  SidePanelSkeleton,
  VoiceOverlaySkeleton,
};
