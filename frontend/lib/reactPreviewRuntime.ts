/**
 * React preview runtime helpers:
 * - prepare source for CDN React 18 + Babel
 * - build a stable bootstrap document (Fast Refresh–style updates via postMessage)
 * - build a self-contained document for open-in-new-tab / download fallbacks
 *
 * Execution always happens inside a sandboxed iframe — never in the host DOM.
 */

import { injectPreviewSecurity } from '@/lib/htmlSanitize';

/** postMessage channel shared by the iframe runtime and ReactPreview host. */
export const REACT_PREVIEW_CHANNEL = 'vani-react-preview';

export type ReactPreviewInboundType = 'execute' | 'clear-console';
export type ReactPreviewOutboundType =
  | 'ready'
  | 'console'
  | 'runtime-error'
  | 'compile-error'
  | 'render-ok'
  | 'status';

export type ReactConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ReactPreviewMessage {
  channel: typeof REACT_PREVIEW_CHANNEL;
  type: ReactPreviewInboundType | ReactPreviewOutboundType;
  revision?: number;
  typescript?: boolean;
  code?: string;
  level?: ReactConsoleLevel;
  args?: unknown[];
  message?: string;
  stack?: string;
  detail?: string;
}

export function isReactPreviewMessage(data: unknown): data is ReactPreviewMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as ReactPreviewMessage).channel === REACT_PREVIEW_CHANNEL &&
    typeof (data as ReactPreviewMessage).type === 'string'
  );
}

