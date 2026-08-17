export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveStaffAttendanceSession, sessionAllowsOffice } from '@/lib/employee-access'
import { auditActorFromSession, writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { kvDel } from '@/lib/kv-utils'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { resolveWorkforcePolicyForDate } from '@/lib/workforce-policy'
import { getOfficeRecord } from '@/lib/office-directory'
import {
  deleteLocalAttendanceById,
  getLocalAttendanceById,
  listLocalAttendanceLogs,
  updateLocalFieldDutyStatus,
} from '@/lib/postgres/report-store'
import { upsertLocalDailyAttendanceRecord } from '@/lib/postgres/attendance-store'

async function refreshDailyRecord(data, db) {
  if (!data?.employeeId || !data?.dateKey) return
  await kvDel(`attendance:logs:${data.employeeId}:${data.dateKey}`)
  const [freshLogs, office] = await Promise.all([
    listLocalAttendanceLogs({
      employeeId: data.employeeId,
      personId: data.personId,
      dateKey: data.dateKey,
      direction: 'asc',
      limit: 500,
    }),
    getOfficeRecord(db, data.officeId),
  ])
  if (!office) return
  const person = {
    id: data.personId,
    employeeId: data.employeeId,
    name: data.name,
    officeId: data.officeId,
    officeName: data.officeName,
  }
  const policyOverride = await resolveWorkforcePolicyForDate({ person, office, dateKey: data.dateKey })
  await upsertLocalDailyAttendanceRecord(deriveDailyAttendanceRecord({
    logs: freshLogs,
    person,
    office,
    targetDateKey: data.dateKey,
    policyOverride,
  }))
}

export async function DELETE(request, { params }) {
  const originError = await createOriginGuard()(request)
  if (originError) return originError

  const { attendanceId } = await params
  if (!attendanceId) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })

  try {
    const db = null
    const resolvedSession = await resolveStaffAttendanceSession(request, db)
    if (!resolvedSession) return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })

    const data = await getLocalAttendanceById(attendanceId)
    if (!data) return NextResponse.json({ ok: false, message: 'Attendance entry not found.' }, { status: 404 })
    if (!sessionAllowsOffice(resolvedSession, data.officeId)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot delete that attendance entry.' }, { status: 403 })
    }

    await deleteLocalAttendanceById(attendanceId)
    try {
      await refreshDailyRecord(data, db)
    } catch (error) {
      console.error('[Admin] Failed to refresh attendance_daily after delete:', error?.message)
    }

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      ...auditActorFromSession(resolvedSession),
      action: 'attendance_override_delete',
      targetType: 'attendance',
      targetId: attendanceId,
      officeId: data.officeId || '',
      summary: `Deleted attendance entry for ${data.name || data.employeeId} on ${data.dateKey}`,
      metadata: {
        employeeId: data.employeeId || '',
        name: data.name || '',
        action: data.action || '',
        dateKey: data.dateKey || '',
        source: data.source || 'kiosk',
        wasManualOverride: data.source === 'manual_override',
      },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to delete attendance entry.' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  const originError = await createOriginGuard()(request)
  if (originError) return originError

  const { attendanceId } = await params
  const status = String((await request.json().catch(() => null))?.fieldDutyStatus || '').toLowerCase()
  if (!attendanceId || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ ok: false, message: 'A valid field-duty approval status is required.' }, { status: 400 })
  }

  try {
    const db = null
    const resolvedSession = await resolveStaffAttendanceSession(request, db)
    if (!resolvedSession) return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })

    const data = await getLocalAttendanceById(attendanceId)
    if (!data) return NextResponse.json({ ok: false, message: 'Attendance entry not found.' }, { status: 404 })
    if (!sessionAllowsOffice(resolvedSession, data.officeId)) return NextResponse.json({ ok: false, message: 'This account cannot review that attendance entry.' }, { status: 403 })
    if (data.source !== 'field_duty' || data.fieldDutyStatus !== 'pending') {
      return NextResponse.json({ ok: false, message: 'Only pending field-duty requests can be reviewed.' }, { status: 409 })
    }

    await updateLocalFieldDutyStatus(attendanceId, status, { email: resolvedSession.email || '' })
    await refreshDailyRecord({ ...data, fieldDutyStatus: status }, db)
    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      ...auditActorFromSession(resolvedSession),
      action: `field_duty_${status}`,
      targetType: 'attendance',
      targetId: attendanceId,
      officeId: data.officeId || '',
      summary: `${status === 'approved' ? 'Approved' : 'Rejected'} field-duty request for ${data.name || data.employeeId}`,
      metadata: { employeeId: data.employeeId, fieldDutyReason: data.fieldDutyReason || '', fieldDutyRemarks: data.fieldDutyRemarks || '' },
    })
    return NextResponse.json({ ok: true, fieldDutyStatus: status })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to review field-duty request.' }, { status: 500 })
  }
}
