export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveStaffAttendanceSession, sessionAllowsOffice } from '@/lib/employee-access'
import { writeAuditLog } from '@/lib/audit-log'
import { buildAttendanceEntryTiming } from '@/lib/attendance-time'
import { createOriginGuard } from '@/lib/csrf'
import { kvDel } from '@/lib/kv-utils'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { resolveWorkforcePolicyForDate } from '@/lib/workforce-policy'
import { getOfficeRecord } from '@/lib/office-directory'
import { getLocalPersonById } from '@/lib/postgres/person-store'
import { insertLocalAttendanceEntry, getLocalAttendanceById, listLocalAttendanceLogs } from '@/lib/postgres/report-store'
import { upsertLocalDailyAttendanceRecord } from '@/lib/postgres/attendance-store'

// GET /api/admin/attendance?employeeId=EMP-001&date=2026-04-09
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = String(searchParams.get('employeeId') || '').trim()
  const personId = String(searchParams.get('personId') || '').trim()
  const date = String(searchParams.get('date') || '').trim()

  if (!employeeId || !date) {
    return NextResponse.json({ ok: false, message: 'employeeId and date are required.' }, { status: 400 })
  }

  try {
    const db = null
    const resolvedSession = await resolveStaffAttendanceSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })
    }

    const logs = (await listLocalAttendanceLogs({
      employeeId,
      personId,
      dateKey: date,
      direction: 'asc',
      limit: 500,
    }))
      .filter(log => sessionAllowsOffice(resolvedSession, log.officeId))

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

  const body = await request.json().catch(() => null)
  const employeeId = String(body?.employeeId || '').trim()
  const personId = String(body?.personId || '').trim()
  const name = String(body?.name || '').trim()
  const officeId = String(body?.officeId || '').trim()
  const officeName = String(body?.officeName || '').trim()
  const action = String(body?.action || '').trim()
  const manualSlot = String(body?.manualSlot || '').trim()
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
    const db = null
    const resolvedSession = await resolveStaffAttendanceSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })
    }
    if (!sessionAllowsOffice(resolvedSession, officeId)) {
      return NextResponse.json(
        { ok: false, message: 'This admin session cannot override attendance for that office.' },
        { status: 403 },
      )
    }

    // Regenerate timing from the provided timestamp for consistency
    const timing = buildAttendanceEntryTiming(timestamp)
    if (!personId) {
      return NextResponse.json({ ok: false, message: 'A specific employee record is required for a manual override.' }, { status: 400 })
    }

    // personId keeps COS and plantilla employees with the same Employee ID separate.
    const attendanceId = `${personId || employeeId}_${timestamp}_override`

    const existing = await getLocalAttendanceById(attendanceId)
    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'A manual entry already exists at this exact time.' },
        { status: 409 },
      )
    }

    const entry = {
      employeeId,
      personId,
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
      manualSlot,
      overrideReason: reason,
      overriddenBy: resolvedSession.email || '',
      overriddenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      // Explicitly null out biometric fields — admin verification is by identity, not descriptor
      descriptor: null,
      landmarks: null,
      latitude: null,
      longitude: null,
    }

    await insertLocalAttendanceEntry(attendanceId, entry)

    // Invalidate the KV cache for this employee+date so the next summary fetch is fresh
    await kvDel(`attendance:logs:${employeeId}:${dateKey}`)

    // Refresh attendance_daily immediately so HR sees correct data
    // without waiting for the next cron run or cache expiry.
    try {
      const freshLogs = await listLocalAttendanceLogs({ employeeId, personId, dateKey, direction: 'asc', limit: 500 })
      const officeRecord = await getOfficeRecord(db, officeId)
      if (officeRecord) {
        const personRecord = await getLocalPersonById(personId)
        const personForPolicy = personRecord || { id: personId, employeeId, name, officeId, officeName }
        const policyOverride = await resolveWorkforcePolicyForDate({ person: personForPolicy, office: officeRecord, dateKey })
        const dailyRecord = deriveDailyAttendanceRecord({
          logs: freshLogs,
          person: personForPolicy,
          office: officeRecord,
          targetDateKey: dateKey,
          policyOverride,
        })
        await upsertLocalDailyAttendanceRecord(dailyRecord)
      }
    } catch (cacheErr) {
      console.error('[Admin] Failed to refresh attendance_daily:', cacheErr?.message)
    }

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'attendance_override_add',
      targetType: 'attendance',
      targetId: attendanceId,
      officeId,
      summary: `Manual ${action} added for ${name} (${employeeId}) on ${dateKey}`,
      metadata: { employeeId, name, action, manualSlot, dateKey, time: timing.time, reason, overriddenBy: resolvedSession.email },
    })

    return NextResponse.json({ ok: true, attendanceId })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to create attendance entry.' },
      { status: 500 },
    )
  }
}

