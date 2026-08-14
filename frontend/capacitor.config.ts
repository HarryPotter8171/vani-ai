import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Live Wrapper: load the deployed Vercel app in the WebView (NextAuth + API routes stay on Vercel).
 * Set CAPACITOR_SERVER_URL or NEXT_PUBLIC_APP_URL to your production https://….vercel.app URL.
 */
function resolveLiveServerUrl(): string {
  const candidate =
    process.env.CAPACITOR_SERVER_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    '';

  if (candidate && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(candidate)) {
    const base = candidate.replace(/\/$/, '');
    return `${base}${base.includes('?') ? '&' : '?'}v=3`;
  }

  return 'https://vani-ai-ten.vercel.app/?v=3';
}

const config: CapacitorConfig = {
  appId: 'com.vaniai.app',
  appName: 'VANI AI',
  webDir: 'out', // fallback if server.url is unreachable
  server: {
    url: 'https://vani-ai-ten.vercel.app/?v=3',
    cleartext: true,
    allowNavigation: ['accounts.google.com', '*.google.com'],
  },
};

export default config;
