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
    return candidate.replace(/\/$/, '');
  }

  // Replace with your actual Vercel deployment URL before building the APK.
  return 'https://YOUR-APP.vercel.app';
}

const config: CapacitorConfig = {
  appId: 'com.vaniai.app',
  appName: 'VANI AI',
  webDir: 'out', // fallback if server.url is unreachable
  server: {
    url: resolveLiveServerUrl(),
    cleartext: true,
    allowNavigation: ['accounts.google.com', '*.google.com'],
  },
};

export default config;
