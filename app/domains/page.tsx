import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import DomainView from '@/components/domain-view';

export default async function DomainsPage() {
  const h = await headers();
  const cookie = h.get('cookie') || '';
  const hasSession = cookie.includes('better-auth.session_token') || cookie.includes('better-auth-session_token');
  if (!hasSession) {
    redirect('/login');
  }
  return <DomainView />;
}
