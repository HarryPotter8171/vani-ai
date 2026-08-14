export const CANVAS_TYPES = [
  'markdown',
  'richtext',
  'code',
  'html',
  'react',
  'mermaid',
  'json',
  'csv',
  'plaintext',
] as const;

export type CanvasType = (typeof CANVAS_TYPES)[number];

export type CanvasViewMode = 'edit' | 'preview' | 'split' | 'diff';

export type CanvasSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

export type CanvasExportFormat = 'pdf' | 'docx' | 'markdown' | 'html' | 'txt';

export type CanvasAiAction =
  | 'rewrite'
  | 'expand'
  | 'shorten'
  | 'fix_grammar'
  | 'improve_writing'
  | 'translate'
  | 'explain'
  | 'continue_writing'
  | 'refactor_code'
  | 'optimize_code'
  | 'custom';

export interface CanvasDocument {
  id: string;
  userId: string;
  chatId: string | null;
  title: string;
  type: CanvasType;
  language: string | null;
  content: string;
  pinned: boolean;
  revision: number;
  sourceArtifactId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasVersionSummary {
  id: string;
  canvasId: string;
  userId: string;
  revision: number;
  title: string;
  type: CanvasType;
  language: string | null;
  source: string;
  note: string;
  createdAt: string;
  content?: string;
}

export interface CanvasSelection {
  start: number;
  end: number;
  text: string;
}

export interface CanvasLocalState {
  /** Open tab order (canvas ids). */
  openIds: string[];
  activeId: string | null;
  drafts: Record<string, string>;
  titles: Record<string, string>;
  saveStatus: Record<string, CanvasSaveStatus>;
  viewMode: Record<string, CanvasViewMode>;
  conflict: Record<string, CanvasDocument | null>;
}

export const CANVAS_TYPE_LABELS: Record<CanvasType, string> = {
  markdown: 'Markdown',
  richtext: 'Rich Text',
  code: 'Code',
  html: 'HTML',
  react: 'React',
  mermaid: 'Mermaid',
  json: 'JSON',
  csv: 'CSV',
  plaintext: 'Plain Text',
};

export const CANVAS_AI_ACTIONS: { id: CanvasAiAction; label: string; codeOnly?: boolean }[] = [
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'expand', label: 'Expand' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'fix_grammar', label: 'Fix grammar' },
  { id: 'improve_writing', label: 'Improve writing' },
  { id: 'translate', label: 'Translate' },
  { id: 'explain', label: 'Explain' },
  { id: 'continue_writing', label: 'Continue writing' },
  { id: 'refactor_code', label: 'Refactor code', codeOnly: true },
  { id: 'optimize_code', label: 'Optimize code', codeOnly: true },
];

export function isPreviewableCanvasType(type: CanvasType): boolean {
  return type === 'markdown' || type === 'html' || type === 'react' || type === 'mermaid' || type === 'richtext';
}

/** Desktop-only side-by-side edit+preview. Never used on mobile. */
export function supportsCanvasSplit(type: CanvasType): boolean {
  return isPreviewableCanvasType(type);
}
