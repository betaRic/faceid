import { deriveDailyAttendanceRecord } from './daily-attendance'

export function buildAttendanceSummary({ attendance, persons, offices, targetDate }) {
  const grouped = new Map()
  const officesById = new Map(offices.map(office => [office.id, office]))
  const personsByKey = new Map(persons.map(person => [person.employeeId || person.name, person]))

  attendance.forEach(log => {
    if (log.date !== targetDate) return
    const employeeKey = log.employeeId || log.name
    if (!grouped.has(employeeKey)) grouped.set(employeeKey, [])
    grouped.get(employeeKey).push(log)
  })

  return Array.from(grouped.entries())
    .map(([employeeKey, logs]) => {
      const person = personsByKey.get(employeeKey) || persons.find(item => item.name === logs[0]?.name) || null
      const office = officesById.get(logs[0]?.officeId) || officesById.get(person?.officeId) || null
      return deriveDailyAttendanceRecord({ logs, person, office, targetDate })
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}
