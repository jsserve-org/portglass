import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shares } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, desc, eq } from 'drizzle-orm';
import {
  buildScanSnapshot,
  buildHostSnapshot,
  hashPassword,
  newToken,
  type ShareKind,
} from '@/lib/share';

export const runtime = 'nodejs';

async function requireUser() {
  if (!authEnabled) return { id: 'local' };
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// GET /api/share -> list the current user's share links (for management).
// Snapshots are omitted to keep the payload small — and never even fetched:
// each snapshot can embed hundreds of findings, so selecting the whole row and
// discarding the column shipped megabytes per list view.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({
      token: shares.token,
      kind: shares.kind,
      refId: shares.refId,
      title: shares.title,
      expiresAt: shares.expiresAt,
      revoked: shares.revoked,
      createdBy: shares.createdBy,
      createdAt: shares.createdAt,
      passwordHash: shares.passwordHash,
    })
    .from(shares)
    .orderBy(desc(shares.createdAt))
    .limit(200);
  return NextResponse.json(
    rows.map(({ passwordHash, ...rest }) => ({
      ...rest,
      hasPassword: !!passwordHash,
    })),
  );
}

// POST /api/share -> create a share link.
// Body: { kind: 'scan'|'host', refId, title?, expiresInDays?, password? }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kind = body.kind as ShareKind;
  const refId = String(body.refId ?? '').trim();
  if ((kind !== 'scan' && kind !== 'host') || !refId) {
    return NextResponse.json({ error: 'kind must be scan|host and refId is required' }, { status: 400 });
  }

  let snapshot;
  if (kind === 'scan') {
    const runId = parseInt(refId, 10);
    if (isNaN(runId)) return NextResponse.json({ error: 'Invalid scan id' }, { status: 400 });
    snapshot = await buildScanSnapshot(runId);
  } else {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(refId)) {
      return NextResponse.json({ error: 'Invalid host IP' }, { status: 400 });
    }
    snapshot = await buildHostSnapshot(refId);
  }
  if (!snapshot) {
    return NextResponse.json({ error: 'Nothing to share for that target' }, { status: 404 });
  }

  const days = Number(body.expiresInDays);
  const expiresAt =
    Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400_000) : null;
  const password = typeof body.password === 'string' && body.password.length ? body.password : null;

  const token = newToken();
  await db.insert(shares).values({
    token,
    kind,
    refId,
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : null,
    snapshot: JSON.stringify(snapshot),
    passwordHash: password ? await hashPassword(password) : null,
    expiresAt,
    createdBy: (user as any).id ?? null,
  });

  return NextResponse.json({ token, url: `/share/${token}`, expiresAt });
}
