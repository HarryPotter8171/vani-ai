/**
 * Strict sanitization for canvas richtext rendered on the app origin
 * (not sandboxed iframe). Complements CSP — never render raw HTML.
 */

import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'colspan', 'rowspan'];

/** Sanitize richtext HTML for host-DOM injection. */
export function sanitizeRichtextHtml(html: string): string {
  const input = typeof html === 'string' && html.trim() ? html : '<p></p>';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Force safe link behavior when target=_blank is present.
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover'],
  });
}

/** Hook after sanitize: ensure external anchors are noopener. */
export function sanitizeRichtextHtmlSafe(html: string): string {
  const cleaned = sanitizeRichtextHtml(html);
  // DOMPurify hook for rel on target=_blank — apply via config if available.
  return cleaned.replace(
    /<a\b([^>]*\btarget\s*=\s*(?:"_blank"|'_blank'|_blank)[^>]*)>/gi,
    (full, attrs: string) => {
      if (/\brel\s*=/i.test(attrs)) {
        return full.replace(
          /\brel\s*=\s*(["']?)[^"'\s>]*\1/i,
          'rel="noopener noreferrer"'
        );
      }
      return `<a${attrs} rel="noopener noreferrer">`;
    }
  );
}
