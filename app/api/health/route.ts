import { db } from '@/lib/db';

export async function GET() {
  await db.execute('select 1');
  return Response.json({ ok: true });
}
