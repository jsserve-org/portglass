import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://scanner:scanner@localhost:5432/scanner';

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  if (!dbInstance) {
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

export const db = getDb();
