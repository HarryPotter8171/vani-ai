import type { Artifact, ArtifactLanguage } from '@/lib/artifacts';
import type { CanvasType } from '@/lib/canvas/types';

/**
 * @deprecated Auto-open from message length/artifacts is disabled.
 * Kept for callers that still import the constant; never used to open Canvas.
 */
export const LONG_CONTENT_THRESHOLD = 1200;

const ARTIFACT_TO_CANVAS: Partial<Record<ArtifactLanguage, CanvasType>> = {
  html: 'html',
  css: 'code',
  javascript: 'code',
  jsx: 'react',
  typescript: 'code',
  tsx: 'react',
  python: 'code',
  sql: 'code',
  markdown: 'markdown',
  json: 'json',
  xml: 'code',
  svg: 'html',
  mermaid: 'mermaid',
};

export function canvasTypeFromArtifact(language: ArtifactLanguage): CanvasType {
  return ARTIFACT_TO_CANVAS[language] ?? 'code';
}

export function languageFromArtifact(language: ArtifactLanguage): string | null {
  if (language === 'jsx' || language === 'tsx') return language;
  if (language === 'html' || language === 'markdown' || language === 'mermaid' || language === 'json') {
    return language;
  }
  return language;
}

/** Infer canvas type from freeform assistant text (no artifact fences). */
export function inferCanvasTypeFromContent(content: string): CanvasType {
  const trimmed = content.trim();
  if (!trimmed) return 'markdown';

  if (/^```mermaid/i.test(trimmed) || /^(graph|flowchart|sequenceDiagram|classDiagram)\b/m.test(trimmed)) {
    return 'mermaid';
  }

  if (/^\s*[\[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* fall through */
    }
  }

  if (/^(<!DOCTYPE|<html|<svg)\b/i.test(trimmed)) return 'html';

  if (
    /^(import\s+React|export\s+default\s+function|function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*return\s*\()/m.test(
      trimmed
    )
  ) {
    return 'react';
  }

  if (/^[\w\s,"]+,[\w\s,"]+$/m.test(trimmed) && trimmed.includes('\n') && trimmed.includes(',')) {
    const lines = trimmed.split('\n').filter(Boolean);
    if (lines.length >= 2 && lines.every((l) => l.includes(','))) return 'csv';
  }

  if (/^#{1,6}\s|^\*\s|^\-\s|```/.test(trimmed)) return 'markdown';

  return 'markdown';
}

/**
 * Canvas never auto-opens — not from streaming, artifacts, length, or
 * prompt phrasing. Open only via explicit UI ("Open in Canvas", etc.).
 */
export function shouldAutoOpenCanvasFromMessage(
  _content: string,
  _artifacts: Artifact[]
): boolean {
  return false;
}

export function titleFromContent(content: string, fallback = 'Canvas'): string {
  const line =
    content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('```')) || fallback;
  return line.replace(/^#+\s*/, '').slice(0, 80) || fallback;
}

export function artifactToCanvasInput(artifact: Artifact, chatId: string | null) {
  return {
    title: artifact.title || titleFromContent(artifact.content, 'Artifact'),
    type: canvasTypeFromArtifact(artifact.language),
    language: languageFromArtifact(artifact.language),
    content: artifact.content,
    chatId,
    sourceArtifactId: artifact.id,
    syncFromArtifact: true,
  };
}
