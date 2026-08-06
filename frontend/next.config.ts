import os from 'node:os';

/** Current LAN IPv4s so phones can load /_next/* without editing this file. */
function lanDevOrigins(): string[] {
  const hosts = new Set<string>(['127.0.0.1', 'localhost']);
  try {
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const net of nets || []) {
        const family = String(net.family);
        if (family !== 'IPv4' && family !== '4') continue;
        if (net.internal) continue;
        hosts.add(net.address);
      }
    }
  } catch {
    /* sandbox / restricted env — localhost still works */
  }
  return [...hosts];
}

/**
 * App-origin CSP compatible with Next + NextAuth + API streaming.
 * Complements XSS sanitization (RC1-B07 / RC2.5). Keep connect-src open to
 * https/wss so staged API hosts and Sentry work without per-env rebuilds.
 */
function contentSecurityPolicy(): string {
  const apiOrigin = (() => {
    try {
      const v = process.env.NEXT_PUBLIC_API_BASE_URL;
      if (!v) return '';
      return new URL(v).origin;
    } catch {
      return '';
    }
  })();
  const connectExtra = apiOrigin ? ` ${apiOrigin}` : '';
  // Next.js / React Refresh need 'unsafe-eval' in development only.
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*${connectExtra}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
  ].join('; ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained build output (server + only the node_modules it actually
  // needs) — required for the production Docker image (see Dockerfile).
  // No effect on `next dev`.
  output: 'standalone',
  // Allow phone / LAN access to Next.js dev resources (/_next/*).
  // Without this, Next 16 blocks cross-origin requests from the LAN IP and
  // the client never hydrates — AuthGate stays on "Loading…" forever.
  allowedDevOrigins: lanDevOrigins(),
  // Pin the workspace root to this directory — the repo also has a root-level
  // package-lock.json (for the Playwright E2E harness) which Next would
  // otherwise misdetect as the project root.
  turbopack: {
    root: process.cwd(),
  },
  // Lets the Playwright E2E suite run its own `next dev` instance in this
  // same directory alongside a developer's normal dev server, without
  // colliding on Next's per-project `.next/dev` singleton lock. Unset in
  // normal dev/build — see playwright.config.ts.
  ...(process.env.VANI_E2E_DIST_DIR
    ? { distDir: process.env.VANI_E2E_DIST_DIR }
    : {}),
  // Tree-shake heavy icon / motion entry points in the client bundle.
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy(),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
