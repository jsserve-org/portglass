import LoginClient from '@/components/login-client';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next;
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <LoginClient callbackPath={safeNext} />;
}
