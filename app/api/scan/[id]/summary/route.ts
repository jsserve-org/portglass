import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portFindings, scanRuns } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq, desc, sql } from 'drizzle-orm';
import { cached } from '@/lib/cache';

function buildPrompt(findings: any[], run: any): string {
  const hosts = new Set(findings.map((f) => f.ip)).size;
  const ports = [...new Set(findings.map((f) => f.port))].sort((a, b) => a - b);
  const services: Record<string, number> = {};
  for (const f of findings) {
    const svc = f.service || f.banner?.split(/[\s\/]/)[0] || `port-${f.port}`;
    services[svc] = (services[svc] || 0) + 1;
  }
  const topSvcs = Object.entries(services)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}(${v})`)
    .join(', ');

  return `You are a network security analyst. Summarize this port scan in 3 short paragraphs:
1) Overview: what was scanned and how many hosts/ports were found open.
2) Notable services and any security-relevant headers or banners.
3) Recommendations or observations.

Scan target: ${run.cidr}
Ports scanned: ${run.ports}
Total open findings: ${findings.length}
Unique hosts: ${hosts}
Open ports: ${ports.slice(0, 20).join(', ')}${ports.length > 20 ? '...' : ''}
Top services: ${topSvcs}

Sample findings:
${findings.slice(0, 15).map((f) => `- ${f.ip}:${f.port} ${f.banner ? `banner="${f.banner.slice(0, 80)}"` : ''} ${f.headers ? `headers="${f.headers.slice(0, 120)}"` : ''}`).join('\n')}`;
}

async function aiSummary(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) return null;
    try {
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        // Never let a hung upstream pin the request (and a pool slot) forever.
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a concise network security analyst. Respond in 3 short paragraphs max. Use markdown.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 512,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

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
    .limit(200);

  const hosts = new Set(findings.map((f) => f.ip)).size;
  const ports = [...new Set(findings.map((f) => f.port))].sort((a, b) => a - b);
  const services: Record<string, number> = {};
  for (const f of findings) {
    const svc = f.service || f.banner?.split(/[\s\/]/)[0] || `port-${f.port}`;
    services[svc] = (services[svc] || 0) + 1;
  }
  const topServices = Object.entries(services).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const shodanRows = await db.execute(sql`
    SELECT COUNT(DISTINCT pf.ip)::int AS count
    FROM port_findings pf
    JOIN shodan_host_cache sc ON sc.ip = pf.ip AND sc.expires_at > now()
    WHERE pf.run_id = ${runId}
  `).catch(() => ({ rows: [{ count: 0 }] }));
  const shodanHosts = Number((shodanRows.rows[0] as { count?: unknown } | undefined)?.count ?? 0);

  const prompt = buildPrompt(findings, run[0]);
  // The whole summary (stats + LLM call) is cached per run. Every visit used to
  // pay a fresh multi-second OpenAI round-trip with no dedupe; finished runs
  // are immutable so their summary caches for a day (keyed by finding count for
  // still-running runs, whose result only gets staler by seconds).
  const body = await cached(
    `scan-summary:${runId}:${findings.length}`,
    run[0].finishedAt ? 24 * 60 * 60_000 : 15_000,
    async () => {
      const aiText = await aiSummary(prompt);
      return {
        computed: {
          hosts,
          openPorts: findings.length,
          portsScanned: ports,
          topServices,
          shodanHosts,
          duration: run[0].finishedAt && run[0].startedAt
            ? Math.round((new Date(run[0].finishedAt).getTime() - new Date(run[0].startedAt).getTime()) / 1000)
            : null,
        },
        ai: aiText,
      };
    },
  );

  return NextResponse.json(body);
}
