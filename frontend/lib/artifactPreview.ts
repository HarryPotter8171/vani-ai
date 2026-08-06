/**
 * Builds sandboxed preview documents for HTML / React / CSS / SVG artifacts.
 * Preview HTML is always opened inside an iframe with a tight sandbox —
 * never injected into the host DOM.
 */

import type { ArtifactLanguage } from '@/lib/artifacts';
import { injectPreviewSecurity, sanitizeHtmlForPreview } from '@/lib/htmlSanitize';
import { looksLikeReact, wrapReactDocument } from '@/lib/reactPreviewRuntime';

export {
  buildReactBootstrapDocument,
  isReactPreviewMessage,
  looksLikeReact,
  prepareReactSource,
  REACT_PREVIEW_CHANNEL,
  wrapReactDocument,
  type ReactConsoleLevel,
  type ReactPreviewMessage,
} from '@/lib/reactPreviewRuntime';

/**
 * Tight iframe sandbox:
 * - allow-scripts: demos with JS/CSS interaction
 * - allow-forms: form UI demos
 * - allow-modals: alert/confirm in demos
 * Deliberately omitted:
 * - allow-same-origin → blocks parent window access / cookie theft
 * - allow-popups → blocks window.open / target=_blank
 * - allow-top-navigation* → blocks escaping to the host page
 */
const IFRAME_SANDBOX = 'allow-scripts allow-forms allow-modals';

export { IFRAME_SANDBOX };

export type PreviewViewport = 'desktop' | 'tablet' | 'mobile';

export const PREVIEW_VIEWPORT_WIDTHS: Record<PreviewViewport, number | '100%'> = {
  desktop: '100%',
  tablet: 768,
  mobile: 390,
};

function escapeForScript(code: string): string {
  // Prevent premature </script> termination inside the preview document.
  return code.replace(/<\/script/gi, '<\\/script');
}

function finalizeDocument(doc: string): string {
  return injectPreviewSecurity(doc);
}

function wrapHtmlDocument(bodyOrDoc: string): string {
  const sanitized = sanitizeHtmlForPreview(bodyOrDoc);
  const trimmed = sanitized.trim();
  if (/^<!DOCTYPE/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return finalizeDocument(trimmed);
  }
  return finalizeDocument(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      background: #ffffff;
      color: #111827;
    }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
${trimmed}
</body>
</html>`);
}

function wrapCssDocument(css: string): string {
  return finalizeDocument(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
    }
    .preview-stage {
      max-width: 560px;
      margin: 40px auto;
      padding: 28px;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.06);
    }
    h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 8px; }
    p { margin: 0 0 18px; color: #6e6e73; line-height: 1.5; }
    button {
      appearance: none;
      border: 0;
      border-radius: 980px;
      padding: 10px 18px;
      background: var(--accent);
      color: #fff;
      font-weight: 500;
      cursor: pointer;
    }
    .card {
      margin-top: 18px;
      padding: 16px;
      border-radius: 14px;
      background: #f5f5f7;
    }
  </style>
  <style>${escapeForScript(css)}</style>
</head>
<body>
  <div class="preview-stage">
    <h1>CSS Preview</h1>
    <p>Sample content styled by your stylesheet.</p>
    <button type="button">Primary button</button>
    <div class="card">
      <strong>Card</strong>
      <p style="margin: 6px 0 0">Use class names from your CSS to style this stage.</p>
    </div>
  </div>
</body>
</html>`);
}

function wrapSvgDocument(svg: string): string {
  const trimmed = sanitizeHtmlForPreview(svg).trim();
  const markup = /^<svg[\s>]/i.test(trimmed) ? trimmed : `<svg xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;
  return finalizeDocument(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      display: grid;
      place-items: center;
      background:
        linear-gradient(45deg, #f0f0f2 25%, transparent 25%),
        linear-gradient(-45deg, #f0f0f2 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #f0f0f2 75%),
        linear-gradient(-45deg, transparent 75%, #f0f0f2 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0;
      background-color: #fafafa;
    }
    svg { max-width: min(92vw, 720px); max-height: 90vh; height: auto; }
  </style>
</head>
<body>
${markup}
</body>
</html>`);
}

