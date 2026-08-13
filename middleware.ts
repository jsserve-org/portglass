import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAMES = [
  '__Secure-better-auth.session_token',
  '__Host-better-auth.session_token',
  'better-auth.session_token',
  'better-auth-session_token',
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => !!req.cookies.get(name)?.value);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = hasSessionCookie(request);

  // Public paths. Shared reports (/share/<token>) and their data API are public
  // by design; privileged share operations (create/list/revoke) self-gate auth
  // inside their handlers.
  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    // Called only from server.js over loopback; the handler verifies its
    // derived internal secret. Let it reach that stronger check without a
    // browser session cookie.
    pathname === '/api/internal/tick' ||
    pathname === '/api/me' ||
    pathname === '/api/health' ||
    pathname === '/api/cli/device/start' ||
    pathname === '/api/cli/device/poll' ||
    // CLI bearer-token routes self-authenticate without browser cookies.
    pathname === '/api/cli/me' ||
    pathname.startsWith('/api/cli/scans') ||
    pathname === '/cli/install.sh' ||
    pathname === '/cli/install.ps1' ||
    pathname.startsWith('/share/') ||
    pathname.startsWith('/api/share/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Logged-in users shouldn't see login page
  if (pathname === '/login') {
    if (hasSession) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Everything else requires auth
  if (!hasSession) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
