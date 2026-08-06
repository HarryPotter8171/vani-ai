/**
 * Lightweight sanitization for HTML artifacts rendered in a sandboxed iframe.
 *
 * The iframe sandbox (no allow-same-origin / popups / top-navigation) is the
 * primary security boundary. This pass removes vectors that can still escape
 * or hijack the preview frame even under that sandbox.
 */

const META_REFRESH_RE =
  /<meta\b[^>]*\bhttp-equiv\s*=\s*(?:"refresh"|'refresh'|refresh)[^>]*>/gi;

const BASE_TAG_RE = /<base\b[^>]*>/gi;

const OBJECT_EMBED_RE = /<\/?(?:object|embed|applet)\b[^>]*>/gi;

/** Strip tags / attributes that undermine iframe isolation. */
export function sanitizeHtmlForPreview(html: string): string {
  return html
    .replace(META_REFRESH_RE, '<!-- meta refresh removed -->')
    .replace(BASE_TAG_RE, '<!-- base removed -->')
    .replace(OBJECT_EMBED_RE, '<!-- plugin tag removed -->');
}

/**
 * Injected into every preview document head. Complements the iframe sandbox:
 * blocks plugin objects, freezes base URI, and neutralizes popup / top-target
 * navigation attempts from inside the document.
 */
export const PREVIEW_SECURITY_HEAD = `
<meta http-equiv="Content-Security-Policy" content="base-uri 'none'; object-src 'none'; frame-ancestors 'none'" />
<script>
(function () {
  try { window.open = function () { return null; }; } catch (e) {}
  document.addEventListener('click', function (event) {
    var el = event.target;
    while (el && el.nodeType === 1 && el.tagName !== 'A') el = el.parentElement;
    if (!el || el.tagName !== 'A') return;
    var target = (el.getAttribute('target') || '').toLowerCase();
    if (target === '_blank' || target === '_top' || target === '_parent') {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
})();
<\/script>
`.trim();

/** Insert security head markup after `<head>` (or synthesize a head). */
export function injectPreviewSecurity(doc: string): string {
  if (/<head\b[^>]*>/i.test(doc)) {
    return doc.replace(/<head\b[^>]*>/i, (match) => `${match}\n${PREVIEW_SECURITY_HEAD}`);
  }
  if (/<html\b[^>]*>/i.test(doc)) {
    return doc.replace(
      /<html\b[^>]*>/i,
      (match) => `${match}\n<head>\n${PREVIEW_SECURITY_HEAD}\n</head>`
    );
  }
  return `<!DOCTYPE html><html><head>${PREVIEW_SECURITY_HEAD}</head><body>${doc}</body></html>`;
}
