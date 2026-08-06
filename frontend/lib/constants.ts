/**
 * Public API base URL for browser → Express.
 *
 * In development the browser always talks to Express on the *same host* the
 * page was opened on, port 5001 (or `NEXT_PUBLIC_API_PORT` when set, e.g. E2E):
 *   http://localhost:3000     → http://localhost:5001/api
 *   http://192.168.x.x:3000   → http://192.168.x.x:5001/api
 *
 * This avoids baking a stale LAN IP (or localhost) into the Next bundle via
 * NEXT_PUBLIC_API_BASE_URL — phones never hit the Mac when the URL says localhost.
 */

function resolveApiPort(): number {
  const raw = process.env.NEXT_PUBLIC_API_PORT?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return 5001;
}

const API_PORT = resolveApiPort();

function isLocalOrLanHost(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return true;
  }
  // RFC1918 — phone / Wi‑Fi testing
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

function browserApiBaseUrl(hostname: string): string {
  // Dev / LAN: always same host as the page, Express on API_PORT
  if (isLocalOrLanHost(hostname)) {
    return `http://${hostname}:${API_PORT}/api`;
  }
  // Production hostname: optional override, else same-origin /api
  const prod = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (prod) return prod.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  return `/api`;
}

/**
 * Resolve API base at call time from the page hostname (safe on phone / LAN).
 * Do not use NEXT_PUBLIC_API_URL in development — hostname wins.
 */
export function getApiBaseUrl(): string {
  let resolved: string;

  if (typeof window !== 'undefined') {
    resolved = browserApiBaseUrl(window.location.hostname);
  } else {
    // SSR / Node → Express on the same machine (not a browser URL).
    const internal = process.env.API_INTERNAL_BASE_URL?.trim();
    if (internal) {
      resolved = internal.replace(/\/$/, '');
    } else {
      const prod = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
      resolved = prod
        ? prod.replace(/\/$/, '')
        : `http://127.0.0.1:${API_PORT}/api`;
    }
  }

  if (typeof window !== 'undefined') {
    const g = window as Window & { __vaniApiBaseLogged?: string };
    if (g.__vaniApiBaseLogged !== resolved) {
      g.__vaniApiBaseLogged = resolved;
      console.info('[api] getApiBaseUrl()', {
        resolved,
        pageHost: window.location.hostname,
      });
    }
  }

  return resolved;
}

export type SuggestionCard = {
  title: string;
  prompt: string;
  description?: string;
  /** Lucide icon key resolved in EmptyState */
  icon?:
    | 'image'
    | 'research'
    | 'code'
    | 'canvas'
    | 'pdf'
    | 'video'
    | 'voice'
    | 'analyze';
};

export const SUGGESTION_CARDS: SuggestionCard[] = [
  {
    title: 'Create Image',
    description: 'Generate visuals from a prompt',
    icon: 'image',
    prompt: 'Create a beautiful image of a serene mountain landscape at sunrise',
  },
  {
    title: 'Research',
    description: 'Deep dive with sources',
    icon: 'research',
    prompt: 'Research the latest developments in artificial intelligence',
  },
  {
    title: 'Code',
    description: 'Write and debug software',
    icon: 'code',
    prompt: 'Write a clean, well-structured React component with TypeScript',
  },
  {
    title: 'Canvas',
    description: 'Open a creative workspace',
    icon: 'canvas',
    prompt: 'Open a canvas and help me draft a product one-pager',
  },
  {
    title: 'Analyze PDF',
    description: 'Extract insights from docs',
    icon: 'pdf',
    prompt: 'Summarize the key points from a PDF I’ll upload',
  },
  {
    title: 'Voice',
    description: 'Talk with VANI live',
    icon: 'voice',
    prompt: 'Start a voice conversation — I want to brainstorm out loud',
  },
];

/** @deprecated Prefer SUGGESTION_CARDS */
export const SUGGESTION_CHIPS = SUGGESTION_CARDS.map((c) => c.title);
