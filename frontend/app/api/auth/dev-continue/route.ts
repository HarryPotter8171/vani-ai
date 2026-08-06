import { getServerSession } from 'next-auth';
import { encode } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { authOptions, isDevAuthEnabled } from '@/lib/auth/config';

/**
 * POST /api/auth/dev-continue
 * Development only: create a NextAuth session for AUTH_DEV_EMAIL so local
 * login works without Google, without silently reminting after logout.
 */
export async function POST() {
  if (!isDevAuthEnabled()) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    return NextResponse.json({ ok: true, alreadySignedIn: true });
  }

  const email = String(process.env.AUTH_DEV_EMAIL || '')
    .toLowerCase()
    .trim();
  if (!email) {
    return NextResponse.json(
      { error: 'AUTH_DEV_EMAIL is not configured' },
      { status: 500 }
    );
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'NEXTAUTH_SECRET is not configured' },
      { status: 500 }
    );
  }

  const name =
    String(process.env.AUTH_DEV_NAME || '').trim() ||
    email.split('@')[0] ||
    email;

  const maxAge = 30 * 24 * 60 * 60; // match NextAuth default session maxAge
  const token = await encode({
    token: {
      email,
      name,
      sub: email,
      provider: 'dev-login',
      // Explicit null so a prior Google avatar cannot linger in a reused JWT shape.
      picture: null,
    },
    secret,
    maxAge,
  });

  const secure =
    process.env.NEXTAUTH_URL?.startsWith('https://') ||
    process.env.NODE_ENV === 'production';
  const cookieName = secure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge,
  });
  return response;
}
