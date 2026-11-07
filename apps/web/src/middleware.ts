import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protected administrative path patterns
const ADMIN_ROUTES = ['/super-admin', '/dispatch', '/analytics', '/audit', '/shifts'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  if (!isProtectedAdminRoute) {
    return NextResponse.next();
  }

  // Check auth tokens stored in cookies
  const authToken = request.cookies.get('app-auth-session')?.value || request.cookies.get('sb-access-token')?.value;
  const userRole = request.cookies.get('app-user-role')?.value;

  // If no active session exists, redirect to /login
  if (!authToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('auth_required', 'true');
    loginUrl.searchParams.set('redirect_to', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Super Admin exclusivity guard
  if (pathname.startsWith('/super-admin') && userRole && userRole !== 'SUPER_ADMIN') {
    const fallbackUrl = new URL('/dispatch', request.url);
    fallbackUrl.searchParams.set('error', 'unauthorized_super_admin_only');
    return NextResponse.redirect(fallbackUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/super-admin/:path*',
    '/dispatch/:path*',
    '/analytics/:path*',
    '/audit/:path*',
    '/shifts/:path*',
  ],
};
