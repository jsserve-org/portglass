import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cliDeviceCodes, cliDevices } from '@/lib/schema';
import { issueCliToken } from '@/lib/cli-auth';

export async function POST(request: Request) {
  let body: { deviceCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const deviceCode = String(body.deviceCode ?? '');
  if (!deviceCode) return NextResponse.json({ error: 'deviceCode is required' }, { status: 400 });

  const result = await db.transaction(async (tx) => {
    const [code] = await tx.select().from(cliDeviceCodes).where(eq(cliDeviceCodes.deviceCode, deviceCode)).limit(1);
    if (!code) return { state: 'expired' as const };
    if (code.expiresAt.getTime() <= Date.now()) {
      await tx.delete(cliDeviceCodes).where(eq(cliDeviceCodes.deviceCode, deviceCode));
      return { state: 'expired' as const };
    }
    if (!code.approvedBy) return { state: 'pending' as const };

    // Claim the approved code atomically. Concurrent poll requests must never
    // mint two bearer tokens for the same one-time authorization.
    const [claimed] = await tx.delete(cliDeviceCodes)
      .where(eq(cliDeviceCodes.deviceCode, deviceCode))
      .returning({ deviceCode: cliDeviceCodes.deviceCode });
    if (!claimed) return { state: 'expired' as const };

    const issued = issueCliToken();
    await tx.insert(cliDevices).values({
      id: issued.id,
      userId: code.approvedBy,
      tokenHash: issued.tokenHash,
      name: code.deviceName,
      platform: code.platform,
    });
    return { state: 'approved' as const, token: issued.token, deviceId: issued.id };
  });

  if (result.state === 'expired') return NextResponse.json({ error: 'expired_token' }, { status: 410 });
  if (result.state === 'pending') return NextResponse.json({ error: 'authorization_pending' }, { status: 428 });
  return NextResponse.json({ accessToken: result.token, tokenType: 'Bearer', deviceId: result.deviceId });
}
