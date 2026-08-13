import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cliDevices } from '@/lib/schema';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const [revoked] = await db.update(cliDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(cliDevices.id, id), eq(cliDevices.userId, session.user.id)))
    .returning({ id: cliDevices.id });
  if (!revoked) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
