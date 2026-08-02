/**
 * Client-side "Artifacts" detection: parses fenced code blocks out of an
 * assistant message and decides which ones are substantial enough to be
 * promoted into a dedicated side-panel artifact instead of an inline code
 * block. Runs on both finished messages and messages that are still
 * streaming (an unterminated trailing fence is treated as a live artifact).
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
  | 'xml';

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

interface LanguageInfo {
  canonical: ArtifactLanguage;
  prismLanguage: string;
  extension: string;
  label: string;
}

const LANGUAGE_ALIASES: Record<string, LanguageInfo> = {
  html: { canonical: 'html', prismLanguage: 'markup', extension: 'html', label: 'HTML' },
  htm: { canonical: 'html', prismLanguage: 'markup', extension: 'html', label: 'HTML' },
  xml: { canonical: 'xml', prismLanguage: 'markup', extension: 'xml', label: 'XML' },
  svg: { canonical: 'xml', prismLanguage: 'markup', extension: 'svg', label: 'SVG' },
  css: { canonical: 'css', prismLanguage: 'css', extension: 'css', label: 'CSS' },
  js: { canonical: 'javascript', prismLanguage: 'javascript', extension: 'js', label: 'JavaScript' },
  javascript: { canonical: 'javascript', prismLanguage: 'javascript', extension: 'js', label: 'JavaScript' },
  jsx: { canonical: 'jsx', prismLanguage: 'jsx', extension: 'jsx', label: 'React (JSX)' },
  ts: { canonical: 'typescript', prismLanguage: 'typescript', extension: 'ts', label: 'TypeScript' },
  typescript: { canonical: 'typescript', prismLanguage: 'typescript', extension: 'ts', label: 'TypeScript' },
  tsx: { canonical: 'tsx', prismLanguage: 'tsx', extension: 'tsx', label: 'React (TSX)' },
  py: { canonical: 'python', prismLanguage: 'python', extension: 'py', label: 'Python' },
  python: { canonical: 'python', prismLanguage: 'python', extension: 'py', label: 'Python' },
  sql: { canonical: 'sql', prismLanguage: 'sql', extension: 'sql', label: 'SQL' },
  json: { canonical: 'json', prismLanguage: 'json', extension: 'json', label: 'JSON' },
  md: { canonical: 'markdown', prismLanguage: 'markdown', extension: 'md', label: 'Markdown' },
  markdown: { canonical: 'markdown', prismLanguage: 'markdown', extension: 'md', label: 'Markdown' },
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
};

function resolveLanguage(raw: string): LanguageInfo | null {
  const key = raw.trim().toLowerCase();
  return LANGUAGE_ALIASES[key] ?? null;
}

// A block is "long" enough to deserve its own artifact rather than an
// inline code block. Monotonic in content length, so a block that has
// already qualified while streaming can never later "downgrade" once the
// fence closes (content only ever grows during a stream).
const MIN_LINES = 10;
const MIN_CHARS = 300;

function qualifies(code: string): boolean {
  if (code.trim().length === 0) return false;
  const lineCount = code.split('\n').length;
  return lineCount >= MIN_LINES || code.length >= MIN_CHARS;
}

function deriveTitle(info: LanguageInfo, code: string): string {
  const firstLine = code.split('\n', 1)[0] ?? '';
  const filenameMatch = /^\s*(?:\/\/|#|--|<!--)\s*([\w.-]+\.[a-zA-Z0-9]+)\b/.exec(firstLine);
  if (filenameMatch) return filenameMatch[1];
  return info.label;
}

export function getDownloadFilename(artifact: Artifact): string {
  if (/\.[a-zA-Z0-9]+$/.test(artifact.title)) return artifact.title;
  return `artifact.${LANGUAGE_INFO[artifact.language].extension}`;
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
    const info = resolveLanguage(rawLang);
    const trimmedCode = code.replace(/\n$/, '');

    if (info && qualifies(trimmedCode)) {
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
    // Non-qualifying fences (short snippets, unsupported languages) are
    // left untouched in the text stream so they keep rendering as normal
    // inline code blocks via the existing markdown CodeBlock component.
  }

  textBuffer += content.slice(cursor);

  if (isStreaming) {
    const openFenceRe = /```([\w+-]*)\n([\s\S]*)$/;
    const openMatch = openFenceRe.exec(textBuffer);

    if (openMatch) {
      const [, rawLang, partialCode] = openMatch;
      const info = resolveLanguage(rawLang);

      if (info && qualifies(partialCode)) {
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
