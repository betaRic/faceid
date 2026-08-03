export function normalizeEmployeeWfhDays(value) {
  const values = Array.isArray(value) ? value : []
  return [...new Set(values
    .map(Number)
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort()
}

export function isEmployeeWfhDay(person, date = new Date()) {
  return normalizeEmployeeWfhDays(person?.individualWfhDays).includes(getManilaWeekday(date))
}

function getManilaWeekday(date) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(date)
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[weekday]
}
