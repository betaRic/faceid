import 'server-only'

import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { buildDtrDocument, getDaysInMonth } from '@/lib/dtr'
import { loadPersonByEmployeeIdentifier } from '@/lib/employee-access'
import { getOfficeRecord } from '@/lib/office-directory'
import { postgresEnabled, queryPostgres } from '@/lib/postgres/client'

function buildMonthBounds(year, month) {
  const daysInMonth = getDaysInMonth(year, month)
  const monthLabel = String(month).padStart(2, '0')
  const startDate = new Date(`${year}-${monthLabel}-01T00:00:00+08:00`)
  const endDate = new Date(`${year}-${monthLabel}-${String(daysInMonth).padStart(2, '0')}T23:59:59.999+08:00`)
  return { daysInMonth, startDate, endDate }
}

function groupLogsByDate(logs = []) {
  const grouped = {}
  for (const log of logs) {
    const dateKey = log?.dateKey
    if (!dateKey) continue
    if (!grouped[dateKey]) grouped[dateKey] = []
    grouped[dateKey].push(log)
  }
  return grouped
}

async function loadAttendanceLogsForMonth(db, employeeId, startDate, endDate) {
  if (postgresEnabled()) {
    const result = await queryPostgres(
      `
        SELECT *
        FROM attendance
        WHERE employee_id = $1
          AND timestamp_ms >= $2
          AND timestamp_ms <= $3
        ORDER BY timestamp_ms ASC
      `,
      [employeeId, startDate.getTime(), endDate.getTime()],
    )
    return result.rows.map(row => ({
      ...(row.data || {}),
      id: row.id,
      employeeId: row.employee_id,
      action: row.action,
      timestamp: Number(row.timestamp_ms || 0),
      dateKey: row.date_key,
      officeId: row.office_id,
      officeName: row.office_name,
    }))
  }

  const snapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .where('timestamp', '>=', startDate.getTime())
    .where('timestamp', '<=', endDate.getTime())
    .orderBy('timestamp', 'asc')
    .get()

  return snapshot.docs.map(doc => doc.data())
}

function buildDayRecords({ logsByDate, person, office, month, year, daysInMonth }) {
  const dayRecords = []

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayLogs = (logsByDate[dateKey] || []).sort((a, b) => a.timestamp - b.timestamp)
    const derived = deriveDailyAttendanceRecord({
      logs: dayLogs,
      person,
      office,
      targetDateKey: dateKey,
    })

    dayRecords.push({
      day,
      dateKey,
      amIn: derived.amIn !== '--' ? derived.amIn : '',
      amOut: derived.amOut !== '--' ? derived.amOut : '',
      pmIn: derived.pmIn !== '--' ? derived.pmIn : '',
      pmOut: derived.pmOut !== '--' ? derived.pmOut : '',
      undertime: derived.undertimeMinutes,
      totalHours: derived.workingMinutes,
    })
  }

  return dayRecords
}

export async function buildEmployeeDtrDocument(db, {
  employeeIdentifier,
  personData = null,
  office = null,
  officeCache = null,
  month,
  year,
  range = 'full',
  customStartDay,
  customEndDay,
  signatoryOverride = null,
}) {
  const person = personData || await loadPersonByEmployeeIdentifier(db, employeeIdentifier)
  if (!person) {
    const error = new Error('Employee not found.')
    error.status = 404
    throw error
  }

  const resolvedOffice = office || await resolveOfficeForPerson(db, person, officeCache)
  const { daysInMonth, startDate, endDate } = buildMonthBounds(year, month)
  const employeeId = person.employeeId || employeeIdentifier
  const logs = await loadAttendanceLogsForMonth(db, employeeId, startDate, endDate)
  const logsByDate = groupLogsByDate(logs)
  const dayRecords = buildDayRecords({
    logsByDate,
    person,
    office: resolvedOffice || {},
    month,
    year,
    daysInMonth,
  })

  return buildDtrDocument({
    employee: {
      id: person.id || employeeIdentifier,
      name: person.name || '',
      employeeId: person.employeeId || '',
      familyName: person.familyName || person.lastName || person.surname || '',
      firstName: person.firstName || person.givenName || '',
      middleName: person.middleName || '',
      middleInitial: person.middleInitial || '',
      position: person.position || '',
      office: resolvedOffice?.name || person.officeName || '',
      divisionId: person.divisionId || '',
      divisionName: person.divisionName || '',
    },
    office: resolvedOffice || {},
    divisionId: person.divisionId || '',
    signatoryOverride,
    month,
    year,
    range,
    customStartDay,
    customEndDay,
    dayRecords,
  })
}

async function resolveOfficeForPerson(db, person, officeCache) {
  const officeId = String(person?.officeId || '').trim()
  if (!officeId) return {}

  if (officeCache?.has(officeId)) return officeCache.get(officeId)

  const office = await getOfficeRecord(db, officeId)
  if (officeCache) officeCache.set(officeId, office || {})
  return office || {}
}
