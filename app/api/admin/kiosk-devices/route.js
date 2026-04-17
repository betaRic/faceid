export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { getAdminDb } from '@/lib/firebase-admin'

function getDeviceStatus(lastSeenAtMs) {
  const ageMs = Date.now() - Number(lastSeenAtMs || 0)
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown'
  if (ageMs <= 15 * 60 * 1000) return 'active'
  if (ageMs <= 24 * 60 * 60 * 1000) return 'idle'
  return 'stale'
}

function coerceTimestamp(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (Number.isFinite(value)) return Number(value)
  return 0
}

export async function GET(request) {
  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const snapshot = await db
      .collection('kiosk_devices')
      .orderBy('lastSeenAt', 'desc')
      .limit(50)
      .get()

    const devices = snapshot.docs
      .map(record => {
        const data = record.data() || {}
        const lastSeenAtMs = coerceTimestamp(data.lastSeenAt)
        return {
          kioskId: record.id,
          source: String(data.source || 'web-kiosk'),
          officeId: String(data.officeId || ''),
          officeName: String(data.officeName || ''),
          lastDecisionCode: String(data.lastDecisionCode || ''),
          lastUserAgent: String(data.lastUserAgent || ''),
          lastSeenAtMs,
          status: getDeviceStatus(lastSeenAtMs),
        }
      })
      .filter(device => (
        resolvedSession.scope !== 'office'
        || !device.officeId
        || device.officeId === resolvedSession.officeId
      ))

    const summary = {
      total: devices.length,
      active: devices.filter(device => device.status === 'active').length,
      idle: devices.filter(device => device.status === 'idle').length,
      stale: devices.filter(device => device.status === 'stale').length,
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary,
      devices,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load kiosk devices.' },
      { status: 500 },
    )
  }
}
