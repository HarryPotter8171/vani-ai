/**
 * Allowlist URL schemes for user-/model-controlled hrefs (markdown, citations).
 * Rejects javascript:, data:, vbscript:, and other non-navigational schemes.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Return a safe href or `undefined` when the URL must not be rendered as a link.
 */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  // Protocol-relative URLs are treated as https for scheme checks via URL parser.
  let parsed: URL;
  try {
    // Relative paths (/, ./, #, ?) are safe same-origin navigations.
    if (
      trimmed.startsWith('/') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('?') ||
      trimmed.startsWith('./') ||
      trimmed.startsWith('../')
    ) {
      return trimmed;
    }
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
    return undefined;
  }

  return trimmed;
}

/**
 * react-markdown `urlTransform` — strip dangerous schemes; pass through allowlisted URLs.
 */
export function markdownUrlTransform(url: string): string {
  return safeHref(url) ?? '';
}
