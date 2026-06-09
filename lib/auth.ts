import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from './db';

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
  database: drizzleAdapter(db, { provider: 'pg' }),
  baseURL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 51111}`,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  trustedOrigins: [process.env.BASE_URL || `http://localhost:${process.env.PORT || 51111}`],
  plugins: [...authPlugins, nextCookies()],
});

export const authEnabled = authentikConfigured;
