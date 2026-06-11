import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Schema lives in lib/schema.ts (scanner tables + the better-auth tables).
// `npm run db:generate` writes SQL migrations to ./drizzle; they are applied
// automatically at server startup (see server.js) using drizzle-orm's
// migrator, so deploys are self-migrating and no manual DDL is ever needed.
export default defineConfig({
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://scanner:scanner@localhost:5432/scanner',
  },
});
