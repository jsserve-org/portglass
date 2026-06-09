import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { desc } from 'drizzle-orm';
import { headers } from 'next/headers';

export async function GET() {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db.select().from(scanRuns).orderBy(desc(scanRuns.startedAt)).limit(50);
  return Response.json(rows);
}
