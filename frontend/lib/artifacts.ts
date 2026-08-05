/**
 * Client-side Artifacts detection: parses fenced code blocks out of an
 * assistant message and promotes substantial / previewable ones into a
 * dedicated side-panel artifact instead of an inline code block.
 *
 * Runs on finished and streaming messages (an unterminated trailing fence
 * is treated as a live artifact).
 */

export type ArtifactLanguage =
  | 'html'
  | 'css'
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'sql'
  | 'markdown'
  | 'json'
  | 'xml'
  | 'svg'
  | 'mermaid';

export interface Artifact {
  id: string;
  messageId: string;
  index: number;
  language: ArtifactLanguage;
  title: string;
  content: string;
  isStreaming: boolean;
}

export type MessageSegment =
  | { type: 'text'; value: string }
  | { type: 'artifact'; artifact: Artifact };

export type ArtifactViewMode = 'preview' | 'code' | 'split';

/** Languages that use the sandboxed live HTML iframe preview. */
export function isHtmlPreviewLanguage(language: ArtifactLanguage): boolean {
  return (
    language === 'html' ||
    language === 'css' ||
    language === 'svg' ||
    language === 'javascript' ||
    language === 'jsx' ||
    language === 'tsx'
  );
}

/** Languages that render inside the dedicated React live-preview engine. */
export function isReactPreviewLanguage(language: ArtifactLanguage): boolean {
  return language === 'jsx' || language === 'tsx';
}

/** Mermaid diagrams — live SVG preview with pan/zoom chrome. */
export function isMermaidPreviewLanguage(language: ArtifactLanguage): boolean {
  return language === 'mermaid';
}

/** Languages that support Preview | Split | Code (live edit next to preview). */
export function supportsSplitView(language: ArtifactLanguage): boolean {
  return isHtmlPreviewLanguage(language) || isMermaidPreviewLanguage(language);
}

interface LanguageInfo {
  canonical: ArtifactLanguage;
  prismLanguage: string;
  extension: string;
  label: string;
  mimeType: string;
  /** Languages that can render a live preview in the panel. */
  previewable: boolean;
}

const LANGUAGE_ALIASES: Record<string, LanguageInfo> = {
  html: {
    canonical: 'html',
    prismLanguage: 'markup',
    extension: 'html',
    label: 'HTML',
    mimeType: 'text/html',
    previewable: true,
  },
  htm: {
    canonical: 'html',
    prismLanguage: 'markup',
    extension: 'html',
    label: 'HTML',
    mimeType: 'text/html',
    previewable: true,
  },
  xml: {
    canonical: 'xml',
    prismLanguage: 'markup',
    extension: 'xml',
    label: 'XML',
    mimeType: 'application/xml',
    previewable: false,
  },
  svg: {
    canonical: 'svg',
    prismLanguage: 'markup',
    extension: 'svg',
    label: 'SVG',
    mimeType: 'image/svg+xml',
    previewable: true,
  },
  css: {
    canonical: 'css',
    prismLanguage: 'css',
    extension: 'css',
    label: 'CSS',
    mimeType: 'text/css',
    previewable: true,
  },
  js: {
    canonical: 'javascript',
    prismLanguage: 'javascript',
    extension: 'js',
    label: 'JavaScript',
    mimeType: 'text/javascript',
    previewable: true,
  },
  javascript: {
    canonical: 'javascript',
    prismLanguage: 'javascript',
    extension: 'js',
    label: 'JavaScript',
    mimeType: 'text/javascript',
    previewable: true,
  },
  jsx: {
    canonical: 'jsx',
    prismLanguage: 'jsx',
    extension: 'jsx',
    label: 'React',
    mimeType: 'text/javascript',
    previewable: true,
  },
  react: {
    canonical: 'jsx',
    prismLanguage: 'jsx',
    extension: 'jsx',
    label: 'React',
    mimeType: 'text/javascript',
    previewable: true,
  },
  ts: {
    canonical: 'typescript',
    prismLanguage: 'typescript',
    extension: 'ts',
    label: 'TypeScript',
    mimeType: 'text/typescript',
    previewable: false,
  },
  typescript: {
    canonical: 'typescript',
    prismLanguage: 'typescript',
    extension: 'ts',
    label: 'TypeScript',
    mimeType: 'text/typescript',
    previewable: false,
  },
  tsx: {
    canonical: 'tsx',
    prismLanguage: 'tsx',
    extension: 'tsx',
    label: 'React',
    mimeType: 'text/typescript',
    previewable: true,
  },
  py: {
    canonical: 'python',
    prismLanguage: 'python',
    extension: 'py',
    label: 'Python',
    mimeType: 'text/x-python',
    previewable: false,
  },
  python: {
    canonical: 'python',
    prismLanguage: 'python',
    extension: 'py',
    label: 'Python',
    mimeType: 'text/x-python',
    previewable: false,
  },
  sql: {
    canonical: 'sql',
    prismLanguage: 'sql',
    extension: 'sql',
    label: 'SQL',
    mimeType: 'application/sql',
    previewable: false,
  },
  json: {
    canonical: 'json',
    prismLanguage: 'json',
    extension: 'json',
    label: 'JSON',
    mimeType: 'application/json',
    previewable: false,
  },
  md: {
    canonical: 'markdown',
    prismLanguage: 'markdown',
    extension: 'md',
    label: 'Markdown',
    mimeType: 'text/markdown',
    previewable: true,
  },
  markdown: {
    canonical: 'markdown',
    prismLanguage: 'markdown',
    extension: 'md',
    label: 'Markdown',
    mimeType: 'text/markdown',
    previewable: true,
  },
  mermaid: {
    canonical: 'mermaid',
    prismLanguage: 'markup',
    extension: 'mmd',
    label: 'Mermaid',
    mimeType: 'text/plain',
    previewable: true,
  },
  mmd: {
    canonical: 'mermaid',
    prismLanguage: 'markup',
    extension: 'mmd',
    label: 'Mermaid',
    mimeType: 'text/plain',
    previewable: true,
  },
};

