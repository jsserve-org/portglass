import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/dashboard';

export default async function Home() {
  const h = await headers();
  const cookie = h.get('cookie') || '';
  const hasSession = cookie.includes('better-auth.session_token') || cookie.includes('better-auth-session_token');
  if (!hasSession) {
    redirect('/login');
  }
  return <Dashboard />;
}
