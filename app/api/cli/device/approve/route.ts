import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cliDeviceCodes } from '@/lib/schema';
import { normalizeUserCode } from '@/lib/cli-codes';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { userCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const userCode = normalizeUserCode(body.userCode);
  if (userCode.length !== 9) return NextResponse.json({ error: 'Enter the 8-character code from the CLI' }, { status: 400 });

  const [updated] = await db
    .update(cliDeviceCodes)
    .set({ approvedBy: session.user.id, approvedAt: new Date() })
    .where(and(
      eq(cliDeviceCodes.userCode, userCode),
      gt(cliDeviceCodes.expiresAt, new Date()),
      isNull(cliDeviceCodes.approvedBy),
    ))
    .returning({ deviceName: cliDeviceCodes.deviceName, platform: cliDeviceCodes.platform });
  if (!updated) return NextResponse.json({ error: 'Code is invalid or expired' }, { status: 404 });
  return NextResponse.json({ ok: true, device: updated });
}
