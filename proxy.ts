import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_SESSION_COOKIE = 'admin_session'
const HR_SESSION_COOKIE = 'hr_session'

const PROTECTED_PATHS = ['/registration']
const AUTH_REDIRECT = '/login'

export default function (request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PATHS.some(path => pathname.startsWith(path))
  if (!isProtected) return NextResponse.next()

  const adminSession = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const hrSession = request.cookies.get(HR_SESSION_COOKIE)?.value

  if (!adminSession && !hrSession) {
    const loginUrl = new URL(AUTH_REDIRECT, request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/registration/:path*'],
}
