import type { Metadata } from 'next';
import LoginClient from '@/components/login-client';

// Neutral metadata so the login page reveals nothing about the application.
export const metadata: Metadata = {
  title: 'Sign in',
  description: null,
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next;
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <LoginClient callbackPath={safeNext} />;
}
