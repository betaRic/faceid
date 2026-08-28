export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { resolveWorkforcePolicyForDate } from '@/lib/workforce-policy'
import { formatAttendanceDateKey } from '@/lib/attendance-time'
import { listOfficeRecords } from '@/lib/office-directory'
import { getLocalPersonById } from '@/lib/postgres/person-store'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'
import { upsertLocalDailyAttendanceRecord } from '@/lib/postgres/attendance-store'

export const runtime = 'nodejs'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = null
  const yesterday = new Date(Date.now() - 86400000)
  const dateKey = formatAttendanceDateKey(yesterday)

  const offices = await listOfficeRecords(db)
  const officesById = new Map(offices.map(o => [o.id, o]))

  const logs = await listLocalAttendanceLogs({ dateKey, direction: 'asc', limit: 2000 })
  const logsByPerson = new Map()
  for (const log of logs) {
    const personId = String(log.personId || '').trim()
    if (!personId) continue
    const current = logsByPerson.get(personId) || []
    current.push(log)
    logsByPerson.set(personId, current)
  }

  let rebuilt = 0
  for (const [personId, personLogs] of logsByPerson) {
    const person = await getLocalPersonById(personId)
    if (!person) continue
    const office = officesById.get(person.officeId) || null
    const policyOverride = await resolveWorkforcePolicyForDate({ person, office, dateKey })
    await upsertLocalDailyAttendanceRecord(deriveDailyAttendanceRecord({
      logs: personLogs,
      person,
      office,
      targetDateKey: dateKey,
      policyOverride,
    }))
    rebuilt += 1
  }

  return NextResponse.json({ ok: true, dateKey, rebuilt })
}

