import SharedReport, { type SharePageProps } from '@/components/shared-report';
import { loadShareMeta } from '@/lib/share';

export const metadata = {
  title: 'Shared Report · Portglass',
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Resolve the share server-side so unlocked reports render their content in
  // the initial HTML — the public page used to ship only a token and make
  // visitors wait for JS -> hydrate -> fetch before any content appeared.
  let props: SharePageProps;
  try {
    const res = await loadShareMeta(token);
    if (res.status === 'ok') {
      const initial = res.meta.needsPassword ? undefined : { ...res.meta, data: JSON.parse(res.share.snapshot) };
      props = { token, initial };
    } else {
      // Terminal states are known now; skip the client fetch entirely.
      const message =
        res.status === 'not_found'
          ? 'This shared report does not exist.'
          : res.status === 'expired'
            ? 'This shared report has expired.'
            : 'This shared report has been revoked.';
      props = { token, initialError: message };
    }
  } catch {
    props = { token };
  }

  return <SharedReport {...props} />;
}
