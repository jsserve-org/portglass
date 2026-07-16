import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanSchedules } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';

async function requireSession() {
  if (!authEnabled) return true;
  const session = await auth.api.getSession({ headers: await headers() });
  return !!session;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const scheduleId = parseInt(id, 10);
  if (Number.isNaN(scheduleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (body.intervalMinutes != null) {
    const iv = Math.min(Math.max(parseInt(String(body.intervalMinutes), 10) || 0, 15), 60 * 24 * 30);
    if (iv) patch.intervalMinutes = iv;
  }
  if (typeof body.label === 'string') patch.label = body.label.trim().slice(0, 80) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const [row] = await db.update(scanSchedules).set(patch).where(eq(scanSchedules.id, scheduleId)).returning();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ schedule: row });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const scheduleId = parseInt(id, 10);
  if (Number.isNaN(scheduleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  await db.delete(scanSchedules).where(eq(scanSchedules.id, scheduleId));
  return NextResponse.json({ ok: true });
}
