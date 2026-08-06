'use client';

import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';
import { LANGUAGE_INFO, type ArtifactLanguage } from '@/lib/artifacts';

interface ArtifactCodeViewProps {
  language: ArtifactLanguage;
  content: string;
  isStreaming?: boolean;
  wordWrap?: boolean;
}

/** Read-only syntax-highlighted code view. */
export function ArtifactCodeView({
  language,
  content,
  isStreaming,
  wordWrap,
}: ArtifactCodeViewProps) {
  const info = LANGUAGE_INFO[language];

  return (
    <div className={cn('custom-scrollbar h-full overflow-auto', wordWrap ? 'overflow-x-hidden' : 'overflow-x-auto')}>
      <Highlight theme={themes.vsDark} code={content} language={info.prismLanguage}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(className, 'm-0 min-h-full px-0 py-4 font-mono text-sm leading-[1.7]')}
            style={{ ...style, backgroundColor: 'transparent' }}
          >
            {tokens.map((line, lineIndex) => {
              const lineProps = getLineProps({ line });
              return (
                <div
                  {...lineProps}
                  key={lineIndex}
                  className={cn(lineProps.className, 'px-4', wordWrap && 'whitespace-pre-wrap break-words')}
                >
                  <span className="mr-4 inline-block w-6 shrink-0 select-none text-right text-white/25">
                    {lineIndex + 1}
                  </span>
                  {line.map((token, tokenIndex) => {
                    const tokenProps = getTokenProps({ token });
                    return <span {...tokenProps} key={tokenIndex} />;
                  })}
                </div>
              );
            })}
            {isStreaming && (
              <div className="px-4">
                <span className="mr-4 inline-block w-6" />
                <span className="streaming-cursor-inline" />
              </div>
            )}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

interface ArtifactCodeEditorProps {
  language: ArtifactLanguage;
  value: string;
  onChange: (value: string) => void;
  wordWrap?: boolean;
}

/** Editable plain textarea for artifact edit mode. */
export function ArtifactCodeEditor({ language, value, onChange, wordWrap }: ArtifactCodeEditorProps) {
  const info = LANGUAGE_INFO[language];
  const lineCount = Math.max(value.split('\n').length, 1);

  return (
    <div className="relative flex h-full min-h-0 bg-[#1e1e1e]">
      <div
        aria-hidden
        className="custom-scrollbar shrink-0 select-none overflow-hidden border-r border-white/[0.06] py-4 pl-3 pr-2 text-right font-mono text-sm leading-[1.7] text-white/25"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label={`Edit ${info.label} artifact`}
        className={cn(
          'custom-scrollbar h-full w-full resize-none border-0 bg-transparent px-4 py-4',
          'font-mono text-sm leading-[1.7] text-[#ececf1]/92',
          'focus-ring-token',
          wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
        )}
 />
    </div>
  );
}
