/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained build output (server + only the node_modules it actually
  // needs) — required for the production Docker image (see Dockerfile).
  // No effect on `next dev`.
  output: "standalone",
  devIndicators: {
    buildActivity: false,
  },
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
  ...(process.env.VANI_E2E_DIST_DIR ? { distDir: process.env.VANI_E2E_DIST_DIR } : {}),
  // Tree-shake heavy icon / motion entry points in the client bundle.
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
};

export default nextConfig;
