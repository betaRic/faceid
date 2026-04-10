import { NextResponse } from 'next/server'
import { getAdminDb } from '../../../../lib/firebase-admin'
import { deriveDailyAttendanceRecord } from '../../../../lib/daily-attendance'
import { formatAttendanceDateKey } from '../../../../lib/attendance-time'
import { listOfficeRecords } from '../../../../lib/office-directory'

export const runtime = 'nodejs'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminDb()
  const yesterday = new Date(Date.now() - 86400000)
  const dateKey = formatAttendanceDateKey(yesterday)

  const offices = await listOfficeRecords(db)
  const officesById = new Map(offices.map(o => [o.id, o]))

  const snapshot = await db.collection('attendance')
    .where('dateKey', '==', dateKey)
    .get()

  const logsByEmployee = {}
  snapshot.docs.forEach(doc => {
    const log = doc.data()
    const key = log.employeeId
    if (!key) return
    if (!logsByEmployee[key]) logsByEmployee[key] = []
    logsByEmployee[key].push(log)
  })

  const batch = db.batch()
  let rebuilt = 0

  for (const [employeeId, logs] of Object.entries(logsByEmployee)) {
    const officeId = logs[0]?.officeId
    const office = officesById.get(officeId) || null
    const record = deriveDailyAttendanceRecord({
      logs,
      person: null,
      office,
      targetDateKey: dateKey,
    })
    const ref = db.collection('attendance_daily').doc(`${employeeId}_${dateKey}`)
    batch.set(ref, record, { merge: true })
    rebuilt++
  }

  await batch.commit()

  return NextResponse.json({ ok: true, dateKey, rebuilt })
}
