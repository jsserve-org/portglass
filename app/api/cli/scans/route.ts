import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scanRuns } from '@/lib/schema';
import { requireCliIdentity } from '@/lib/cli-auth';
import { createScanRun, type ScanInput } from '@/lib/scan-launch';

export async function POST(request: Request) {
  const identity = await requireCliIdentity(request);
  if (identity instanceof Response) return identity;
  let body: ScanInput;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const result = await createScanRun({
    ...body,
    cliDeviceId: identity.deviceId,
    requestedBy: identity.userId,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ runId: result.runId, status: result.state }, { status: 202 });
}

export async function GET(request: Request) {
  const identity = await requireCliIdentity(request);
  if (identity instanceof Response) return identity;
  const rows = await db.select().from(scanRuns)
    .where(and(eq(scanRuns.requestedBy, identity.userId)))
    .orderBy(desc(scanRuns.startedAt)).limit(50);
  return Response.json(rows.map((run) => ({
    id: run.id,
    cidr: run.cidr,
    ports: run.ports,
    label: run.label,
    status: run.finishedAt ? 'completed' : run.queued ? 'queued' : 'active',
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    attemptedTargets: run.attemptedTargets,
    totalTargets: run.totalTargets,
    openCount: run.openCount,
  })));
}
