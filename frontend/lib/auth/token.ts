import { SignJWT } from 'jose';

const encoder = new TextEncoder();

function getAuthSecretKey() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) {
    throw new Error('AUTH_JWT_SECRET or NEXTAUTH_SECRET must be set');
  }
  return encoder.encode(secret);
}

/**
 * Mint a short-lived backend access JWT from a verified NextAuth session.
 * Backend verifies this with the same secret — never trusts client email fields.
 */
export async function mintBackendAccessToken(input: {
  email: string;
  name?: string | null;
  sub?: string | null;
  provider?: string | null;
}) {
  const email = String(input.email || '')
    .toLowerCase()
    .trim();
  if (!email) {
    throw new Error('email is required');
  }

  const expiresIn = '1h';
  const token = await new SignJWT({
    email,
    name: input.name || '',
    provider:
      input.provider === 'email' || input.provider === 'dev-login'
        ? 'email'
        : 'google',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(input.sub || email))
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getAuthSecretKey());

  return {
    token,
    expiresIn: 3600,
    expiresAt: Date.now() + 3600 * 1000,
  };
}
