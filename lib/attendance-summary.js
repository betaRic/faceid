import { deriveDailyAttendanceRecord } from './daily-attendance'

export function buildAttendanceSummary({ attendance, persons, offices, targetDate }) {
  const grouped = new Map()
  const officesById = new Map(offices.map(office => [office.id, office]))
  const personsById = new Map(persons.map(person => [person.id, person]))

  attendance.forEach(log => {
    if ((log.dateKey || log.date) !== targetDate) return
    const personKey = String(log.personId || '').trim()
    const legacyKey = String(log.employeeId || log.name || '').trim()
    const groupKey = personKey ? `person:${personKey}` : `legacy:${legacyKey}`
    if (!grouped.has(groupKey)) grouped.set(groupKey, [])
    grouped.get(groupKey).push(log)
  })

  return Array.from(grouped.entries())
    .map(([, logs]) => {
      const firstLog = logs[0] || {}
      const person = personsById.get(String(firstLog.personId || '').trim())
        || persons.find(item => !firstLog.employeeId && item.name === firstLog.name) || null
      const office = officesById.get(logs[0]?.officeId) || officesById.get(person?.officeId) || null
      return deriveDailyAttendanceRecord({
        logs,
        person,
        office,
        targetDateKey: targetDate,
        targetDateLabel: logs[0]?.dateLabel || logs[0]?.date || targetDate,
      })
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

