import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function hasSessionCookie(req: NextRequest): boolean {
  return req.cookies.getAll().some((c) => c.name === 'better-auth.session_token' || c.name === 'better-auth-session_token');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/api/me' ||
    pathname === '/api/health' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
