'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlight, themes } from 'prism-react-renderer';
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  ChevronUp,
  WrapText,
  FileCode2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGUAGE_INFO, getDownloadFilename, type Artifact } from '@/lib/artifacts';

interface ArtifactPanelProps {
  artifact: Artifact;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

function IconButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors duration-150',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]'
      )}
    >
      {children}
    </button>
  );
}

export default function ArtifactPanel({
  artifact,
  isFullscreen,
  onToggleFullscreen,
  onClose,
}: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  const info = LANGUAGE_INFO[artifact.language];
  const lineCount = artifact.content.split('\n').length;

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getDownloadFilename(artifact);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      key="artifact-panel"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: isFullscreen ? '100%' : 460, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'relative z-30 flex h-full shrink-0 flex-col overflow-hidden',
        'border-l border-black/[0.06] dark:border-white/[0.08]',
        'bg-white/70 dark:bg-[#0b0b0c]/95 backdrop-blur-2xl',
        isFullscreen && 'fixed inset-0 z-50 border-l-0'
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.07]">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-primary/10 text-primary dark:bg-primary/15">
            <FileCode2 size={14} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-foreground">{artifact.title}</div>
            <div className="text-[11px] text-muted-foreground">
              {info.label} · {lineCount} lines
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label={wordWrap ? 'Disable word wrap' : 'Enable word wrap'} active={wordWrap} onClick={() => setWordWrap((v) => !v)}>
            <WrapText size={14.5} strokeWidth={2} />
          </IconButton>
          <IconButton label={copied ? 'Copied' : 'Copy code'} onClick={handleCopy}>
            {copied ? <Check size={14.5} strokeWidth={2.25} className="text-emerald-500" /> : <Copy size={14.5} strokeWidth={2} />}
          </IconButton>
          <IconButton label="Download" onClick={handleDownload}>
            <Download size={14.5} strokeWidth={2} />
          </IconButton>
          <IconButton label={isCollapsed ? 'Expand' : 'Collapse'} onClick={() => setIsCollapsed((v) => !v)}>
            {isCollapsed ? <ChevronDown size={14.5} strokeWidth={2} /> : <ChevronUp size={14.5} strokeWidth={2} />}
          </IconButton>
          <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize2 size={14.5} strokeWidth={2} /> : <Maximize2 size={14.5} strokeWidth={2} />}
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </IconButton>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <div className={cn('custom-scrollbar h-full overflow-auto', wordWrap ? 'overflow-x-hidden' : 'overflow-x-auto')}>
              <Highlight theme={themes.vsDark} code={artifact.content} language={info.prismLanguage}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre
                    className={cn(className, 'm-0 min-h-full px-0 py-4 font-mono text-[12.5px] leading-[1.7]')}
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
                    {artifact.isStreaming && (
                      <div className="px-4">
                        <span className="mr-4 inline-block w-6" />
                        <span className="streaming-cursor-inline" />
                      </div>
                    )}
                  </pre>
                )}
              </Highlight>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