function wrapJavascriptDocument(code: string): string {
  if (looksLikeReact(code)) return wrapReactDocument(code, false);

  return finalizeDocument(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #0b0b0c;
      color: #e8e8ed;
      padding: 16px;
      font-size: 12.5px;
      line-height: 1.6;
    }
    #log { white-space: pre-wrap; }
    .err { color: #ff6b6b; }
  </style>
</head>
<body>
  <div id="log"></div>
  <script>
    (function () {
      var logEl = document.getElementById('log');
      function write(cls, args) {
        var line = document.createElement('div');
        if (cls) line.className = cls;
        line.textContent = args.map(function (a) {
          try { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }
          catch (e) { return String(a); }
        }).join(' ');
        logEl.appendChild(line);
      }
      var native = console.log.bind(console);
      console.log = function () { write('', Array.prototype.slice.call(arguments)); native.apply(console, arguments); };
      console.error = function () { write('err', Array.prototype.slice.call(arguments)); };
      try {
${escapeForScript(code)}
      } catch (err) {
        write('err', [err && err.stack ? err.stack : String(err)]);
      }
    })();
  <\/script>
</body>
</html>`);
}

function wrapMermaidDocument(code: string, dark: boolean): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const theme = dark ? 'dark' : 'neutral';
  const bg = dark ? '#0e0e10' : '#fbfbfd';
  const fg = dark ? '#e8e8ed' : '#1d1d1f';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mermaid Diagram</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      background: ${bg};
      color: ${fg};
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    }
    #stage {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 32px;
      box-sizing: border-box;
    }
    .error {
      max-width: 480px;
      padding: 16px 18px;
      border-radius: 14px;
      border: 1px solid rgba(239, 68, 68, 0.25);
      background: rgba(239, 68, 68, 0.08);
      color: #b91c1c;
      font-size: 13px;
      white-space: pre-wrap;
    }
    .mermaid { max-width: 100%; }
    svg { max-width: min(96vw, 1100px); height: auto; }
  </style>
</head>
<body>
  <div id="stage">
    <pre class="mermaid">${escaped}</pre>
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: '${theme}',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    });
    try {
      await mermaid.run({ querySelector: '.mermaid' });
    } catch (err) {
      const stage = document.getElementById('stage');
      const msg = document.createElement('div');
      msg.className = 'error';
      msg.textContent = err && err.message ? err.message : String(err);
      stage.replaceChildren(msg);
    }
  <\/script>
</body>
</html>`;
}

export function buildPreviewDocument(language: ArtifactLanguage, content: string): string | null {
  switch (language) {
    case 'html':
      return wrapHtmlDocument(content);
    case 'css':
      return wrapCssDocument(content);
    case 'svg':
      return wrapSvgDocument(content);
    case 'jsx':
      return wrapReactDocument(content, false);
    case 'tsx':
      return wrapReactDocument(content, true);
    case 'javascript':
      return wrapJavascriptDocument(content);
    case 'mermaid': {
      const dark =
        typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark');
      return wrapMermaidDocument(content, dark);
    }
    default:
      return null;
  }
}

export function buildPreviewSrcDoc(language: ArtifactLanguage, content: string): string | null {
  return buildPreviewDocument(language, content);
}

/** Open a preview (or raw content) in a new browser tab. */
export function openArtifactInNewTab(language: ArtifactLanguage, content: string, title: string): void {
  const doc = buildPreviewDocument(language, content);
  if (doc) {
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) {
      // Revoke after the new tab has a chance to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      URL.revokeObjectURL(url);
    }
    return;
  }

  // Markdown / code-only: open as plain text
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (win) {
    try {
      win.document.title = title;
    } catch {
      /* cross-origin blob quirks — ignore */
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    URL.revokeObjectURL(url);
  }
}
