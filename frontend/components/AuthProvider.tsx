"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Thin NextAuth SessionProvider — the only auth context in the app.
 * UI identity reads exclusively via useSession / useAuthUser.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus
      refetchWhenOffline={false}
      // Avoid an unbounded session spin on flaky mobile networks.
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}
