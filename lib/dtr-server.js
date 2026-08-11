import 'server-only'

import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { buildDtrDocument, getDaysInMonth } from '@/lib/dtr'
import { loadPersonByEmployeeIdentifier } from '@/lib/employee-access'
import { getOfficeRecord } from '@/lib/office-directory'
import { queryPostgres } from '@/lib/postgres/client'
import { loadDtrWorkforceRecords, resolveDtrSpecialDay, resolveEmployeeDayPolicy } from '@/lib/workforce-policy'

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

async function loadAttendanceLogsForMonth(db, employeeId, personId, startDate, endDate) {
  const result = await queryPostgres(
      `
        SELECT *
        FROM attendance
        WHERE (
             person_id = $1
             OR (
             (person_id IS NULL OR person_id = '')
             AND employee_id = $2
             AND NOT EXISTS (
               SELECT 1
               FROM persons same_employee_id
               WHERE same_employee_id.employee_id = attendance.employee_id
                 AND same_employee_id.id <> $1
             )
             )
           )
          AND timestamp_ms >= $3
          AND timestamp_ms <= $4
        ORDER BY timestamp_ms ASC
      `,
      [personId, employeeId, startDate.getTime(), endDate.getTime()],
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

function buildDayRecords({ logsByDate, person, office, month, year, daysInMonth, workforce = {} }) {
  const dayRecords = []

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayLogs = (logsByDate[dateKey] || []).sort((a, b) => a.timestamp - b.timestamp)
    const dayOfWeek = new Date(`${dateKey}T00:00:00+08:00`).getDay()
    const policyOverride = resolveEmployeeDayPolicy({ person, office, policies: workforce.policies || [], dayOfWeek })
    const specialDay = resolveDtrSpecialDay({ dateKey, person, holidays: workforce.holidays || [], leaves: workforce.leaves || [], orders: workforce.orders || [] })
    const derived = deriveDailyAttendanceRecord({
      logs: dayLogs,
      person,
      office,
      targetDateKey: dateKey,
      policyOverride,
    })
    const timeLogEntries = dayLogs.map(log => {
      const isManual = log?.source === 'manual_override'
      const isFieldDuty = log?.source === 'field_duty'
      const location = Number.isFinite(log?.latitude) && Number.isFinite(log?.longitude)
        ? `GPS: ${Number(log.latitude).toFixed(6)}, ${Number(log.longitude).toFixed(6)}`
        : ''
      const fieldDutyRemark = isFieldDuty
        ? [
            `Field Duty ${String(log?.fieldDutyStatus || 'pending').toUpperCase()}`,
            String(log?.fieldDutyReason || '').trim(),
            String(log?.fieldDutyRemarks || '').trim(),
            location,
          ].filter(Boolean).join(' — ')
        : ''
      return {
        time: String(log?.time || new Date(log.timestamp).toLocaleTimeString('en-PH', {
          timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
        }) || '').trim(),
        action: String(log?.action || '').trim().toLowerCase(),
        source: isManual ? 'Manual override' : isFieldDuty ? 'Field duty' : 'System scan',
        remark: isManual ? String(log?.overrideReason || '').trim() : fieldDutyRemark,
        timestamp: Number(log?.timestamp || 0),
      }
    })
    const manualEntries = timeLogEntries
      .filter(entry => ['Manual override', 'Field duty'].includes(entry.source) && entry.remark)
    const remarks = [...new Set(manualEntries.map(entry => entry.remark))]

    dayRecords.push({
      day,
      dateKey,
      amIn: derived.amIn !== '--' ? derived.amIn : '',
      amOut: derived.amOut !== '--' ? derived.amOut : '',
      pmIn: derived.pmIn !== '--' ? derived.pmIn : '',
      pmOut: derived.pmOut !== '--' ? derived.pmOut : '',
      undertime: derived.undertimeMinutes,
      totalHours: derived.workingMinutes,
      specialCode: specialDay?.code || '',
      specialLabel: specialDay?.label || '',
      specialColor: specialDay?.color || '',
      scheduledWorking: policyOverride.schedule.working !== false,
      scheduledTimes: policyOverride.schedule,
      remarks,
      manualEntries,
      timeLogEntries,
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
  const logs = await loadAttendanceLogsForMonth(db, employeeId, person.id || '', startDate, endDate)
  const logsByDate = groupLogsByDate(logs)
  const workforce = await loadDtrWorkforceRecords({ person, startDate: `${year}-${String(month).padStart(2, '0')}-01`, endDate: `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}` })
  const dayRecords = buildDayRecords({
    logsByDate,
    person,
    office: resolvedOffice || {},
    month,
    year,
    daysInMonth,
    workforce,
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
