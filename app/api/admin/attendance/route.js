export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { buildAttendanceEntryTiming } from '@/lib/attendance-time'
import { createOriginGuard } from '@/lib/csrf'
import { kvDel } from '@/lib/kv-utils'

// GET /api/admin/attendance?employeeId=EMP-001&date=2026-04-09
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = String(searchParams.get('employeeId') || '').trim()
  const date = String(searchParams.get('date') || '').trim()

  if (!employeeId || !date) {
    return NextResponse.json({ ok: false, message: 'employeeId and date are required.' }, { status: 400 })
  }

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
      .collection('attendance')
      .where('employeeId', '==', employeeId)
      .where('dateKey', '==', date)
      .orderBy('timestamp', 'asc')
      .get()

    const logs = snapshot.docs
      .map(doc => {
        const d = doc.data()
        return {
          id: doc.id,
          employeeId: d.employeeId || '',
          name: d.name || '',
          officeId: d.officeId || '',
          officeName: d.officeName || '',
          action: d.action || '',
          attendanceMode: d.attendanceMode || '',
          decisionCode: d.decisionCode || '',
          confidence: Number(d.confidence ?? 0),
          timestamp: Number(d.timestamp || 0),
          dateKey: d.dateKey || date,
          time: d.time || '',
          source: d.source || 'kiosk',
          overrideReason: d.overrideReason || '',
          overriddenBy: d.overriddenBy || '',
        }
      })
      .filter(log => adminSessionAllowsOffice(resolvedSession, log.officeId))

    return NextResponse.json({ ok: true, logs })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance logs.' },
      { status: 500 },
    )
  }
}

// POST /api/admin/attendance — admin manually creates an attendance entry
export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const employeeId = String(body?.employeeId || '').trim()
  const name = String(body?.name || '').trim()
  const officeId = String(body?.officeId || '').trim()
  const officeName = String(body?.officeName || '').trim()
  const action = String(body?.action || '').trim()
  const timestamp = Number(body?.timestamp)
  const dateKey = String(body?.dateKey || '').trim()
  const reason = String(body?.reason || '').trim()

  if (!employeeId || !action || !dateKey || !reason) {
    return NextResponse.json(
      { ok: false, message: 'employeeId, action, dateKey, and reason are required.' },
      { status: 400 },
    )
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return NextResponse.json({ ok: false, message: 'A valid timestamp is required.' }, { status: 400 })
  }
  if (!['checkin', 'checkout'].includes(action)) {
    return NextResponse.json({ ok: false, message: 'action must be checkin or checkout.' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!adminSessionAllowsOffice(resolvedSession, officeId)) {
      return NextResponse.json(
        { ok: false, message: 'This admin session cannot override attendance for that office.' },
        { status: 403 },
      )
    }

    // Regenerate timing from the provided timestamp for consistency
    const timing = buildAttendanceEntryTiming(timestamp)
    // Use a collision-safe ID: employeeId_timestamp_override to avoid clashing with kiosk entries
    const attendanceId = `${employeeId}_${timestamp}_override`

    const existing = await db.collection('attendance').doc(attendanceId).get()
    if (existing.exists) {
      return NextResponse.json(
        { ok: false, message: 'A manual entry already exists at this exact time.' },
        { status: 409 },
      )
    }

    const entry = {
      employeeId,
      name,
      officeId,
      officeName,
      action,
      attendanceMode: 'manual_override',
      geofenceStatus: 'Admin override',
      decisionCode: 'manual_admin_override',
      confidence: 1.0,
      timestamp: timing.timestamp,
      dateKey: timing.dateKey,
      dateLabel: timing.dateLabel,
      date: timing.dateLabel,
      time: timing.time,
      source: 'manual_override',
      overrideReason: reason,
      overriddenBy: resolvedSession.email || '',
      overriddenAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      // Explicitly null out biometric fields — admin verification is by identity, not descriptor
      descriptor: null,
      landmarks: null,
      latitude: null,
      longitude: null,
    }

    await db.collection('attendance').doc(attendanceId).set(entry)

    // Invalidate the KV cache for this employee+date so the next summary fetch is fresh
    await kvDel(`attendance:logs:${employeeId}:${dateKey}`)

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'attendance_override_add',
      targetType: 'attendance',
      targetId: attendanceId,
      officeId,
      summary: `Manual ${action} added for ${name} (${employeeId}) on ${dateKey}`,
      metadata: { employeeId, name, action, dateKey, time: timing.time, reason, overriddenBy: resolvedSession.email },
    })

    return NextResponse.json({ ok: true, attendanceId })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to create attendance entry.' },
      { status: 500 },
    )
  }
}
