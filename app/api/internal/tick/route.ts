import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { runDueSchedules } from '@/lib/schedules';

// Internal-only endpoint hit once a minute by the custom server (server.js) to
// fire due recurring scans. It's gated by a shared secret generated at boot and
// injected into the process env, so it can only be triggered in-process — never
// by an external client. It's a POST so it's never triggered by a prefetch/GET.
export async function POST(request: Request) {
  // Match server.js even when Next captured its environment before server.js
  // assigned INTERNAL_TICK_SECRET dynamically.
  const secret = process.env.INTERNAL_TICK_SECRET ||
    (process.env.SESSION_SECRET
      ? createHash('sha256').update(`portglass-scheduler:${process.env.SESSION_SECRET}`).digest('hex')
      : '');
  if (!secret || request.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const launched = await runDueSchedules();
    return NextResponse.json({ ok: true, launched });
  } catch (err) {
    console.error('schedule tick failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
