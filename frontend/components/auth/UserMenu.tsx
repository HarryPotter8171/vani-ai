'use client';

import React, { useRef, useState } from 'react';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { getSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { logoutFromBackend, clearClientAuthState } from '@/lib/auth/logout';
import UserAvatar from '@/components/auth/UserAvatar';

export interface UserMenuProps {
  /** Visual density for the trigger. */
  variant?: 'header' | 'sidebar';
  className?: string;
}

/**
 * Account menu for the authenticated session — avatar trigger + Sign out.
 * Clears backend JWT and NextAuth together; AuthGate reacts to session status
 * so chrome updates immediately without a manual refresh.
 */
export default function UserMenu({ variant = 'header', className }: UserMenuProps) {
  const { name, email, status } = useAuthUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setOpen(false), open);

  // Only render for a real authenticated session with identity.
  if (status !== 'authenticated' || (!name && !email)) {
    return null;
  }

  const label = name || email || '';

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);
    try {
      // 1) Revoke backend JWT + wipe client caches (also signals AuthGate).
      await logoutFromBackend();
      // 2) End NextAuth session — SessionProvider updates → AuthGate unmounts chrome.
      await signOut({ redirect: false });
    } catch {
      /* still wipe client state */
    } finally {
      clearClientAuthState();
    }

    // Last resort: if the NextAuth cookie somehow survived, hard-navigate.
    try {
      const still = await getSession();
      if (still?.user?.email) {
        window.location.replace('/');
      }
    } catch {
      window.location.replace('/');
    }
  };

  if (variant === 'sidebar') {
    return (
      <div ref={containerRef} className={cn('relative', className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex w-full items-center justify-between rounded-[16px] p-2.5 text-left',
            'transition-all duration-normal ease-apple',
            'hover:bg-surface-hover',
            open && 'bg-surface-hover'
          )}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar size="md" />
            <div className="min-w-0 overflow-hidden">
              <div className="truncate text-sm font-medium tracking-[-0.014em] text-foreground">
                {label}
              </div>
              {email ? (
                <div className="truncate text-micro text-text-tertiary">{email}</div>
              ) : null}
            </div>
          </div>
          <MoreHorizontal size={14} className="shrink-0 text-text-tertiary" />
        </button>

        {open && (
          <div
            role="menu"
            className={cn(
              // Open downward so the menu clears the Personal section trigger above
              // (upward menus were intercept-blocked by sidebar-section-trigger).
              'absolute top-[calc(100%+8px)] left-0 right-0 z-50 overflow-hidden rounded-[16px] py-1',
              'menu-surface shadow-3 animate-fade-up'
            )}
          >
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left',
                'text-sm font-medium tracking-[-0.014em] text-foreground',
                'transition-colors duration-fast ease-apple',
                'hover:bg-surface-hover disabled:opacity-50'
              )}
            >
              <LogOut size={13} strokeWidth={1.75} />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'hover-lift inline-flex h-7 w-7 items-center justify-center rounded-full',
          'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'hover:bg-foreground/[0.045] dark:hover:bg-white/[0.06]',
          open && 'bg-foreground/[0.045] dark:bg-white/[0.06]'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <UserAvatar size="sm" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-9 z-30 w-[220px] overflow-hidden rounded-[14px]',
            'menu-surface overflow-hidden rounded-[14px] shadow-token-lg',
            'animate-fade-up'
          )}
        >
          <div className="border-b border-black/[0.05] px-3.5 py-3 dark:border-white/[0.06]">
            <div className="truncate text-sm font-medium tracking-[-0.014em] text-foreground">
              {label}
            </div>
            {email ? (
              <div className="mt-0.5 truncate text-micro text-muted-foreground">{email}</div>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-foreground/85 hover:bg-black/[0.04] disabled:opacity-50 dark:hover:bg-white/[0.06]"
          >
            <LogOut size={13} strokeWidth={1.75} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
