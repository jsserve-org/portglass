import { requireCliIdentity } from '@/lib/cli-auth';

export async function GET(request: Request) {
  const identity = await requireCliIdentity(request);
  if (identity instanceof Response) return identity;
  return Response.json(identity);
}
