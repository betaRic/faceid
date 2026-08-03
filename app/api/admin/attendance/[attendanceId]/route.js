export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveStaffAttendanceSession, sessionAllowsOffice } from '@/lib/employee-access'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { kvDel } from '@/lib/kv-utils'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { getOfficeRecord } from '@/lib/office-directory'
import { postgresEnabled } from '@/lib/postgres/client'
import { deleteLocalAttendanceById, getLocalAttendanceById, listLocalAttendanceLogs, updateLocalFieldDutyStatus } from '@/lib/postgres/report-store'
import { upsertLocalDailyAttendanceRecord } from '@/lib/postgres/attendance-store'

// DELETE /api/admin/attendance/[attendanceId]
export async function DELETE(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { attendanceId } = await params
  if (!attendanceId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

  try {
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveStaffAttendanceSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })
    }

    const ref = usePostgres ? null : db.collection('attendance').doc(attendanceId)
    const doc = usePostgres ? await getLocalAttendanceById(attendanceId) : await ref.get()

    if (usePostgres ? !doc : !doc.exists) {
      return NextResponse.json({ ok: false, message: 'Attendance entry not found.' }, { status: 404 })
    }

    const data = usePostgres ? doc : doc.data()

    if (!sessionAllowsOffice(resolvedSession, data.officeId)) {
      return NextResponse.json(
        { ok: false, message: 'This admin session cannot delete that attendance entry.' },
        { status: 403 },
      )
    }

    if (usePostgres) await deleteLocalAttendanceById(attendanceId)
    else await ref.delete()

    // Invalidate the KV cache so the summary panel refreshes correctly
    if (data.employeeId && data.dateKey) {
      await kvDel(`attendance:logs:${data.employeeId}:${data.dateKey}`)

      // Refresh attendance_daily so HR sees correct data immediately
      // (fetch AFTER delete so the removed entry is excluded from the fresh logs)
      try {
        const freshLogs = usePostgres
          ? await listLocalAttendanceLogs({ employeeId: data.employeeId, personId: data.personId, dateKey: data.dateKey, direction: 'asc', limit: 500 })
          : (await db
              .collection('attendance')
              .where('employeeId', '==', data.employeeId)
              .where('dateKey', '==', data.dateKey)
              .orderBy('timestamp', 'asc')
              .get()).docs.map(doc => ({ id: doc.id, ...doc.data() }))
        const officeRecord = await getOfficeRecord(db, data.officeId)
        if (officeRecord) {
          const dailyRecord = deriveDailyAttendanceRecord({
            logs: freshLogs,
            person: { id: data.personId, employeeId: data.employeeId, name: data.name, officeId: data.officeId, officeName: data.officeName },
            office: officeRecord,
            targetDateKey: data.dateKey,
          })
          if (usePostgres) await upsertLocalDailyAttendanceRecord(dailyRecord)
          else {
            await db.collection('attendance_daily').doc(`${data.employeeId}_${data.dateKey}`).set({
              ...dailyRecord,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true })
          }
        }
      } catch (cacheErr) {
        console.error('[Admin] Failed to refresh attendance_daily after delete:', cacheErr?.message)
      }
    }

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
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
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to delete attendance entry.' },
      { status: 500 },
    )
  }
}

// PATCH /api/admin/attendance/[attendanceId] — approve or reject an offsite field-duty request
export async function PATCH(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { attendanceId } = await params
  const status = String((await request.json().catch(() => null))?.fieldDutyStatus || '').toLowerCase()
  if (!attendanceId || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ ok: false, message: 'A valid field-duty approval status is required.' }, { status: 400 })
  }

  try {
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveStaffAttendanceSession(request, db)
    if (!resolvedSession) return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })

    const existing = usePostgres ? await getLocalAttendanceById(attendanceId) : await db.collection('attendance').doc(attendanceId).get()
    const data = usePostgres ? existing : (existing?.exists ? existing.data() : null)
    if (!data) return NextResponse.json({ ok: false, message: 'Attendance entry not found.' }, { status: 404 })
    if (!sessionAllowsOffice(resolvedSession, data.officeId)) return NextResponse.json({ ok: false, message: 'This account cannot review that attendance entry.' }, { status: 403 })
    if (data.source !== 'field_duty' || data.fieldDutyStatus !== 'pending') {
      return NextResponse.json({ ok: false, message: 'Only pending field-duty requests can be reviewed.' }, { status: 409 })
    }

    const reviewedAt = new Date().toISOString()
    if (usePostgres) {
      await updateLocalFieldDutyStatus(attendanceId, status, { email: resolvedSession.email || '' })
    } else {
      await db.collection('attendance').doc(attendanceId).update({
        fieldDutyStatus: status,
        fieldDutyReviewedAt: reviewedAt,
        fieldDutyReviewedBy: resolvedSession.email || '',
      })
    }

    await kvDel(`attendance:logs:${data.employeeId}:${data.dateKey}`)
    const freshLogs = usePostgres
      ? await listLocalAttendanceLogs({ employeeId: data.employeeId, personId: data.personId, dateKey: data.dateKey, direction: 'asc', limit: 500 })
      : (await db.collection('attendance').where('employeeId', '==', data.employeeId).where('dateKey', '==', data.dateKey).orderBy('timestamp', 'asc').get()).docs.map(doc => ({ id: doc.id, ...doc.data() }))
    const office = await getOfficeRecord(db, data.officeId)
    if (office) {
      const dailyRecord = deriveDailyAttendanceRecord({ logs: freshLogs, person: data, office, targetDateKey: data.dateKey })
      if (usePostgres) await upsertLocalDailyAttendanceRecord(dailyRecord)
      else await db.collection('attendance_daily').doc(`${data.employeeId}_${data.dateKey}`).set({ ...dailyRecord, updatedAt: reviewedAt }, { merge: true })
    }

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
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

