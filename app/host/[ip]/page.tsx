import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import HostDetail from '@/components/host-detail';

export default async function HostPage({ params }: { params: Promise<{ ip: string }> }) {
  const h = await headers();
  const cookie = h.get('cookie') || '';
  const hasSession = cookie.includes('better-auth.session_token') || cookie.includes('better-auth-session_token');
  if (!hasSession) {
    redirect('/login');
  }
  const { ip } = await params;
  return <HostDetail ip={decodeURIComponent(ip)} />;
}
