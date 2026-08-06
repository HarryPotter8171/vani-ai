'use client';

import { useSession } from 'next-auth/react';
import {
  resolveAuthUser,
  type AuthUserIdentity,
} from '@/lib/auth/user';

/**
 * Authenticated user for UI — always from the NextAuth session (single SoT).
 * Do not read Mongo `/auth/me`, JWT claims, or any local identity cache.
 */
export function useAuthUser(): AuthUserIdentity & {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  /** Stable key for remounting user-scoped UI when the account changes. */
  userKey: string | null;
} {
  const { data: session, status } = useSession();

  if (status !== 'authenticated' || !session?.user) {
    return {
      id: null,
      email: null,
      name: null,
      image: null,
      firstName: null,
      initials: '',
      status,
      userKey: null,
    };
  }

  const identity = resolveAuthUser({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  const userKey =
    identity.email || identity.id || null;

  return { ...identity, status, userKey };
}
