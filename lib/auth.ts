import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from './db';
import { user, session, account, verification } from './schema';

const authentikConfigured =
  !!process.env.AUTHENTIK_ISSUER_BASE_URL &&
  !!process.env.AUTHENTIK_CLIENT_ID &&
  !!process.env.AUTHENTIK_CLIENT_SECRET;

const authPlugins = [];
if (authentikConfigured) {
  authPlugins.push(
    genericOAuth({
      config: [
        {
          providerId: 'authentik',
          clientId: process.env.AUTHENTIK_CLIENT_ID!,
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
          discoveryUrl: `${process.env.AUTHENTIK_ISSUER_BASE_URL}/.well-known/openid-configuration`,
          scopes: ['openid', 'profile', 'email'],
        },
      ],
    }),
  );
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  baseURL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 51111}`,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  trustedOrigins: [process.env.BASE_URL || `http://localhost:${process.env.PORT || 51111}`],
  session: {
    // Cache the session in a signed cookie for 5 minutes so getSession stops
    // hitting the session table on every request (every API route + every WS
    // tick used to cost a DB roundtrip). Sensitive flows still see revocations
    // within the TTL window.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  plugins: [...authPlugins, nextCookies()],
});

export const authEnabled = authentikConfigured;

export async function getSessionFromRequest(request: Request) {
  try {
    return await auth.api.getSession({ headers: request.headers });
  } catch {
    return null;
  }
}
