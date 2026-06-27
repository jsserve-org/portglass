import SharedReport from '@/components/shared-report';

export const metadata = {
  title: 'Shared Report · Portglass',
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedReport token={token} />;
}
