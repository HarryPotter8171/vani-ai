import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

const allowDevAuth =
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH === 'true';

/**
 * Shared NextAuth options — Google OAuth in all environments.
 * Optional credentials login only when ALLOW_DEV_AUTH=true (non-production).
 *
 * JWT identity fields are replaced atomically on every sign-in so a previous
 * account's name/avatar cannot leak into the next session.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    ...(allowDevAuth
      ? [
          CredentialsProvider({
            id: 'dev-login',
            name: 'Development',
            credentials: {
              email: { label: 'Email', type: 'email' },
              secret: { label: 'Dev secret', type: 'password' },
            },
            async authorize(credentials) {
              const email = String(credentials?.email || '')
                .toLowerCase()
                .trim();
              const secret = String(credentials?.secret || '');
              const expectedEmail = String(process.env.AUTH_DEV_EMAIL || '')
                .toLowerCase()
                .trim();
              const expectedSecret = String(process.env.AUTH_DEV_SECRET || '');
              if (
                !email ||
                !expectedEmail ||
                !expectedSecret ||
                email !== expectedEmail ||
                secret !== expectedSecret
              ) {
                return null;
              }
              const devName = String(process.env.AUTH_DEV_NAME || '').trim();
              return {
                id: email,
                email,
                name: devName || email.split('@')[0] || email,
                image: null,
              };
            },
          }),
        ]
      : []),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Fresh sign-in: replace identity completely — never fall back to prior token.
      if (user) {
        token.email = user.email ?? null;
        token.name = user.name ?? null;
        token.picture = user.image ?? null;
        if (user.id) token.sub = String(user.id);
      }

      // Google profile is authoritative when present on this sign-in.
      if (profile && typeof profile === 'object') {
        const p = profile as {
          email?: string;
          name?: string;
          picture?: string;
        };
        if (p.email) token.email = p.email;
        if (p.name) token.name = p.name;
        // Explicitly assign picture (including clearing when absent on this profile).
        token.picture = p.picture ?? (user ? (user.image ?? null) : token.picture);
      }

      if (account?.provider) {
        token.provider = account.provider;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub || '');
        // Always overwrite from token so cleared fields stay cleared.
        session.user.email = token.email ? String(token.email) : null;
        session.user.name = token.name ? String(token.name) : null;
        session.user.image = token.picture ? String(token.picture) : null;
        if (token.provider) {
          session.user.provider = String(token.provider);
        } else {
          delete session.user.provider;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
};

export function isDevAuthEnabled() {
  return allowDevAuth;
}
