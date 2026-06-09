import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import HostsList from '@/components/hosts-list';

export default async function HostsPage() {
  const h = await headers();
  const cookie = h.get('cookie') || '';
  const hasSession = cookie.includes('better-auth.session_token') || cookie.includes('better-auth-session_token');
  if (!hasSession) {
    redirect('/login');
  }
  return <HostsList />;
}
