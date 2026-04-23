export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import {
  getHrSessionCookieName,
  parseHrSessionCookieValue,
  resolveHrSession,
} from '@/lib/hr-auth'

export async function GET(request) {
  try {
    const adminCookie = request.cookies.get(getAdminSessionCookieName())?.value
    const hrCookie = request.cookies.get(getHrSessionCookieName())?.value

    const adminSession = adminCookie ? parseAdminSessionCookieValue(adminCookie) : null
    const hrSession = hrCookie ? parseHrSessionCookieValue(hrCookie) : null

    if (!adminSession && !hrSession) {
      return NextResponse.json({ role: null })
    }

    const db = getAdminDb()

    if (adminSession) {
      const resolved = await resolveAdminSession(db, adminSession)
      if (resolved) return NextResponse.json({ role: 'admin' })
    }

    if (hrSession) {
      const resolved = await resolveHrSession(db, hrSession)
      if (resolved) return NextResponse.json({ role: 'hr' })
    }

    return NextResponse.json({ role: null })
  } catch (error) {
    console.error('[portal-status] Error resolving session:', error)
    return NextResponse.json({ role: null })
  }
}
