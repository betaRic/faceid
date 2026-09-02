export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveStaffAttendanceSession, sessionAllowsOffice } from '@/lib/employee-access'
import { auditActorFromSession, writeAuditLog } from '@/lib/audit-log'
import { serializeHrCorrectionAttendance } from '@/lib/attendance/response'
import { buildAttendanceEntryTiming, isAttendanceDateKey } from '@/lib/attendance-time'
import { createOriginGuard } from '@/lib/csrf'
import { kvDel } from '@/lib/kv-utils'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { resolveWorkforcePolicyForDate } from '@/lib/workforce-policy'
import { getOfficeRecord } from '@/lib/office-directory'
import { getLocalPersonById } from '@/lib/postgres/person-store'
import { insertLocalAttendanceEntry, getLocalAttendanceById, listLocalAttendanceLogs } from '@/lib/postgres/report-store'
import { upsertLocalDailyAttendanceRecord } from '@/lib/postgres/attendance-store'

function isValidDateKey(value) {
  if (!isAttendanceDateKey(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// GET /api/admin/attendance?personId=PERSON-ID&date=2026-04-09
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const personId = String(searchParams.get('personId') || '').trim()
  const date = String(searchParams.get('date') || '').trim()

  if (!personId || !isValidDateKey(date)) {
    return NextResponse.json({ ok: false, message: 'personId and a valid date are required.' }, { status: 400 })
  }

  try {
    const db = null
    const resolvedSession = await resolveStaffAttendanceSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })
    }
    const person = await getLocalPersonById(personId)
    if (!person) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }
    if (!sessionAllowsOffice(resolvedSession, person.officeId)) {
      return NextResponse.json({ ok: false, message: 'This account cannot view attendance for that employee.' }, { status: 403 })
    }

    const logs = (await listLocalAttendanceLogs({
      employeeId: person.employeeId || '',
      personId: person.id,
      dateKey: date,
      direction: 'asc',
      limit: 500,
    }))
      .filter(log => sessionAllowsOffice(resolvedSession, log.officeId))

    return NextResponse.json({
      ok: true,
      logs: resolvedSession.role === 'hr' ? logs.map(serializeHrCorrectionAttendance) : logs,
    })
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
  const requiredStringFields = ['personId', 'action', 'dateKey', 'reason']
  if (
    !body ||
    Array.isArray(body) ||
    !requiredStringFields.every(field => typeof body[field] === 'string') ||
    (body.manualSlot !== undefined && typeof body.manualSlot !== 'string')
  ) {
    return NextResponse.json({ ok: false, message: 'Correction fields must use valid text values.' }, { status: 400 })
  }
  const personId = body.personId.trim()
  const action = body.action.trim()
  const manualSlot = String(body.manualSlot || '').trim()
  const timestamp = Number(body.timestamp)
  const requestedDateKey = body.dateKey.trim()
  const reason = body.reason.trim()

  if (!personId || !action || !requestedDateKey || !reason || !isValidDateKey(requestedDateKey)) {
    return NextResponse.json(
      { ok: false, message: 'personId, action, dateKey, and reason are required.' },
      { status: 400 },
    )
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) {
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
    const person = await getLocalPersonById(personId)
    if (!person) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }
    if (!sessionAllowsOffice(resolvedSession, person.officeId)) {
      return NextResponse.json(
        { ok: false, message: 'This account cannot correct attendance for that employee.' },
        { status: 403 },
      )
    }

    let timing
    try {
      timing = buildAttendanceEntryTiming(timestamp)
    } catch {
      return NextResponse.json({ ok: false, message: 'A valid timestamp is required.' }, { status: 400 })
    }
    if (timing.dateKey !== requestedDateKey) {
      return NextResponse.json({ ok: false, message: 'The timestamp must fall on the requested Manila date.' }, { status: 400 })
    }

    // personId keeps COS and plantilla employees with the same Employee ID separate.
    const attendanceId = `${person.id}_${timestamp}_override`

    const existing = await getLocalAttendanceById(attendanceId)
    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'A manual entry already exists at this exact time.' },
        { status: 409 },
      )
    }

    const entry = {
      employeeId: person.employeeId || '',
      personId: person.id,
      name: person.name || '',
      officeId: person.officeId || '',
      officeName: person.officeName || '',
      divisionId: person.divisionId || '',
      divisionName: person.divisionName || '',
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
    await kvDel(`attendance:logs:${entry.employeeId}:${timing.dateKey}`)

    // Refresh attendance_daily immediately so HR sees correct data
    // without waiting for the next cron run or cache expiry.
    try {
      const freshLogs = await listLocalAttendanceLogs({ employeeId: entry.employeeId, personId: person.id, dateKey: timing.dateKey, direction: 'asc', limit: 500 })
      const officeRecord = await getOfficeRecord(db, person.officeId)
      if (officeRecord) {
        const policyOverride = await resolveWorkforcePolicyForDate({ person, office: officeRecord, dateKey: timing.dateKey })
        const dailyRecord = deriveDailyAttendanceRecord({
          logs: freshLogs,
          person,
          office: officeRecord,
          targetDateKey: timing.dateKey,
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
      ...auditActorFromSession(resolvedSession),
      action: 'attendance_override_add',
      targetType: 'attendance',
      targetId: attendanceId,
      officeId: person.officeId || '',
      summary: `Manual ${action} added for ${person.name || person.id}${person.employeeId ? ` (${person.employeeId})` : ''} on ${timing.dateKey}`,
      metadata: {
        personId: person.id,
        employeeId: person.employeeId || '',
        name: person.name || '',
        divisionId: person.divisionId || '',
        divisionName: person.divisionName || '',
        action,
        manualSlot,
        dateKey: timing.dateKey,
        time: timing.time,
        reason,
        overriddenBy: resolvedSession.email,
      },
    })

    return NextResponse.json({ ok: true, attendanceId })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to create attendance entry.' },
      { status: 500 },
    )
  }
}

