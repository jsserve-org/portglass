import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq, sql } from 'drizzle-orm';
import { auth, authEnabled } from '@/lib/auth';
import { db } from '@/lib/db';
import { portFindings } from '@/lib/schema';
import { getShodanHostIntel, isShodanConfigured, ShodanApiError } from '@/lib/shodan';

const ATTRIBUTION_URL = 'https://www.shodan.io/host/';

export async function GET(_request: Request, { params }: { params: Promise<{ ip: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ip } = await params;
  if (!ip || !isIP(ip)) return NextResponse.json({ error: 'Invalid IP' }, { status: 400 });

  // Terms guardrail: enrichment is available only for a host Portglass has
  // actually observed. This endpoint is not a general-purpose Shodan proxy.
  const observed = await db
    .select({ id: portFindings.id })
    .from(portFindings)
    .where(eq(portFindings.ip, ip))
    .limit(1);
  if (!observed.length) return NextResponse.json({ error: 'Host has not been scanned by Portglass' }, { status: 404 });

  if (!isShodanConfigured()) {
    return NextResponse.json({ error: 'Shodan enrichment is not configured', code: 'not_configured' }, { status: 503 });
  }

  try {
    const intel = await getShodanHostIntel(ip);
    return NextResponse.json({
      available: true,
      attribution: { label: 'Data provided by Shodan', url: `${ATTRIBUTION_URL}${encodeURIComponent(ip)}` },
      intel,
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    const status = error instanceof ShodanApiError && error.status >= 400 && error.status < 500
      ? error.status
      : 502;
    const message = error instanceof ShodanApiError ? error.message : 'Shodan request failed';
    return NextResponse.json({ error: message }, { status });
  }
}
