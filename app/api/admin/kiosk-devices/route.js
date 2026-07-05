export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { postgresEnabled, queryPostgres } from '@/lib/postgres/client'

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
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    if (usePostgres) {
      const result = await queryPostgres(`
        SELECT DISTINCT ON (COALESCE(request_meta->>'kioskId', request_meta->>'clientKey', source_key))
          COALESCE(request_meta->>'kioskId', request_meta->>'clientKey', source_key) AS kiosk_id,
          office_id,
          office_name,
          decision_code,
          request_meta,
          timestamp_ms
        FROM (
          SELECT *, COALESCE(NULLIF(request_meta->>'source', ''), 'web-kiosk') AS source_key
          FROM scan_events
        ) events
        ORDER BY COALESCE(request_meta->>'kioskId', request_meta->>'clientKey', source_key), timestamp_ms DESC
        LIMIT 50
      `)
      const devices = result.rows
        .map(row => {
          const meta = row.request_meta || {}
          const lastSeenAtMs = Number(row.timestamp_ms || 0)
          return {
            kioskId: String(row.kiosk_id || 'web-kiosk'),
            source: String(meta.source || 'web-kiosk'),
            officeId: String(row.office_id || ''),
            officeName: String(row.office_name || ''),
            lastDecisionCode: String(row.decision_code || ''),
            lastUserAgent: String(meta.userAgent || ''),
            lastSeenAtMs,
            status: getDeviceStatus(lastSeenAtMs),
          }
        })
        .filter(device => (
          resolvedSession.scope !== 'office'
          || !device.officeId
          || device.officeId === resolvedSession.officeId
        ))

      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        summary: {
          total: devices.length,
          active: devices.filter(device => device.status === 'active').length,
          idle: devices.filter(device => device.status === 'idle').length,
          stale: devices.filter(device => device.status === 'stale').length,
        },
        devices,
      })
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

