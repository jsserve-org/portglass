import { NextResponse } from 'next/server';
import { auth, authEnabled } from '@/lib/auth';
import { headers } from 'next/headers';
import { createScanRun } from '@/lib/scan-launch';

export async function POST(request: Request) {
  if (authEnabled) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await createScanRun(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ runId: result.runId, status: result.state });
}
