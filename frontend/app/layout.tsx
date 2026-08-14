import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import AuthProvider from '@/components/AuthProvider';
import AuthGate from '@/components/AuthGate';
import AuthErrorBoundary from '@/components/AuthErrorBoundary';
import { MonitoringInit } from '@/components/MonitoringInit';
import { AudioUnlockInit } from '@/components/AudioUnlockInit';
import { OfflineBanner } from '@/components/OfflineBanner';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'VANI AI',
  description: 'VANI — AI Operating System',
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0f' },
    { media: '(prefers-color-scheme: light)', color: '#f2f0eb' },
  ],
};

/** Prevents theme flash — dark is the default. Also restores appearance prefs. */
const themeInitScript = `(function(){try{var t=localStorage.getItem('vani-theme');var d=t==='light'?false:t==='dark'?true:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);r.style.colorScheme=d?'dark':'light';var a=JSON.parse(localStorage.getItem('vani-appearance')||'{}');if(a.radius)r.dataset.radius=a.radius;if(a.motion)r.dataset.motion=a.motion;if(a.density)r.dataset.density=a.density;if(a.glass)r.dataset.glass=a.glass;if(a.wallpaper)r.dataset.wallpaper=a.wallpaper;}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${inter.variable} box-border flex h-dvh flex-col overflow-hidden font-sans antialiased pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-background focus:shadow-2"
        >
          Skip to main content
        </a>
        <MonitoringInit />
        <AudioUnlockInit />
        <div className="flex min-h-0 flex-1 flex-col">
          <AuthProvider>
            <ThemeProvider>
              <ToastProvider>
                <OfflineBanner />
                <ConfirmDialogProvider>
                  <AuthErrorBoundary>
                    <AuthGate>{children}</AuthGate>
                  </AuthErrorBoundary>
                </ConfirmDialogProvider>
              </ToastProvider>
            </ThemeProvider>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
