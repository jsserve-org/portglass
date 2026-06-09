import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, desc } from 'drizzle-orm';

export async function GET(_request: Request, { params }: { params: Promise<{ ip: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { ip } = await params;
  if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return NextResponse.json({ error: 'Invalid IP' }, { status: 400 });
  }

  const findings = await db
    .select()
    .from(portFindings)
    .where(eq(portFindings.ip, ip))
    .orderBy(desc(portFindings.observedAt))
    .limit(500);

  const runsMap = new Map<number, typeof scanRuns.$inferSelect>();
  const runIds = [...new Set(findings.map((f) => f.runId).filter(Boolean) as number[])];
  if (runIds.length) {
    const runs = await db.select().from(scanRuns).where(eq(scanRuns.id, runIds[0]));
    for (const r of runs) runsMap.set(r.id, r);
  }

  return NextResponse.json({
    ip,
    findings: findings.map((f) => ({
      ...f,
      run: f.runId ? runsMap.get(f.runId) || null : null,
    })),
  });
}
