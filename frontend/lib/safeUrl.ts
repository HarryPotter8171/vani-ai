/**
 * Allowlist URL schemes for user-/model-controlled hrefs (markdown, citations).
 * Rejects javascript:, data:, vbscript:, and other non-navigational schemes.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Parse an absolute URL safely. Returns null for undefined, empty, relative,
 * or otherwise invalid values — never throws (Vercel prerender / missing env).
 */
export function safeUrl(value?: string | null): URL | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

/**
 * Return a safe href or `undefined` when the URL must not be rendered as a link.
 */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

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

  const parsed = safeUrl(trimmed);
  if (!parsed) return undefined;

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
