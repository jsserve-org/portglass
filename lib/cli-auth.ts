import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cliDevices } from '@/lib/schema';

export type CliIdentity = {
  deviceId: string;
  userId: string;
  name: string;
  platform: string | null;
};

export function hashCliToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function issueCliToken(): { id: string; token: string; tokenHash: string } {
  const id = randomUUID();
  const token = `pgc_${randomBytes(32).toString('base64url')}`;
  return { id, token, tokenHash: hashCliToken(token) };
}

export async function getCliIdentity(request: Request): Promise<CliIdentity | null> {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(pgc_[A-Za-z0-9_-]+)$/i);
  if (!match) return null;

  const [device] = await db
    .select()
    .from(cliDevices)
    .where(and(eq(cliDevices.tokenHash, hashCliToken(match[1])), isNull(cliDevices.revokedAt)))
    .limit(1);
  if (!device) return null;

  // Best-effort activity stamp; authorization must not fail if this write does.
  db.update(cliDevices)
    .set({ lastUsedAt: new Date() })
    .where(eq(cliDevices.id, device.id))
    .catch(() => {});

  return {
    deviceId: device.id,
    userId: device.userId,
    name: device.name,
    platform: device.platform,
  };
}

export async function requireCliIdentity(request: Request): Promise<CliIdentity | Response> {
  const identity = await getCliIdentity(request);
  return identity ?? Response.json({ error: 'Invalid or revoked CLI token' }, { status: 401 });
}
