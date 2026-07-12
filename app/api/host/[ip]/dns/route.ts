import { NextResponse } from 'next/server';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import dns from 'node:dns/promises';
import { detectDynamic, type DynamicVerdict } from '@/lib/dynamic-ip';

export type HostDns = {
  ip: string;
  reverse: string[];          // PTR records (IP -> hostname)
  forward: Record<string, string[]>; // hostname -> A records
  fcrdns: boolean;            // does any forward A record map back to this IP?
  dynamic: DynamicVerdict;    // does the reverse DNS look dynamic/residential?
};

// DNS is comparatively slow and rarely changes; cache per IP for an hour.
const cache = new Map<string, { data: HostDns; expires: number }>();
const TTL_MS = 60 * 60 * 1000;

export async function GET(_request: Request, { params }: { params: Promise<{ ip: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ip } = await params;
  if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return NextResponse.json({ error: 'Invalid IP' }, { status: 400 });
  }

  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  let reverse: string[] = [];
  try {
    reverse = await dns.reverse(ip);
  } catch {
    reverse = [];
  }

  const forward: Record<string, string[]> = {};
  // Forward-confirm a handful of PTR names back to A records.
  await Promise.all(
    reverse.slice(0, 5).map(async (host) => {
      try {
        forward[host] = await dns.resolve4(host);
      } catch {
        forward[host] = [];
      }
    })
  );

  const fcrdns = Object.values(forward).some((addrs) => addrs.includes(ip));
  const dynamic = detectDynamic(ip, reverse);
  const data: HostDns = { ip, reverse, forward, fcrdns, dynamic };
  cache.set(ip, { data, expires: Date.now() + TTL_MS });
  return NextResponse.json(data);
}
