import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { requireCliIdentity } from '@/lib/cli-auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requireCliIdentity(request);
  if (identity instanceof Response) return identity;
  const runId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(runId)) return Response.json({ error: 'Invalid scan ID' }, { status: 400 });
  const [run] = await db.select().from(scanRuns)
    .where(and(eq(scanRuns.id, runId), eq(scanRuns.requestedBy, identity.userId))).limit(1);
  if (!run) return Response.json({ error: 'Scan not found' }, { status: 404 });
  const [summary] = await db.select({ findings: count() }).from(portFindings).where(eq(portFindings.runId, runId));
  return Response.json({
    ...run,
    status: run.finishedAt ? 'completed' : run.queued ? 'queued' : 'active',
    findingsCount: Number(summary?.findings ?? 0),
  });
}
