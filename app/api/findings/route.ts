import { db } from '@/lib/db';
import { portFindings } from '@/lib/schema';
import { auth, authEnabled } from '@/lib/auth';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

const querySchema = z.object({
  q: z.string().optional().default(''),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: Request) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(searchParams));

  const filters = [];
  if (query.port) filters.push(eq(portFindings.port, query.port));
  if (query.q) {
    const needle = `%${query.q}%`;
    filters.push(
      or(
        ilike(portFindings.ip, needle),
        ilike(portFindings.banner, needle),
        ilike(portFindings.service, needle),
        ilike(portFindings.product, needle),
      ),
    );
  }

  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(portFindings)
      .where(where)
      .orderBy(desc(portFindings.observedAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(portFindings).where(where),
  ]);

  return Response.json({
    rows,
    total: Number(totalRows[0]?.value ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  });
}
