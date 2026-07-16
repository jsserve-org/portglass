import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import DevicesOverview from '@/components/devices-overview';
import { deviceTypeCounts } from '@/lib/device-counts';

export default async function DevicesPage() {
  const h = await headers();
  const cookie = h.get('cookie') || '';
  const hasSession = cookie.includes('better-auth.session_token') || cookie.includes('better-auth-session_token');
  if (!hasSession) {
    redirect('/login');
  }
  // Fetch the counts here (cheap, cached) so the page paints with real numbers
  // immediately — no client fetch waterfall / empty-tile flash on load.
  const { types } = await deviceTypeCounts();
  return <DevicesOverview initialTypes={types} />;
}
