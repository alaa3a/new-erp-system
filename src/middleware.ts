import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'erp_session'

// Public paths that don't require authentication
const publicPaths = [
  '/signin',
  '/reset-password',
  '/api/auth',
]

// Path prefixes that are always public (static assets, Next.js internals)
const publicPrefixes = [
  '/_next',
  '/images',
  '/favicon',
]

function isPublicPath(pathname: string): boolean {
  // Check exact public paths
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return true
  }

  // Check public prefixes
  if (publicPrefixes.some(p => pathname.startsWith(p))) {
    return true
  }

  return false
}

function isAdminPath(pathname: string): boolean {
  // These routes are under the (admin) layout and require auth
  const adminPrefixes = [
    '/accounting',
    '/audit',
    '/business-partners',
    '/inventory',
    '/invoice',
    '/products',
    '/report',
    '/settings',
    '/users',
    '/warehouses',
  ]

  // Root path (/) is the admin dashboard
  if (pathname === '/') return true

  return adminPrefixes.some(p => pathname.startsWith(p))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Only protect admin paths
  if (!isAdminPath(pathname)) {
    return NextResponse.next()
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE)

  if (!sessionCookie?.value) {
    const signinUrl = new URL('/signin', request.url)
    signinUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(signinUrl)
  }

  // Allow the request to proceed
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all routes except static files and API routes (except auth)
    '/((?!_next/static|_next/image|images/|favicon.ico).*)',
  ],
}
