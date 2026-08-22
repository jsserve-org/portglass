import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://scanner:scanner@localhost:5432/scanner';

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!pool) {
    // Explicit bounds: the default max (10) could be fully occupied by long
    // analytical queries, queuing interactive/auth traffic behind them with no
    // timeout feedback. connectionTimeoutMillis surfaces "pool exhausted" as a
    // fast error instead of a hang.
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 12,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  if (!dbInstance) {
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

export const db = getDb();
