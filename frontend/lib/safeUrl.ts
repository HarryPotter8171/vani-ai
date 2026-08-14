/**
 * Allowlist URL schemes for user-/model-controlled hrefs (markdown, citations).
 * Rejects javascript:, data:, vbscript:, and other non-navigational schemes.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** http(s) only — used for markdown <img> so data:/mailto: never become image srcs. */
const IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

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
 * Whether a markdown image `src` is safe to attempt loading.
 * Rejects data:/base64, javascript:, empty, and non-http(s) absolute URLs.
 * Allows same-origin relative paths that look like real asset/API URLs.
 */
export function isRenderableImageSrc(
  raw: string | null | undefined
): string | undefined {
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  // Hallucinated / truncated base64 blobs (with or without data: prefix).
  if (/^data:/i.test(trimmed) || /^[A-Za-z0-9+/]{80,}={0,2}$/.test(trimmed)) {
    return undefined;
  }

  // Same-origin relative asset / API paths only (not bare filenames like "foo.png").
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return trimmed;
  }

  const parsed = safeUrl(trimmed);
  if (!parsed) return undefined;
  if (!IMAGE_PROTOCOLS.has(parsed.protocol.toLowerCase())) return undefined;

  return trimmed;
}

/**
 * Strip hallucinated markdown images and embedded base64 image payloads from
 * assistant markdown so they never dump gibberish into the chat UI.
 * Valid http(s)/relative markdown images are kept for the renderer (which
 * shows an "Image unavailable" fallback if they fail to load).
 */
export function stripHallucinatedImageMarkdown(content: string): string {
  if (!content) return content;

  let out = content
    .replace(/!\[([^\]]*)]\(\s*([^)]*?)\s*\)/g, (_match, alt, src) => {
      const safe = isRenderableImageSrc(String(src || '').trim());
      if (!safe) return '';
      return `![${alt}](${safe})`;
    })
    // data:image/...;base64,... — single-token base64 only (avoid eating following prose)
    .replace(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi, '')
    // Long standalone base64-looking runs (common model dump after a fake caption).
    .replace(/(?:^|\n)\s*[A-Za-z0-9+/]{120,}={0,2}\s*(?=\n|$)/g, '\n');

  // Collapse leftover blank lines from removals.
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/**
 * react-markdown `urlTransform` — strip dangerous schemes; pass through allowlisted URLs.
 */
export function markdownUrlTransform(url: string): string {
  return safeHref(url) ?? '';
}
