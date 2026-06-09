import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanRuns, portFindings } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, desc } from 'drizzle-orm';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { id } = await params;
  const runId = parseInt(id, 10);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid scan ID' }, { status: 400 });
  }

  const run = await db.select().from(scanRuns).where(eq(scanRuns.id, runId)).limit(1);
  if (!run.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const findings = await db
    .select()
    .from(portFindings)
    .where(eq(portFindings.runId, runId))
    .orderBy(desc(portFindings.observedAt))
    .limit(500);

  const hostCount = new Set(findings.map((f) => f.ip)).size;
  const serviceMap: Record<string, number> = {};
  for (const f of findings) {
    const key = f.service || f.banner?.split(' ')[0] || `Port ${f.port}`;
    serviceMap[key] = (serviceMap[key] || 0) + 1;
  }
  const topServices = Object.entries(serviceMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return NextResponse.json({
    run: run[0],
    findings,
    stats: {
      totalFindings: findings.length,
      hosts: hostCount,
      topServices,
    },
  });
}
