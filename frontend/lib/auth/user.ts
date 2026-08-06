/**
 * Authenticated user identity helpers.
 * Single source of truth: NextAuth session (Google profile / verified session).
 * Never invent default names or emails.
 */

export type SessionUserLike = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
} | null;

export type AuthUserIdentity = {
  id: string | null;
  email: string | null;
  /** Full display name from the authenticated profile. */
  name: string | null;
  image: string | null;
  /** First token of the profile name, for greetings. */
  firstName: string | null;
  /** Avatar initials derived from name, else email local-part. */
  initials: string;
};

export function getInitials(
  name?: string | null,
  email?: string | null
): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const local = String(email || '')
    .split('@')[0]
    .trim();
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  if (local.length === 1) return local.toUpperCase();
  return '';
}

/** Normalize a NextAuth `session.user` into a consistent identity shape. */
export function resolveAuthUser(user?: SessionUserLike): AuthUserIdentity {
  const email = user?.email?.trim() || null;
  const name = user?.name?.trim() || null;
  const image = user?.image?.trim() || null;
  const id = user?.id?.trim() || null;
  const firstName = name?.split(/\s+/).filter(Boolean)[0] || null;

  return {
    id,
    email,
    name,
    image,
    firstName,
    initials: getInitials(name, email),
  };
}
