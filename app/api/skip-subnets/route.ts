import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skipSubnets } from '@/lib/schema';
import { desc, eq } from 'drizzle-orm';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { isValidCidr } from '@/lib/cidr';

async function requireSession() {
  if (!authEnabled) return true;
  const session = await auth.api.getSession({ headers: await headers() });
  return !!session;
}

export async function GET() {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(skipSubnets).orderBy(desc(skipSubnets.createdAt));
  return NextResponse.json({ subnets: rows });
}

export async function POST(request: Request) {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const cidr = String(body.cidr ?? '').trim();
  if (!cidr || !isValidCidr(cidr)) return NextResponse.json({ error: 'Invalid CIDR' }, { status: 400 });
  const reason = String(body.reason ?? '').trim().slice(0, 200) || null;
  try {
    const [row] = await db.insert(skipSubnets).values({ cidr, reason }).returning();
    return NextResponse.json({ subnet: row });
  } catch {
    return NextResponse.json({ error: 'That subnet is already on the skip list.' }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id') ?? '', 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  await db.delete(skipSubnets).where(eq(skipSubnets.id, id));
  return NextResponse.json({ ok: true });
}
