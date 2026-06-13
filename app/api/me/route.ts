import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET() {
  if (!authEnabled) return Response.json({ user: null, authEnabled: false });
  const session = await auth.api.getSession({ headers: await headers() });
  return Response.json({ user: session?.user ?? null, authEnabled: true });
}
