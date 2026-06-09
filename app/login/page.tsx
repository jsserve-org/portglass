import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import LoginClient from '@/components/login-client';

export default async function Login() {
  const h = await headers();
  const cookie = h.get('cookie') || '';
  const hasSession = cookie.includes('better-auth.session_token') || cookie.includes('better-auth-session_token');
  if (hasSession) {
    redirect('/');
  }
  return <LoginClient />;
}
