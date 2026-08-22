import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { requireCliIdentity } from '@/lib/cli-auth';

const csvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const BATCH = 1000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requireCliIdentity(request);
  if (identity instanceof Response) return identity;
  const runId = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(runId)) return Response.json({ error: 'Invalid scan ID' }, { status: 400 });
  const [run] = await db.select().from(scanRuns)
    .where(and(eq(scanRuns.id, runId), eq(scanRuns.requestedBy, identity.userId))).limit(1);
  if (!run) return Response.json({ error: 'Scan not found' }, { status: 404 });

  const format = new URL(request.url).searchParams.get('format') === 'json' ? 'json' : 'csv';

  // Stream in keyset batches instead of loading every finding (a single scan
  // can hold hundreds of thousands of rows) plus a second full copy of the
  // output into memory at once.
  const enc = new TextEncoder();
  let lastId = 0;
  let started = false;
  let closed = false;
  let first = true;

  const fetchBatch = async () =>
    db.select().from(portFindings)
      .where(and(eq(portFindings.runId, runId), gt(portFindings.id, lastId)))
      .orderBy(asc(portFindings.id))
      .limit(BATCH);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(enc.encode(
            format === 'json'
              ? `{"run":${JSON.stringify(run)},"findings":[`
              : 'ip,port,state,service,product,latency_ms,banner,observed_at\n',
          ));
        }
        if (closed) return;

        const rows = await fetchBatch();
        if (rows.length) {
          let chunk = '';
          for (const finding of rows) {
            if (format === 'json') {
              chunk += (first ? '' : ',') + JSON.stringify(finding);
            } else {
              chunk += [
                finding.ip, finding.port, finding.state, finding.service, finding.product,
                finding.latencyMs, finding.banner,
                finding.observedAt instanceof Date ? finding.observedAt.toISOString() : finding.observedAt,
              ].map(csvCell).join(',') + '\n';
            }
            first = false;
          }
          controller.enqueue(enc.encode(chunk));
          lastId = rows[rows.length - 1].id;
        }
        if (rows.length < BATCH) {
          if (format === 'json') controller.enqueue(enc.encode(']}'));
          controller.close();
          closed = true;
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json' : 'text/csv',
      'Content-Disposition': `attachment; filename="portglass-scan-${runId}.${format}"`,
      'Cache-Control': 'no-store',
    },
  });
}
