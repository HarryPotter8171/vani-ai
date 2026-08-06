'use client';

import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { CanvasType } from '@/lib/canvas/types';
import { markdownComponents } from '@/components/chat/MarkdownContent';
import HtmlPreview from '@/components/artifacts/HtmlPreview';
import ErrorBoundary from '@/components/artifacts/ErrorBoundary';
import { buildPreviewSrcDoc } from '@/lib/artifactPreview';
import { sanitizeRichtextHtmlSafe } from '@/lib/richtextSanitize';
import { markdownUrlTransform } from '@/lib/safeUrl';

const ReactPreview = dynamic(() => import('@/components/artifacts/ReactPreview'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Spinner size={18} />
    </div>
  ),
});

const MermaidPreview = dynamic(() => import('@/components/artifacts/MermaidPreview'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Spinner size={18} />
    </div>
  ),
});

interface CanvasPreviewProps {
  type: CanvasType;
  content: string;
  language?: string | null;
  className?: string;
  refreshKey?: number;
  title?: string;
}

function CsvTable({ content }: { content: string }) {
  const rows = content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()));
  if (!rows.length) {
    return <p className="p-6 text-sm text-muted-foreground">Empty CSV</p>;
  }
  const [header, ...body] = rows;
  return (
    <div className="custom-scrollbar h-full overflow-auto p-4">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="border-b border-black/10 px-3 py-2 font-medium text-foreground dark:border-white/10"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="odd:bg-black/[0.02] dark:odd:bg-white/[0.03]">
              {row.map((cell, ci) => (
                <td key={ci} className="border-b border-black/[0.04] px-3 py-1.5 dark:border-white/[0.04]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CanvasPreview({
  type,
  content,
  language,
  className,
  refreshKey,
  title }: CanvasPreviewProps) {
  if (type === 'mermaid') {
    return (
      <ErrorBoundary title="Mermaid preview crashed">
        <MermaidPreview content={content} className={className} title={title} />
      </ErrorBoundary>
    );
  }

  if (type === 'react') {
    return (
      <ErrorBoundary title="React preview crashed">
        <ReactPreview
          code={content}
          typescript={language === 'tsx'}
          className={className}
          refreshKey={refreshKey}
          title={title}
 />
      </ErrorBoundary>
    );
  }

  if (type === 'html') {
    const srcDoc = buildPreviewSrcDoc('html', content) ?? '';
    return (
      <ErrorBoundary title="HTML preview crashed">
        <HtmlPreview
          srcDoc={srcDoc}
          className={className}
          refreshKey={refreshKey}
          title={title}
 />
      </ErrorBoundary>
    );
  }

  if (type === 'csv') {
    return <CsvTable content={content} />;
  }

  if (type === 'json') {
    let formatted = content;
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      /* keep raw */
    }
    return (
      <pre className={cn('custom-scrollbar h-full overflow-auto p-5 font-mono text-sm', className)}>
        {formatted}
      </pre>
    );
  }

  if (type === 'richtext') {
    const safeHtml = sanitizeRichtextHtmlSafe(content || '<p></p>');
    return (
      <div
        className={cn('prose-vani custom-scrollbar h-full overflow-auto px-6 py-5', className)}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  // markdown + plaintext + code fallback
  return (
    <div className={cn('custom-scrollbar h-full overflow-auto px-6 py-5', className)}>
      <div className="prose-vani mx-auto max-w-[680px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={markdownUrlTransform}
          components={markdownComponents}
        >
          {content || ' '}
        </ReactMarkdown>
      </div>
    </div>
  );
}