export function looksLikeReact(code: string): boolean {
  return (
    /<[A-Z][\w.]*[\s/>]/.test(code) ||
    /return\s*\([\s\S]*</.test(code) ||
    /\bReact\b/.test(code) ||
    /\b(?:useState|useEffect|useMemo|useCallback|useRef|createRoot)\b/.test(code)
  );
}

/**
 * Prepare user React/JSX/TSX source for Babel in a CDN preview:
 * - strip ESM imports/exports that CDN globals replace
 * - inject common React hooks as locals after import stripping
 * - ensure something mounts into #root
 */
export function prepareReactSource(code: string): string {
  let source = code
    .replace(/^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+(?=async\s+)?(?=function|const|class|let|var)/gm, '')
    .replace(/^\s*export\s+type\s+[\s\S]*?;?\s*$/gm, '')
    .replace(/^\s*export\s+interface\s+[\s\S]*?\}\s*$/gm, '')
    .trim();

  // Bare JSX expression / fragment → wrap in App.
  if (/^<[\s\S]+>$/.test(source) && !/^\s*(?:function|const|class|let|var)\b/.test(source)) {
    source = `function App() {\n  return (\n${source}\n  );\n}`;
  }

  const hooksPreamble = `
var __reactHooks = React;
var useState = __reactHooks.useState;
var useEffect = __reactHooks.useEffect;
var useMemo = __reactHooks.useMemo;
var useCallback = __reactHooks.useCallback;
var useRef = __reactHooks.useRef;
var useReducer = __reactHooks.useReducer;
var useContext = __reactHooks.useContext;
var useLayoutEffect = __reactHooks.useLayoutEffect;
var useId = __reactHooks.useId;
var useDeferredValue = __reactHooks.useDeferredValue;
var useTransition = __reactHooks.useTransition;
var Fragment = __reactHooks.Fragment;
var StrictMode = __reactHooks.StrictMode;
`.trim();

  const hasMount =
    /ReactDOM\.(?:createRoot|render)\s*\(/.test(source) || /createRoot\s*\(/.test(source);

  if (!hasMount) {
    const named =
      /\b(?:function|const|class)\s+(App|Component|Main|Demo|Preview)\b/.exec(source)?.[1] ??
      [...source.matchAll(/\b(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)\b/g)]
        .map((m) => m[1])
        .at(-1);

    if (named) {
      source += `

const __root = ReactDOM.createRoot(document.getElementById('root'));
__root.render(
  React.createElement(PreviewErrorBoundary, null, React.createElement(${named}))
);
`;
    } else {
      source += `

const __root = ReactDOM.createRoot(document.getElementById('root'));
__root.render(React.createElement(() => (
  <pre style={{ padding: 16, whiteSpace: 'pre-wrap' }}>
    Define a component (e.g. function App) to preview.
  </pre>
)));
`;
    }
  }

  return `${hooksPreamble}\n\n${source}`;
}

function escapeForScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

function finalizeDocument(doc: string): string {
  return injectPreviewSecurity(doc);
}

/** Shared styles for React preview documents. */
const REACT_PREVIEW_STYLES = `
html, body, #root { margin: 0; min-height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  background: #ffffff;
  color: #111827;
}
* { box-sizing: border-box; }
#error-banner {
  display: none;
  margin: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #fff1f0;
  color: #a8071a;
  border: 1px solid #ffa39e;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  white-space: pre-wrap;
}
#status {
  display: none;
  position: fixed;
  right: 12px;
  top: 12px;
  z-index: 2147483646;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
`.trim();

/**
 * In-iframe runtime: Error Boundary class + console bridge + Babel execute loop.
 * Loaded once in the bootstrap document; user code is swapped via postMessage.
 */
const REACT_RUNTIME_SCRIPT = `
(function () {
  var CHANNEL = '${REACT_PREVIEW_CHANNEL}';
  var currentRoot = null;
  var currentRevision = 0;
  var readySent = false;

  function post(type, payload) {
    try {
      parent.postMessage(Object.assign({ channel: CHANNEL, type: type }, payload || {}), '*');
    } catch (e) {}
  }

  function serialize(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || value.message || String(value);
    try {
      return JSON.stringify(value, function (_k, v) {
        if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
        if (typeof v === 'symbol') return String(v);
        if (typeof v === 'undefined') return '[undefined]';
        return v;
      }, 2);
    } catch (e) {
      try { return String(value); } catch (e2) { return '[Unserializable]'; }
    }
  }

  function showBanner(text) {
    var el = document.getElementById('error-banner');
    if (!el) return;
    el.style.display = text ? 'block' : 'none';
    el.textContent = text || '';
  }

  function setStatus(text) {
    var el = document.getElementById('status');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
  }

  // Console bridge → host console panel
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      post('console', {
        level: level,
        args: args.map(serialize),
        revision: currentRevision,
      });
      original.apply(console, args);
    };
  });

  window.addEventListener('error', function (event) {
    var msg = (event && event.message) || 'Runtime error';
    var stack = event && event.error && event.error.stack;
    showBanner(stack || msg);
    post('runtime-error', { message: msg, stack: stack || '', revision: currentRevision });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    var stack = reason && reason.stack ? reason.stack : '';
    showBanner(stack || msg);
    post('runtime-error', { message: msg, stack: stack, revision: currentRevision });
  });

  // Class Error Boundary (available to prepared user source as PreviewErrorBoundary)
  window.PreviewErrorBoundary = (function () {
    function PreviewErrorBoundary(props) {
      React.Component.call(this, props);
      this.state = { error: null };
    }
    PreviewErrorBoundary.prototype = Object.create(React.Component.prototype);
    PreviewErrorBoundary.prototype.constructor = PreviewErrorBoundary;
    PreviewErrorBoundary.getDerivedStateFromError = function (error) {
      return { error: error };
    };
    PreviewErrorBoundary.prototype.componentDidCatch = function (error, info) {
      var message = error && error.message ? error.message : String(error);
      var stack = error && error.stack ? error.stack : '';
      var detail = info && info.componentStack ? info.componentStack : '';
      showBanner(stack || message);
      post('runtime-error', {
        message: message,
        stack: stack,
        detail: detail,
        revision: currentRevision,
      });
    };
    PreviewErrorBoundary.prototype.render = function () {
      if (this.state.error) {
        return React.createElement('div', {
          style: {
            padding: 16,
            color: '#a8071a',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12.5,
            whiteSpace: 'pre-wrap',
          },
        }, 'Render error — see overlay for details.');
      }
      return this.props.children;
    };
    return PreviewErrorBoundary;
  })();

  function unmountRoot() {
    if (currentRoot && typeof currentRoot.unmount === 'function') {
      try { currentRoot.unmount(); } catch (e) {}
    }
    currentRoot = null;
    var rootEl = document.getElementById('root');
    if (rootEl) rootEl.innerHTML = '';
  }

  function execute(code, typescript, revision) {
    currentRevision = revision || 0;
    showBanner('');
    setStatus('Compiling…');
    post('status', { message: 'compiling', revision: currentRevision });

    if (typeof Babel === 'undefined' || typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
      var missing = 'React preview runtime failed to load (CDN).';
      showBanner(missing);
      post('compile-error', { message: missing, revision: currentRevision });
      setStatus('');
      return;
    }

    var presets = typescript
      ? ['env', 'react', 'typescript']
      : ['env', 'react'];

    var transformed;
    try {
      transformed = Babel.transform(code, {
        presets: presets,
        filename: typescript ? 'Artifact.tsx' : 'Artifact.jsx',
        retainLines: true,
      }).code;
    } catch (err) {
      var cMsg = err && err.message ? err.message : String(err);
      showBanner(cMsg);
      post('compile-error', {
        message: cMsg,
        stack: err && err.stack ? err.stack : '',
        revision: currentRevision,
      });
      setStatus('');
      return;
    }

    unmountRoot();

    // Expose createRoot helper that tracks the active root for soft remounts.
    var originalCreateRoot = ReactDOM.createRoot.bind(ReactDOM);
    ReactDOM.createRoot = function (container, options) {
      var root = originalCreateRoot(container, options);
      currentRoot = root;
      return root;
    };

    try {
      // eslint-disable-next-line no-new-func
      var runner = new Function(
        'React',
        'ReactDOM',
        'PreviewErrorBoundary',
        transformed + '\\n//# sourceURL=vani-artifact-preview.' + (typescript ? 'tsx' : 'jsx')
      );
      runner(React, ReactDOM, window.PreviewErrorBoundary);
      showBanner('');
      setStatus('');
      post('render-ok', { revision: currentRevision });
    } catch (err) {
      var rMsg = err && err.message ? err.message : String(err);
      var rStack = err && err.stack ? err.stack : '';
      showBanner(rStack || rMsg);
      post('runtime-error', {
        message: rMsg,
        stack: rStack,
        revision: currentRevision,
      });
      setStatus('');
    } finally {
      ReactDOM.createRoot = originalCreateRoot;
    }
  }

  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || data.channel !== CHANNEL) return;
    if (data.type === 'execute' && typeof data.code === 'string') {
      execute(data.code, !!data.typescript, data.revision || 0);
    }
  });

  function notifyReady() {
    if (readySent) return;
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined' || typeof Babel === 'undefined') {
      setTimeout(notifyReady, 40);
      return;
    }
    readySent = true;
    post('ready', {});
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    notifyReady();
  } else {
    document.addEventListener('DOMContentLoaded', notifyReady);
  }
  window.addEventListener('load', notifyReady);
})();
`.trim();

/** Stable bootstrap document — CDN engines load once; code swaps via postMessage. */
export function buildReactBootstrapDocument(): string {
  return finalizeDocument(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${REACT_PREVIEW_STYLES}</style>
  <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.development.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone@7.26.10/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body>
  <div id="status"></div>
  <div id="error-banner"></div>
  <div id="root"></div>
  <script>${REACT_RUNTIME_SCRIPT}<\/script>
</body>
</html>`);
}

/**
 * Self-contained React document (open-in-new-tab / static srcDoc fallback).
 * Includes the same CDN stack, Tailwind, error banner, and auto-execute.
 */
export function wrapReactDocument(code: string, typescript: boolean): string {
  const source = escapeForScript(prepareReactSource(code));
  const presets = typescript ? 'env,react,typescript' : 'env,react';
  return finalizeDocument(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${REACT_PREVIEW_STYLES}</style>
  <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.development.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone@7.26.10/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body>
  <div id="error-banner"></div>
  <div id="root"></div>
  <script>
    window.PreviewErrorBoundary = (function () {
      function PreviewErrorBoundary(props) {
        React.Component.call(this, props);
        this.state = { error: null };
      }
      PreviewErrorBoundary.prototype = Object.create(React.Component.prototype);
      PreviewErrorBoundary.prototype.constructor = PreviewErrorBoundary;
      PreviewErrorBoundary.getDerivedStateFromError = function (error) {
        return { error: error };
      };
      PreviewErrorBoundary.prototype.componentDidCatch = function (error) {
        var el = document.getElementById('error-banner');
        if (el) {
          el.style.display = 'block';
          el.textContent = (error && error.stack) ? error.stack : String(error);
        }
      };
      PreviewErrorBoundary.prototype.render = function () {
        if (this.state.error) {
          return React.createElement('div', { style: { padding: 16, color: '#a8071a' } },
            String(this.state.error && this.state.error.message || this.state.error));
        }
        return this.props.children;
      };
      return PreviewErrorBoundary;
    })();
    window.onerror = function (message, _s, _l, _c, error) {
      var el = document.getElementById('error-banner');
      if (!el) return;
      el.style.display = 'block';
      el.textContent = (error && error.stack) ? error.stack : String(message);
    };
  <\/script>
  <script type="text/babel" data-presets="${presets}">
${source}
  <\/script>
</body>
</html>`);
}
