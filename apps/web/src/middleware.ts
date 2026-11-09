import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/', '/super-admin', '/dispatch', '/analytics', '/audit', '/shifts', '/bookings'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some((route) => 
    route === '/' ? pathname === '/' : pathname.startsWith(route)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const authToken = request.cookies.get('app-auth-session')?.value || request.cookies.get('sb-access-token')?.value;
  const userRole = request.cookies.get('app-user-role')?.value;

  // If visiting root or protected routes without credentials, force redirect to /login
  if (!authToken) {
    if (pathname === '/login') return NextResponse.next();
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect_to', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Super Admin exclusivity guard
  if (pathname.startsWith('/super-admin') && userRole && userRole !== 'SUPER_ADMIN') {
    const fallbackUrl = new URL('/bookings', request.url);
    fallbackUrl.searchParams.set('error', 'unauthorized_super_admin_only');
    return NextResponse.redirect(fallbackUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/super-admin/:path*',
    '/dispatch/:path*',
    '/analytics/:path*',
    '/audit/:path*',
    '/shifts/:path*',
    '/bookings/:path*',
  ],
};
