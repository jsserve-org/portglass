import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cliDevices } from '@/lib/schema';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const devices = await db.select({
    id: cliDevices.id,
    name: cliDevices.name,
    platform: cliDevices.platform,
    createdAt: cliDevices.createdAt,
    lastUsedAt: cliDevices.lastUsedAt,
    revokedAt: cliDevices.revokedAt,
  }).from(cliDevices).where(eq(cliDevices.userId, session.user.id)).orderBy(desc(cliDevices.createdAt));
  return NextResponse.json(devices);
}
