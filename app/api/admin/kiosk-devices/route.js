export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { queryPostgres } from '@/lib/postgres/client'

function getDeviceStatus(lastSeenAtMs) { const age = Date.now() - Number(lastSeenAtMs || 0); return !Number.isFinite(age) || age < 0 ? 'unknown' : age <= 900000 ? 'active' : age <= 86400000 ? 'idle' : 'stale' }

export async function GET(request) {
  const cookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!cookie) return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  try {
    const session = await resolveAdminSession(null, cookie)
    if (!session) return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    const result = await queryPostgres(`SELECT DISTINCT ON (COALESCE(request_meta->>'kioskId', request_meta->>'clientKey', source_key)) COALESCE(request_meta->>'kioskId', request_meta->>'clientKey', source_key) AS kiosk_id, office_id, office_name, decision_code, request_meta, timestamp_ms FROM (SELECT *, COALESCE(NULLIF(request_meta->>'source', ''), 'web-kiosk') AS source_key FROM scan_events) events ORDER BY COALESCE(request_meta->>'kioskId', request_meta->>'clientKey', source_key), timestamp_ms DESC LIMIT 50`)
    const devices = result.rows.map(row => { const meta = row.request_meta || {}; const lastSeenAtMs = Number(row.timestamp_ms || 0); return { kioskId: String(row.kiosk_id || 'web-kiosk'), source: String(meta.source || 'web-kiosk'), officeId: String(row.office_id || ''), officeName: String(row.office_name || ''), lastDecisionCode: String(row.decision_code || ''), lastUserAgent: String(meta.userAgent || ''), lastSeenAtMs, status: getDeviceStatus(lastSeenAtMs) } }).filter(device => session.scope !== 'office' || !device.officeId || device.officeId === session.officeId)
    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), summary: { total: devices.length, active: devices.filter(device => device.status === 'active').length, idle: devices.filter(device => device.status === 'idle').length, stale: devices.filter(device => device.status === 'stale').length }, devices })
  } catch (error) { return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to load kiosk devices.' }, { status: 500 }) }
}
