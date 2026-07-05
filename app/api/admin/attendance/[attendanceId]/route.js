export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { kvDel } from '@/lib/kv-utils'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { getOfficeRecord } from '@/lib/office-directory'
import { postgresEnabled } from '@/lib/postgres/client'
import { deleteLocalAttendanceById, getLocalAttendanceById, listLocalAttendanceLogs } from '@/lib/postgres/report-store'
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

    const ref = usePostgres ? null : db.collection('attendance').doc(attendanceId)
    const doc = usePostgres ? await getLocalAttendanceById(attendanceId) : await ref.get()

    if (usePostgres ? !doc : !doc.exists) {
      return NextResponse.json({ ok: false, message: 'Attendance entry not found.' }, { status: 404 })
    }

    const data = usePostgres ? doc : doc.data()

    if (!adminSessionAllowsOffice(resolvedSession, data.officeId)) {
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
          ? await listLocalAttendanceLogs({ employeeId: data.employeeId, dateKey: data.dateKey, direction: 'asc', limit: 500 })
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
            person: { employeeId: data.employeeId, name: data.name, officeId: data.officeId, officeName: data.officeName },
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

