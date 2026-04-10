import { NextResponse } from 'next/server'

/**
 * middleware.js
 * Centralized auth guard for admin API routes.
 *
 * This is a first-pass gate: it checks cookie presence only.
 * Full session validation (HMAC, expiry, scope) still happens inside each handler.
 * This prevents unauthenticated requests from reaching business logic at all.
 *
 * If you add a new admin route, add its prefix to PROTECTED_PREFIXES.
 * If you add a new public endpoint, add it to PUBLIC_EXACT or PUBLIC_PREFIXES.
 */

const PROTECTED_PREFIXES = [
  '/api/admin',
  '/api/admins',
  '/api/offices',
  '/api/system',
]

// These person and attendance routes require auth
const PROTECTED_EXACT_PREFIXES = [
  '/api/persons',        // directory, CRUD — enroll is handled below
  '/api/attendance/summary',
  '/api/attendance/export',
]

// Always public — attendance scan, enrollment submission, model files
const PUBLIC_PREFIXES = [
  '/api/auth',
  '/api/attendance/scan',
  '/api/attendance/status',
]

const PUBLIC_EXACT = [
  '/api/persons/enroll',
  '/api/persons/check-duplicate',
]

export function middleware(request) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/api/')) return NextResponse.next()

  // Explicit public paths first
  if (PUBLIC_EXACT.some(p => pathname === p)) return NextResponse.next()
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next()

  // Check protected
  const isProtected =
    PROTECTED_PREFIXES.some(p => pathname.startsWith(p)) ||
    PROTECTED_EXACT_PREFIXES.some(p => pathname.startsWith(p))

  if (isProtected) {
    const cookie = request.cookies.get('admin_session')?.value
    if (!cookie) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'missing_session' },
        { status: 401 }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
