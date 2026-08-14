'use client';

import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { markdownUrlTransform, safeHref, isRenderableImageSrc, stripHallucinatedImageMarkdown } from '@/lib/safeUrl';

/** Stable base plugins — math/KaTeX loaded on demand when `$` / `$$` present. */
export const REMARK_PLUGINS = [remarkGfm];
/** Empty until math path loads — keeps KaTeX CSS/JS off first paint. */
export const REHYPE_PLUGINS: unknown[] = [];

/** Detect inline/block TeX that needs remark-math + rehype-katex. */
export function contentLikelyHasMath(content: string): boolean {
  if (!content) return false;
  if (content.includes('$$')) return true;
  // Inline $...$ (avoid bare currency like $5 by requiring a non-space after $)
  if (/\$[^$\s][^$]*\$/.test(content)) return true;
  if (/\\\(|\\\[|\\begin\{/.test(content)) return true;
  return false;
}

type MathPluginState = {
  remark: unknown[];
  rehype: unknown[];
};

let mathPluginsCache: MathPluginState | null = null;
let mathPluginsPromise: Promise<MathPluginState> | null = null;

async function loadMathPlugins(): Promise<MathPluginState> {
  if (mathPluginsCache) return mathPluginsCache;
  if (!mathPluginsPromise) {
    mathPluginsPromise = (async () => {
      const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([
        import('remark-math'),
        import('rehype-katex'),
        import('katex/dist/katex.min.css'),
      ]);
      mathPluginsCache = {
        remark: [remarkGfm, remarkMath],
        rehype: [[rehypeKatex, { throwOnError: false, strict: 'ignore' }]],
      };
      return mathPluginsCache;
    })().catch((err) => {
      mathPluginsPromise = null;
      throw err;
    });
  }
  return mathPluginsPromise;
}

const InPreContext = createContext(false);

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
};

function normalizeLang(raw?: string): string {
  if (!raw) return 'text';
  const key = raw.toLowerCase();
  return LANG_ALIASES[key] || key;
}

function FencedCode({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  const language = normalizeLang(match?.[1]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'group/code my-5 overflow-hidden rounded-[16px]',
        'border border-[var(--code-border)] bg-[var(--code-bg)]',
        'shadow-1',
        'font-sans',
        'max-md:my-4 max-md:-mx-1'
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--code-border)] bg-[var(--code-header)] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
            <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]/90" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]/90" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]/90" />
          </div>
          <span className="truncate text-micro font-medium uppercase tracking-[0.08em] text-[var(--code-text)]/45">
            {language}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1',
            'text-micro font-medium',
            'bg-white/[0.06] text-[var(--code-text)]/55 hover:bg-white/[0.11] hover:text-[var(--code-text)]/90',
            'opacity-100 transition-opacity sm:opacity-80 sm:group-hover/code:opacity-100'
          )}
        >
          {copied ? (
            <>
              <Check size={12} strokeWidth={2.5} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} strokeWidth={2} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="custom-scrollbar -webkit-overflow-scrolling-touch overflow-x-auto overscroll-x-contain">
        <Highlight theme={themes.nightOwl} code={codeString} language={language as never}>
          {({ className: hlClass, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={cn(
                hlClass,
                'm-0 min-w-0 px-3 py-3.5 font-mono text-[0.8125rem] leading-[1.65] sm:px-4 sm:text-sm'
              )}
              style={{ ...style, background: 'transparent', margin: 0 }}
              {...props}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })} className="table-row">
                  <span
                    className="table-cell select-none pr-3 text-right text-micro opacity-30 sm:pr-4"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="table-cell whitespace-pre">
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}

function InlineCode({
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        'rounded-[6px] px-1.5 py-0.5 font-mono text-[0.86em] font-medium',
        'bg-primary/[0.08] text-primary dark:bg-primary/[0.14]'
      )}
      {...props}
    >
      {children}
    </code>
  );
}

function Code({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const inPre = useContext(InPreContext);
  if (inPre) {
    return (
      <FencedCode className={className} {...props}>
        {children}
      </FencedCode>
    );
  }
  return <InlineCode {...props}>{children}</InlineCode>;
}

function MarkdownTable({ children }: { children?: React.ReactNode }) {
  return (
    <div className="table-wrap custom-scrollbar -webkit-overflow-scrolling-touch overscroll-x-contain">
      <table>{children}</table>
    </div>
  );
}

function MarkdownImage({
  src,
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const srcStr = typeof src === 'string' ? src.trim() : '';
  const safeSrc = isRenderableImageSrc(srcStr);
  const [imgError, setImgError] = useState(!safeSrc);

  useEffect(() => {
    setImgError(!safeSrc);
  }, [safeSrc]);

  // Missing, empty, or invalid src — never mount <img> (avoids broken icon + alt text).
  if (!safeSrc || imgError) {
    return (
      <div className="my-2 text-sm italic text-gray-400">[Image unavailable]</div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safeSrc}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setImgError(true)}
      className={cn(
        'img-fade-in my-4 block h-auto max-h-[min(480px,60vh)] w-auto max-w-full',
        'rounded-[14px] object-contain ring-1 ring-border-subtle',
        'max-md:max-h-[min(280px,45vh)] max-md:rounded-[12px]'
      )}
    />
  );
}


/** Inline citation superscript chip — numbers in [n] form become chips when citations exist. */
export function CitationChip({
  n,
  title,
  href,
}: {
  n: number | string;
  title?: string;
  href?: string;
}) {
  const content = <span className="citation-chip">{n}</span>;
  const safe = safeHref(href);
  if (safe) {
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer" title={title} className="no-underline">
        {content}
      </a>
    );
  }
  return (
    <button type="button" title={title} className="border-0 bg-transparent p-0">
      {content}
    </button>
  );
}

