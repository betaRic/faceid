import { NextResponse } from 'next/server'
import { getAdminSessionCookieName } from '../../../../lib/admin-auth'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: getAdminSessionCookieName(),
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
