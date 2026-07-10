import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { asc, gt, eq } from 'drizzle-orm';
import { isJunk } from '@/lib/junk';

export const runtime = 'nodejs';
// Never cache a full data dump.
export const dynamic = 'force-dynamic';

const BATCH = 1000;

const COLUMNS = [
  'id', 'ip', 'port', 'state', 'service', 'product',
  'latency_ms', 'banner', 'headers', 'observed_at', 'run_id', 'scan_cidr',
] as const;

type Row = {
  id: number; ip: string; port: number; state: string;
  service: string | null; product: string | null; latencyMs: number | null;
  banner: string | null; headers: string | null; observedAt: Date;
  runId: number | null; scanCidr: string | null;
};

function toRecord(r: Row): Record<string, unknown> {
  return {
    id: r.id, ip: r.ip, port: r.port, state: r.state,
    service: r.service ?? '', product: r.product ?? '',
    latency_ms: r.latencyMs ?? '', banner: r.banner ?? '', headers: r.headers ?? '',
    observed_at: r.observedAt instanceof Date ? r.observedAt.toISOString() : String(r.observedAt),
    run_id: r.runId ?? '', scan_cidr: r.scanCidr ?? '',
  };
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fetchBatch(afterId: number): Promise<Row[]> {
  return db
    .select({
      id: portFindings.id, ip: portFindings.ip, port: portFindings.port,
      state: portFindings.state, service: portFindings.service, product: portFindings.product,
      latencyMs: portFindings.latencyMs, banner: portFindings.banner, headers: portFindings.headers,
      observedAt: portFindings.observedAt, runId: portFindings.runId, scanCidr: scanRuns.cidr,
    })
    .from(portFindings)
    .leftJoin(scanRuns, eq(portFindings.runId, scanRuns.id))
    .where(gt(portFindings.id, afterId))
    .orderBy(asc(portFindings.id))
    .limit(BATCH) as unknown as Promise<Row[]>;
}

// GET /api/export?format=csv|json — streams ALL findings (auth required).
// Keyset-paginated in batches and streamed with backpressure, so the whole
// table never has to fit in memory.
export async function GET(request: Request) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const enc = new TextEncoder();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `portglass-all-${stamp}.${format}`;

  let lastId = 0;
  let started = false;
  let closed = false;
  let first = true;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(enc.encode(format === 'json' ? '[' : COLUMNS.join(',') + '\n'));
        }
        if (closed) return;

        const rows = await fetchBatch(lastId);
        if (rows.length) {
          let chunk = '';
          for (const r of rows) {
            if (isJunk(r)) continue;
            const rec = toRecord(r);
            if (format === 'json') {
              chunk += (first ? '' : ',') + JSON.stringify(rec);
            } else {
              chunk += COLUMNS.map((c) => csvCell(rec[c])).join(',') + '\n';
            }
            first = false;
          }
          controller.enqueue(enc.encode(chunk));
          lastId = rows[rows.length - 1].id;
        }
        if (rows.length < BATCH) {
          if (format === 'json') controller.enqueue(enc.encode(']'));
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
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
