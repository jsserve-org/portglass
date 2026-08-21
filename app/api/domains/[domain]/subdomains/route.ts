import { NextResponse } from 'next/server';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { lookupSubdomains, normalizeDomain } from '@/lib/crtsh';

// GET /api/domains/<domain>/subdomains — hostnames observed for this domain in
// public Certificate Transparency logs (via crt.sh). Served from a small
// in-memory cache; nothing is persisted, so this endpoint adds no DB growth.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { domain } = await params;
  const normalized = normalizeDomain(decodeURIComponent(domain ?? ''));
  if (!normalized) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 });
  }

  try {
    const result = await lookupSubdomains(normalized);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'crt.sh lookup failed';
    const status = /timeout|abort/i.test(message) ? 504 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
