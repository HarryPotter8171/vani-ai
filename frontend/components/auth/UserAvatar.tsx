'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useAuthUser } from '@/hooks/useAuthUser';

type UserAvatarProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

const sizeClass = {
  sm: 'h-6 w-6 text-micro',
  md: 'h-8 w-8 text-micro',
  lg: 'h-12 w-12 text-sidebar',
  xl: 'h-14 w-14 text-assistant',
} as const;

/**
 * Avatar for the authenticated session user (Google image or initials).
 * Renders nothing when there is no authenticated identity — no placeholder user.
 */
export default function UserAvatar({ size = 'sm', className }: UserAvatarProps) {
  const { name, email, image, initials, status } = useAuthUser();

  if (status !== 'authenticated' || (!name && !email && !image)) {
    return null;
  }

  const label = name || email;
  if (!label) return null;

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={label}
        referrerPolicy="no-referrer"
        className={cn(
          'shrink-0 rounded-full object-cover',
          'ring-1 ring-white/20',
          sizeClass[size],
          className
        )}
 />
    );
  }

  if (!initials) return null;

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        'bg-gradient-to-tr from-accent to-[var(--accent-pressed)]',
        'font-semibold tracking-tight text-text-on-accent',
        'shadow-[0_2px_10px_var(--accent-glow)] ring-1 ring-white/15',
        sizeClass[size],
        className
      )}
      aria-label={label}
      title={label}
    >
      {initials}
    </div>
  );
}
