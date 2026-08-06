import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import { mintBackendAccessToken } from '@/lib/auth/token';

/**
 * GET /api/auth/backend-token
 * Issues a backend access JWT for the current NextAuth session only.
 * Sessionless minting is disabled so logout remains logged out on refresh.
 * Local development without Google uses POST /api/auth/dev-continue first.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const provider = session.user.provider;
  const isDevSession = provider === 'dev-login' || provider === 'email';

  try {
    const minted = await mintBackendAccessToken({
      email,
      name: session.user.name,
      sub: session.user.id,
      provider: isDevSession ? 'email' : 'google',
    });
    return NextResponse.json(minted);
  } catch (err) {
    console.error('[backend-token]', err);
    return NextResponse.json(
      { error: 'Unable to issue access token' },
      { status: 500 }
    );
  }
}
