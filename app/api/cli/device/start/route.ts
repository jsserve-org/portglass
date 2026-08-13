import { NextResponse } from 'next/server';
import { lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cliDeviceCodes } from '@/lib/schema';
import { createDeviceCode, createUserCode } from '@/lib/cli-codes';

const EXPIRES_MS = 10 * 60 * 1000;
const starts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const client = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  if (starts.size > 1000) {
    for (const [key, value] of starts) if (value.resetAt <= now) starts.delete(key);
  }
  const bucket = starts.get(client);
  if (bucket && bucket.resetAt > now && bucket.count >= 10) {
    return NextResponse.json({ error: 'Too many device authorization attempts' }, { status: 429 });
  }
  starts.set(client, bucket && bucket.resetAt > now
    ? { count: bucket.count + 1, resetAt: bucket.resetAt }
    : { count: 1, resetAt: now + 60_000 });

  let body: { name?: unknown; platform?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim().slice(0, 80) || 'Portglass CLI';
  const platform = String(body.platform ?? '').trim().slice(0, 80) || null;
  const deviceCode = createDeviceCode();
  const userCode = createUserCode();
  const expiresAt = new Date(Date.now() + EXPIRES_MS);

  await db.delete(cliDeviceCodes).where(lt(cliDeviceCodes.expiresAt, new Date()));
  await db.insert(cliDeviceCodes).values({ deviceCode, userCode, deviceName: name, platform, expiresAt });

  const baseUrl = process.env.BASE_URL || new URL(request.url).origin;
  return NextResponse.json({
    deviceCode,
    userCode,
    verificationUri: `${baseUrl}/cli`,
    verificationUriComplete: `${baseUrl}/cli?code=${encodeURIComponent(userCode)}`,
    expiresIn: EXPIRES_MS / 1000,
    interval: 3,
  });
}
