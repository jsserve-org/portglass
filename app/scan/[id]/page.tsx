import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import ScanDetail from '@/components/scan-detail';

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const h = await headers();
  const cookie = h.get('cookie') || '';
  const hasSession = cookie.includes('better-auth.session_token') || cookie.includes('better-auth-session_token');
  if (!hasSession) {
    redirect('/login');
  }
  const { id } = await params;
  return <ScanDetail runId={id} />;
}
