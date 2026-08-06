'use client';

/**
 * ArtifactEditor — live code editing surface for the Artifact panel.
 * Wraps the Prism-backed read-only view and the editable textarea so callers
 * have a single import for code panes (including React Split mode).
 */

import { ArtifactCodeEditor, ArtifactCodeView } from '@/components/artifacts/ArtifactCodeEditor';
import type { ArtifactLanguage } from '@/lib/artifacts';

export { ArtifactCodeEditor, ArtifactCodeView };

export interface ArtifactEditorProps {
  language: ArtifactLanguage;
  value: string;
  onChange: (value: string) => void;
  wordWrap?: boolean;
  /** When false, renders a read-only highlighted view instead of the textarea. */
  editable?: boolean;
  isStreaming?: boolean;
}

/**
 * Unified editor entrypoint used by ArtifactPanel.
 * Prefer this over importing ArtifactCodeEditor directly.
 */
export default function ArtifactEditor({
  language,
  value,
  onChange,
  wordWrap,
  editable = true,
  isStreaming,
}: ArtifactEditorProps) {
  if (!editable) {
    return (
      <ArtifactCodeView
        language={language}
        content={value}
        isStreaming={isStreaming}
        wordWrap={wordWrap}
 />
    );
  }

  return (
    <ArtifactCodeEditor
      language={language}
      value={value}
      onChange={onChange}
      wordWrap={wordWrap}
 />
  );
}
