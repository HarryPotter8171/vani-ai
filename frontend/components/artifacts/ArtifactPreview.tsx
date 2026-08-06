'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
  canPreview,
  isReactPreviewLanguage,
  type ArtifactLanguage,
} from '@/lib/artifacts';
import {
  buildPreviewSrcDoc,
  looksLikeReact,
  type PreviewViewport,
} from '@/lib/artifactPreview';
import { markdownComponents, REMARK_PLUGINS } from '@/components/chat/MarkdownContent';
import { markdownUrlTransform } from '@/lib/safeUrl';
import HtmlPreview from '@/components/artifacts/HtmlPreview';
import ErrorBoundary from '@/components/artifacts/ErrorBoundary';

const previewLoading = () => (
  <div className="flex h-full items-center justify-center text-muted-foreground">
    <Spinner size={18} />
  </div>
);

const ReactPreview = dynamic(() => import('@/components/artifacts/ReactPreview'), {
  ssr: false,
  loading: previewLoading,
});

const MermaidPreview = dynamic(() => import('@/components/artifacts/MermaidPreview'), {
  ssr: false,
  loading: previewLoading,
});

interface ArtifactPreviewProps {
  language: ArtifactLanguage;
  content: string;
  className?: string;
  viewport?: PreviewViewport;
  refreshKey?: number;
  title?: string;
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="custom-scrollbar h-full overflow-auto px-6 py-5">
      <div className="prose-vani mx-auto max-w-[680px]">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          urlTransform={markdownUrlTransform}
          components={markdownComponents}
        >
          {content || ' '}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function UnsupportedPreview({ language }: { language: ArtifactLanguage }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sidebar font-medium text-foreground">Preview unavailable</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        {language.toUpperCase()} artifacts open in Code view. Switch to Code to inspect or edit.
      </p>
    </div>
  );
}

function shouldUseReactEngine(language: ArtifactLanguage, content: string): boolean {
  if (isReactPreviewLanguage(language)) return true;
  // JavaScript fences that are clearly React still get the React engine.
  return language === 'javascript' && looksLikeReact(content);
}

export default function ArtifactPreview({
  language,
  content,
  className,
  viewport = 'desktop',
  refreshKey = 0,
  title }: ArtifactPreviewProps) {
  const useReact = shouldUseReactEngine(language, content);

  const srcDoc = useMemo(() => {
    if (language === 'markdown' || language === 'mermaid') return null;
    if (useReact) return null;
    if (!canPreview(language)) return null;
    return buildPreviewSrcDoc(language, content);
  }, [language, content, useReact]);

  return (
    <ErrorBoundary title="Artifact preview crashed" className={className}>
      <div className={cn('relative h-full min-h-0 bg-[#fbfbfd] dark:bg-[#0e0e10]', className)}>
        {language === 'markdown' ? (
          <MarkdownPreview content={content} />
        ) : language === 'mermaid' ? (
          <MermaidPreview content={content} title={title ?? 'diagram'} />
        ) : useReact ? (
          <ReactPreview
            code={content}
            typescript={language === 'tsx'}
            title={`${language} preview`}
            viewport={viewport}
            refreshKey={refreshKey}
 />
        ) : srcDoc ? (
          <HtmlPreview
            srcDoc={srcDoc}
            title={`${language} preview`}
            viewport={viewport}
            refreshKey={refreshKey}
 />
        ) : (
          <UnsupportedPreview language={language} />
        )}
      </div>
    </ErrorBoundary>
  );
}
