import { NextResponse } from 'next/server'
import {
  adminAuthConfigured,
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
  verifyAdminPin,
} from '../../../../lib/admin-auth'

export async function POST(request) {
  if (!adminAuthConfigured()) {
    return NextResponse.json(
      { ok: false, message: 'Admin authentication is not configured on the server.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const pin = body?.pin?.trim()

  if (!verifyAdminPin(pin)) {
    return NextResponse.json({ ok: false, message: 'Invalid admin PIN.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: getAdminSessionCookieName(),
    value: createAdminSessionCookieValue(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getAdminSessionMaxAge(),
  })

  return response
}
