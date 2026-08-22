import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shares } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/lib/share';

export const runtime = 'nodejs';

type State = 'ok' | 'not_found' | 'revoked' | 'expired';

async function load(token: string) {
  const rows = await db.select().from(shares).where(eq(shares.token, token)).limit(1);
  const share = rows[0];
  let state: State = 'ok';
  if (!share) state = 'not_found';
  else if (share.revoked) state = 'revoked';
  else if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) state = 'expired';
  return { share, state };
}

function meta(share: NonNullable<Awaited<ReturnType<typeof load>>['share']>) {
  return {
    kind: share.kind,
    title: share.title,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    needsPassword: !!share.passwordHash,
  };
}

// GET /api/share/[token] -> public. Returns metadata always; returns the frozen
// snapshot data inline only when the share isn't password protected.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { share, state } = await load(token);
  if (state === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (state !== 'ok') return NextResponse.json({ error: state }, { status: 410 });

  const payload: any = { ...meta(share!) };
  if (!share!.passwordHash) {
    payload.data = JSON.parse(share!.snapshot);
    // Snapshot is immutable; let the browser/edge cache it briefly. Kept short
    // so a revoke/expiry still takes effect quickly.
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' },
    });
  }
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}

// POST /api/share/[token] -> public unlock. Body { password }. Returns the
// snapshot data on success.
// Public endpoint doing expensive scrypt work: rate-limit guesses per IP like
// the CLI device-code route does, or this becomes a free CPU-DoS amplifier.
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const client = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown';
  const now = Date.now();
  if (attempts.size > 1000) {
    for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  }
  const bucket = attempts.get(client);
  if (bucket && bucket.resetAt > now && bucket.count >= 10) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }
  attempts.set(client, bucket && bucket.resetAt > now
    ? { count: bucket.count + 1, resetAt: bucket.resetAt }
    : { count: 1, resetAt: now + 60_000 });

  const { token } = await params;
  const { share, state } = await load(token);
  if (state === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (state !== 'ok') return NextResponse.json({ error: state }, { status: 410 });

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* allow empty body for no-password shares */
  }
  if (!(await verifyPassword(String(body?.password ?? ''), share!.passwordHash))) {
    return NextResponse.json({ error: 'bad_password' }, { status: 401 });
  }
  return NextResponse.json({ ...meta(share!), data: JSON.parse(share!.snapshot) });
}

// DELETE /api/share/[token] -> revoke (auth required).
export async function DELETE(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { token } = await params;
  await db.update(shares).set({ revoked: true }).where(eq(shares.token, token));
  return NextResponse.json({ ok: true });
}
