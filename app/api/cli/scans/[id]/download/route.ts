import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { requireCliIdentity } from '@/lib/cli-auth';

const csvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requireCliIdentity(request);
  if (identity instanceof Response) return identity;
  const runId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(runId)) return Response.json({ error: 'Invalid scan ID' }, { status: 400 });
  const [run] = await db.select().from(scanRuns)
    .where(and(eq(scanRuns.id, runId), eq(scanRuns.requestedBy, identity.userId))).limit(1);
  if (!run) return Response.json({ error: 'Scan not found' }, { status: 404 });
  const findings = await db.select().from(portFindings)
    .where(eq(portFindings.runId, runId)).orderBy(asc(portFindings.ip), asc(portFindings.port));

  const format = new URL(request.url).searchParams.get('format') === 'json' ? 'json' : 'csv';
  if (format === 'json') {
    return new Response(JSON.stringify({ run, findings }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="portglass-scan-${runId}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const columns = ['ip', 'port', 'state', 'service', 'product', 'latency_ms', 'banner', 'observed_at'];
  const lines = [columns.join(',')];
  for (const finding of findings) {
    lines.push([
      finding.ip, finding.port, finding.state, finding.service, finding.product,
      finding.latencyMs, finding.banner, finding.observedAt.toISOString(),
    ].map(csvCell).join(','));
  }
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="portglass-scan-${runId}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