export const LANGUAGE_INFO: Record<ArtifactLanguage, LanguageInfo> = {
  html: LANGUAGE_ALIASES.html,
  css: LANGUAGE_ALIASES.css,
  javascript: LANGUAGE_ALIASES.javascript,
  jsx: LANGUAGE_ALIASES.jsx,
  typescript: LANGUAGE_ALIASES.typescript,
  tsx: LANGUAGE_ALIASES.tsx,
  python: LANGUAGE_ALIASES.python,
  sql: LANGUAGE_ALIASES.sql,
  markdown: LANGUAGE_ALIASES.markdown,
  json: LANGUAGE_ALIASES.json,
  xml: LANGUAGE_ALIASES.xml,
  svg: LANGUAGE_ALIASES.svg,
  mermaid: LANGUAGE_ALIASES.mermaid,
};

const PREVIEWABLE = new Set<ArtifactLanguage>(
  Object.values(LANGUAGE_INFO)
    .filter((info) => info.previewable)
    .map((info) => info.canonical)
);

function resolveLanguage(raw: string): LanguageInfo | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return LANGUAGE_ALIASES[key] ?? null;
}

/**
 * Infer a language when the fence tag is missing or generic (`text`, `code`).
 * Order matters — more specific shapes win first.
 */
export function detectLanguage(code: string): LanguageInfo | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  if (/^<svg[\s>]/i.test(trimmed) || /<\/svg>\s*$/i.test(trimmed)) {
    return LANGUAGE_ALIASES.svg;
  }

  if (
    /^(?:graph\s+|flowchart\s+|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie(?:\s|$)|mindmap|timeline|gitGraph|journey|quadrantChart|xychart(?:-beta)?|sankey(?:-beta)?|block(?:-beta)?|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)/i.test(
      trimmed
    )
  ) {
    return LANGUAGE_ALIASES.mermaid;
  }

  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return LANGUAGE_ALIASES.html;
  }

  // React / JSX — TSX if type annotations are present
  const looksLikeJsx =
    /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:function|const|class)\s+\w+/.test(trimmed) &&
    /return\s*\([\s\S]*</.test(trimmed);
  const hasJsxTag = /<[A-Z][\w.]*[\s/>]/.test(trimmed) || /<\/[A-Z][\w.]*>/.test(trimmed);
  if (looksLikeJsx || (hasJsxTag && /(?:React|useState|useEffect|jsx)/i.test(trimmed))) {
    if (/:\s*(?:React\.)?(?:FC|ReactNode|JSX\.Element)\b/.test(trimmed) || /interface\s+\w+/.test(trimmed)) {
      return LANGUAGE_ALIASES.tsx;
    }
    return LANGUAGE_ALIASES.jsx;
  }

  // Standalone HTML fragments with common tags
  if (/<\/?(?:div|section|main|header|footer|nav|button|form|table|span|p|h[1-6]|ul|ol|li|a|img)\b/i.test(trimmed)) {
    return LANGUAGE_ALIASES.html;
  }

  // CSS stylesheet
  if (/^[.#@\w*\[:].*\{[\s\S]*\}/m.test(trimmed) && /(?:color|display|margin|padding|font|background|border)\s*:/.test(trimmed)) {
    return LANGUAGE_ALIASES.css;
  }

  // Markdown (headings / lists / links) — only when clearly document-like
  const mdSignals =
    (trimmed.match(/^#{1,6}\s+\S+/gm) || []).length +
    (trimmed.match(/^[-*+]\s+\S+/gm) || []).length +
    (trimmed.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  if (mdSignals >= 2 && !/[{};]\s*$/m.test(trimmed.split('\n', 3).join('\n'))) {
    return LANGUAGE_ALIASES.markdown;
  }

  if (/^(?:import|export)\s+/.test(trimmed) && /from\s+['"]/.test(trimmed)) {
    if (/\b(interface|type)\s+\w+/.test(trimmed) || /:\s*\w+[\[\]|<]/.test(trimmed)) {
      return LANGUAGE_ALIASES.typescript;
    }
    return LANGUAGE_ALIASES.javascript;
  }

  return null;
}

function resolveFenceLanguage(raw: string, code: string): LanguageInfo | null {
  const tagged = resolveLanguage(raw);
  if (tagged) {
    // Fence said "xml" but content is clearly SVG — promote for preview.
    if (tagged.canonical === 'xml' && /^<svg[\s>]/i.test(code.trim())) {
      return LANGUAGE_ALIASES.svg;
    }
    // Fence said "js" but it's clearly React JSX — promote for preview.
    if (
      (tagged.canonical === 'javascript' || tagged.canonical === 'typescript') &&
      (/<[A-Z][\w.]*[\s/>]/.test(code) || /return\s*\([\s\S]*</.test(code))
    ) {
      return tagged.canonical === 'typescript' ? LANGUAGE_ALIASES.tsx : LANGUAGE_ALIASES.jsx;
    }
    return tagged;
  }

  const key = raw.trim().toLowerCase();
  if (!key || key === 'text' || key === 'code' || key === 'plain' || key === 'plaintext') {
    return detectLanguage(code);
  }

  return null;
}

// Previewable languages get a lower bar so short diagrams / SVG / HTML
// still open as artifacts. Other languages need more substance.
const MIN_LINES = 10;
const MIN_CHARS = 300;
const PREVIEW_MIN_LINES = 3;
const PREVIEW_MIN_CHARS = 80;

function qualifies(code: string, info: LanguageInfo): boolean {
  if (code.trim().length === 0) return false;
  const lineCount = code.split('\n').length;
  // Short Mermaid diagrams (e.g. `flowchart TD\n  A-->B`) should still open.
  if (info.canonical === 'mermaid') {
    return lineCount >= 2 || code.trim().length >= 24;
  }
  if (info.previewable) {
    return lineCount >= PREVIEW_MIN_LINES || code.length >= PREVIEW_MIN_CHARS;
  }
  return lineCount >= MIN_LINES || code.length >= MIN_CHARS;
}

const MERMAID_TITLE_LABELS: Record<string, string> = {
  graph: 'Flowchart',
  flowchart: 'Flowchart',
  sequencediagram: 'Sequence Diagram',
  classdiagram: 'Class Diagram',
  statediagram: 'State Diagram',
  'statediagram-v2': 'State Diagram',
  erdiagram: 'ER Diagram',
  gantt: 'Gantt Chart',
  pie: 'Pie Chart',
  mindmap: 'Mindmap',
  timeline: 'Timeline',
  gitgraph: 'Git Graph',
  journey: 'Journey',
  quadrantchart: 'Quadrant Chart',
  'xychart-beta': 'XY Chart',
  xychart: 'XY Chart',
  'sankey-beta': 'Sankey',
  sankey: 'Sankey',
  'block-beta': 'Block Diagram',
  requirementdiagram: 'Requirement Diagram',
};

function deriveTitle(info: LanguageInfo, code: string): string {
  const firstLine = code.split('\n', 1)[0] ?? '';
  const filenameMatch = /^\s*(?:\/\/|#|--|<!--)\s*([\w.-]+\.[a-zA-Z0-9]+)\b/.exec(firstLine);
  if (filenameMatch) return filenameMatch[1];

  if (info.canonical === 'mermaid') {
    const kind = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|timeline|gitGraph|journey|quadrantChart|xychart(?:-beta)?|sankey(?:-beta)?|block(?:-beta)?|requirementDiagram)/i.exec(
      code.trim()
    );
    if (kind) {
      const key = kind[1].toLowerCase();
      return MERMAID_TITLE_LABELS[key] ?? `${kind[1]} diagram`;
    }
    return 'Mermaid Diagram';
  }

  return info.label;
}

export function getDownloadFilename(artifact: Artifact): string {
  if (/\.[a-zA-Z0-9]+$/.test(artifact.title)) return artifact.title;
  return `artifact.${LANGUAGE_INFO[artifact.language].extension}`;
}

export function getMimeType(artifact: Artifact): string {
  return LANGUAGE_INFO[artifact.language].mimeType;
}

export function canPreview(language: ArtifactLanguage): boolean {
  return PREVIEWABLE.has(language);
}

export function defaultViewMode(language: ArtifactLanguage): ArtifactViewMode {
  return canPreview(language) ? 'preview' : 'code';
}

const CLOSED_FENCE_RE = /```([\w+-]*)\n([\s\S]*?)```\n?/g;

/**
 * Splits an assistant message's raw content into an ordered list of
 * text / artifact segments, and returns the flat list of artifacts found.
 * `isStreaming` enables detection of a trailing, not-yet-closed fence as a
 * live-updating artifact.
 */
export function extractArtifacts(
  content: string,
  messageId: string,
  isStreaming: boolean
): { segments: MessageSegment[]; artifacts: Artifact[] } {
  const segments: MessageSegment[] = [];
  const artifacts: Artifact[] = [];

  let cursor = 0;
  let blockIndex = 0;
  let textBuffer = '';

  CLOSED_FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CLOSED_FENCE_RE.exec(content)) !== null) {
    const [full, rawLang, code] = match;
    const trimmedCode = code.replace(/\n$/, '');
    const info = resolveFenceLanguage(rawLang, trimmedCode);

    if (info && qualifies(trimmedCode, info)) {
      textBuffer += content.slice(cursor, match.index);
      if (textBuffer) {
        segments.push({ type: 'text', value: textBuffer });
        textBuffer = '';
      }

      const artifact: Artifact = {
        id: `${messageId}-artifact-${blockIndex}`,
        messageId,
        index: blockIndex,
        language: info.canonical,
        title: deriveTitle(info, trimmedCode),
        content: trimmedCode,
        isStreaming: false,
      };
      artifacts.push(artifact);
      segments.push({ type: 'artifact', artifact });
      blockIndex += 1;
      cursor = match.index + full.length;
    }
    // Non-qualifying fences stay in the text stream for inline code blocks.
  }

  textBuffer += content.slice(cursor);

  if (isStreaming) {
    const openFenceRe = /```([\w+-]*)\n([\s\S]*)$/;
    const openMatch = openFenceRe.exec(textBuffer);

    if (openMatch) {
      const [, rawLang, partialCode] = openMatch;
      const info = resolveFenceLanguage(rawLang, partialCode);

      if (info && qualifies(partialCode, info)) {
        const precedingText = textBuffer.slice(0, openMatch.index);
        if (precedingText) segments.push({ type: 'text', value: precedingText });

        const artifact: Artifact = {
          id: `${messageId}-artifact-${blockIndex}`,
          messageId,
          index: blockIndex,
          language: info.canonical,
          title: deriveTitle(info, partialCode),
          content: partialCode,
          isStreaming: true,
        };
        artifacts.push(artifact);
        segments.push({ type: 'artifact', artifact });
        textBuffer = '';
      }
    }
  }

  if (textBuffer) segments.push({ type: 'text', value: textBuffer });

  return { segments, artifacts };
}