const ParagraphHighlightContext = createContext<number>(-1);

function MarkdownParagraph({ children }: { children?: React.ReactNode }) {
  const highlightIndex = useContext(ParagraphHighlightContext);
  return (
    <ParagraphIndexAssign>
      {(index) => {
        const highlighted = highlightIndex >= 0 && index === highlightIndex;
        return (
          <p
            data-tts-para={index}
            className={cn(
              'mb-4 last:mb-0 text-chat leading-[1.7] tracking-[-0.015em]',
              highlighted && 'tts-paragraph-active rounded-md -mx-1 px-1'
            )}
          >
            {children}
          </p>
        );
      }}
    </ParagraphIndexAssign>
  );
}

const ParaCounterContext = createContext<{ current: number }>({ current: 0 });

function ParagraphIndexAssign({
  children,
}: {
  children: (index: number) => React.ReactNode;
}) {
  const counter = useContext(ParaCounterContext);
  const index = counter.current++;
  return <>{children(index)}</>;
}

export const markdownComponents = {
  pre: ({ children }: { children?: React.ReactNode }) => (
    <InPreContext.Provider value={true}>{children}</InPreContext.Provider>
  ),
  p: MarkdownParagraph,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 mt-6 text-[1.35rem] font-semibold tracking-[-0.03em] first:mt-0 leading-[1.3]">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2.5 mt-5 text-[1.15rem] font-semibold tracking-[-0.022em] first:mt-0 leading-[1.35]">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-4 text-assistant font-semibold tracking-[-0.016em] first:mt-0 leading-[1.4]">
      {children}
    </h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-4 ml-0.5 space-y-2 pl-5 list-disc marker:text-primary/55">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-4 ml-0.5 space-y-2 pl-5 list-decimal marker:text-primary/55">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-chat leading-[1.7] tracking-[-0.015em] pl-0.5">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-foreground/90">{children}</em>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-4 border-l-[3px] border-primary/40 bg-accent-soft py-2.5 pl-4 pr-3 rounded-r-[12px] text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const safe = safeHref(href);
    if (!safe) {
      return <span className="font-medium text-foreground">{children}</span>;
    }
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline decoration-accent/25 underline-offset-[3px] transition-opacity duration-150 hover:opacity-70"
      >
        {children}
      </a>
    );
  },
  table: MarkdownTable,
  thead: ({ children }: { children?: React.ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => <tr>{children}</tr>,
  th: ({ children }: { children?: React.ReactNode }) => <th>{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td>{children}</td>,
  hr: () => <hr className="my-6 border-0 border-t border-divider" />,
  code: Code,
  img: MarkdownImage,
};

export interface MarkdownContentProps {
  content: string;
  className?: string;
  /** When >= 0, highlight that speakable paragraph index during TTS. */
  highlightParagraph?: number;
  /** Defer heavy Prism/KaTeX until near viewport (settled messages). */
  lazy?: boolean;
  /** Soften remounts while tokens arrive. */
  streaming?: boolean;
}

function MarkdownContentInner({
  content,
  className,
  highlightParagraph = -1,
  lazy = false,
  streaming = false,
}: MarkdownContentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(
    () => !lazy || typeof IntersectionObserver === 'undefined'
  );
  const components = useMemo(() => markdownComponents, []);
  const counter = useMemo(() => ({ current: 0 }), [content, highlightParagraph]);
  const sanitizedContent = useMemo(
    () => stripHallucinatedImageMarkdown(content),
    [content]
  );
  const needsMath = useMemo(
    () => contentLikelyHasMath(sanitizedContent),
    [sanitizedContent]
  );
  const [mathPlugins, setMathPlugins] = useState<MathPluginState | null>(
    () => (needsMath ? mathPluginsCache : null)
  );

  useEffect(() => {
    if (!lazy || visible) return;
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '240px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!visible || !needsMath) {
      if (!needsMath) setMathPlugins(null);
      return;
    }
    if (mathPluginsCache) {
      setMathPlugins(mathPluginsCache);
      return;
    }
    let cancelled = false;
    void loadMathPlugins().then((plugins) => {
      if (!cancelled) setMathPlugins(plugins);
    });
    return () => {
      cancelled = true;
    };
  }, [needsMath, visible]);

  const remarkPlugins = (mathPlugins?.remark as typeof REMARK_PLUGINS) || REMARK_PLUGINS;
  const rehypePlugins = (mathPlugins?.rehype as typeof REHYPE_PLUGINS) || REHYPE_PLUGINS;

  return (
    <ParagraphHighlightContext.Provider value={highlightParagraph}>
      <ParaCounterContext.Provider value={counter}>
        <div
          ref={rootRef}
          className={cn(
            'prose-vani',
            streaming && 'streaming-markdown',
            className
          )}
        >
          {visible ? (
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins as never}
              urlTransform={markdownUrlTransform}
              components={components}
            >
              {sanitizedContent}
            </ReactMarkdown>
          ) : (
            <p className="mb-0 whitespace-pre-wrap text-chat leading-[1.7] tracking-[-0.015em] text-text-secondary/80">
              {sanitizedContent.slice(0, 280)}
              {sanitizedContent.length > 280 ? '…' : ''}
            </p>
          )}
        </div>
      </ParaCounterContext.Provider>
    </ParagraphHighlightContext.Provider>
  );
}

const MarkdownContent = memo(MarkdownContentInner);
export default MarkdownContent;
