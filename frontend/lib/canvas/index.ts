export * from '@/lib/canvas/types';
export * from '@/lib/canvas/api';
export * from '@/lib/canvas/detect';
export * from '@/lib/canvas/diff';
export * from '@/lib/canvas/format';
// NOTE: `@/lib/canvas/export` (jspdf/docx) is intentionally NOT re-exported.
// Import it only from export click paths via dynamic `import()` so first-load
// `/` does not pull PDF libraries through `useCanvas`.
