import 'server-only'

import { queryPostgres } from '@/lib/postgres/client'

export const LEAVE_TYPES = ['VL', 'SL', 'CTO', 'WL']
export const LEAVE_TYPE_LABELS = { VL: 'Vacation Leave', SL: 'Sick Leave', CTO: 'Compensatory Time Off', WL: 'Wellness Leave' }

// Editable starter calendar.  Movable observances are intentionally not guessed:
// HR/Admin must enter the official annual proclamation before publishing it.
export function philippineHolidaySeed(year) {
  const numericYear = Number.parseInt(year, 10)
  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) return []
  const fixed = [
    ['01-01', "New Year's Day"],
    ['04-09', 'Araw ng Kagitingan'],
    ['05-01', 'Labor Day'],
    ['06-12', 'Independence Day'],
    ['08-21', 'Ninoy Aquino Day'],
    ['08-26', 'National Heroes Day (verify proclamation)'],
    ['11-30', 'Bonifacio Day'],
    ['12-08', 'Feast of the Immaculate Conception'],
    ['12-25', 'Christmas Day'],
    ['12-30', 'Rizal Day'],
  ]
  return fixed.map(([monthDay, name]) => ({ date: `${numericYear}-${monthDay}`, name }))
}

export function normalizeWeeklySchedule(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const fallback = { working: true, morningIn: '08:00', morningOut: '12:00', afternoonIn: '13:00', afternoonOut: '17:00' }
  // An empty object deliberately means "inherit". Do not manufacture an
  // 08:00-17:00 employee schedule: that would silently override the office
  // or division policy the employee is supposed to inherit.
  return Object.fromEntries(Object.entries(source)
    .filter(([day, entry]) => /^[0-6]$/.test(String(day)) && entry && typeof entry === 'object')
    .map(([day, entry]) => [day, { ...fallback, ...entry, working: entry.working !== false }]))
}

export function resolveEmployeeDayPolicy({ person, office, policies = [], dayOfWeek }) {
  const employeeDay = person?.weeklySchedule?.[dayOfWeek] || person?.weeklySchedule?.[String(dayOfWeek)] || null
  const organizationPolicy = policies.find(p => p.scopeType === 'organization')
  const divisionPolicy = policies.find(p => p.scopeType === 'division' && p.scopeId === person?.divisionId)
  const officePolicy = policies.find(p => p.scopeType === 'office' && p.scopeId === person?.officeId)
  const organizationDay = organizationPolicy?.weeklySchedule?.[dayOfWeek] || organizationPolicy?.weeklySchedule?.[String(dayOfWeek)] || null
  const divisionDay = divisionPolicy?.weeklySchedule?.[dayOfWeek] || divisionPolicy?.weeklySchedule?.[String(dayOfWeek)] || null
  const officeDay = officePolicy?.weeklySchedule?.[dayOfWeek] || officePolicy?.weeklySchedule?.[String(dayOfWeek)] || null
  const officeDefault = {
    working: (office?.workPolicy?.workingDays || [1, 2, 3, 4, 5]).includes(dayOfWeek),
    morningIn: office?.workPolicy?.morningIn || '08:00', morningOut: office?.workPolicy?.morningOut || '12:00',
    afternoonIn: office?.workPolicy?.afternoonIn || '13:00', afternoonOut: office?.workPolicy?.afternoonOut || '17:00',
  }
  // The office configuration is the physical-office default; configured
  // organization, office, division, and employee policies layer over it in
  // the documented order without manufacturing an employee schedule.
  const day = { ...officeDefault, ...(organizationDay || {}), ...(officeDay || {}), ...(divisionDay || {}), ...(employeeDay || {}) }
  const scoped = [
    ['employee', person?.flexitime],
    ['division', divisionPolicy?.flexitime],
    ['office', officePolicy?.flexitime],
    ['organization', organizationPolicy?.flexitime],
  ]
  const flexitime = scoped.find(([, value]) => value?.enabled)?.[1] || { enabled: false }
  const requiredMinutes = Number.parseInt(flexitime.requiredMinutes ?? day.requiredMinutes, 10)
  return { schedule: day, flexitime: { enabled: flexitime.enabled === true, requiredMinutes: Number.isFinite(requiredMinutes) && requiredMinutes > 0 ? requiredMinutes : null } }
}

export function resolveDtrSpecialDay({ dateKey, holidays = [], leaves = [], orders = [], person }) {
  const holiday = holidays.find(row => row.holidayDate === dateKey && (
    row.scopeType === 'national' || (row.scopeType === 'office' && row.officeId === person?.officeId) || (row.scopeType === 'division' && row.divisionId === person?.divisionId)
  ))
  if (holiday) return { code: 'HOLIDAY', label: holiday.name, color: 'holiday' }
  const leave = leaves.find(row => row.startDate <= dateKey && row.endDate >= dateKey)
  if (leave) return { code: leave.leaveType, label: LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType, color: leave.leaveType.toLowerCase() }
  const order = orders.find(row => row.startDate <= dateKey && row.endDate >= dateKey)
  if (order) return { code: 'OB', label: 'OB', color: 'ob' }
  return null
}

async function loadWorkforcePolicies() {
  const result = await queryPostgres('SELECT scope_type, scope_id, flexitime, weekly_schedule FROM workforce_policies')
  return result.rows.map(row => ({
    ...row,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    weeklySchedule: row.weekly_schedule || {},
  }))
}

export async function loadDtrWorkforceRecords({ person, startDate, endDate }) {
  const [policies, holidays, leaves, orders] = await Promise.all([
    loadWorkforcePolicies(),
    queryPostgres('SELECT * FROM holidays WHERE holiday_date BETWEEN $1::date AND $2::date', [startDate, endDate]),
    queryPostgres('SELECT * FROM employee_leaves WHERE person_id = $1 AND start_date <= $3::date AND end_date >= $2::date', [person.id, startDate, endDate]),
    queryPostgres(`SELECT DISTINCT o.*
      FROM official_orders o
      LEFT JOIN official_order_members member ON member.official_order_id = o.id
      WHERE (o.person_id = $1 OR member.person_id = $1)
        AND o.start_date <= $3::date AND o.end_date >= $2::date`, [person.id, startDate, endDate]),
  ])
  const map = row => ({ ...row, scopeType: row.scope_type, scopeId: row.scope_id, weeklySchedule: row.weekly_schedule || {}, holidayDate: row.holiday_date?.toISOString?.().slice(0, 10) || String(row.holiday_date || ''), officeId: row.office_id, divisionId: row.division_id, leaveType: row.leave_type, startDate: row.start_date?.toISOString?.().slice(0, 10) || String(row.start_date || ''), endDate: row.end_date?.toISOString?.().slice(0, 10) || String(row.end_date || '') })
  return { policies, holidays: holidays.rows.map(map), leaves: leaves.rows.map(map), orders: orders.rows.map(map) }
}

export async function resolveWorkforcePolicyForDate({ person, office, dateKey }) {
  // Scanning needs only the effective schedule/flexitime. Holiday, leave,
  // and Official Order records are DTR presentation data and must never make
  // a kiosk scan unavailable or add needless queries to its critical path.
  const policies = await loadWorkforcePolicies()
  const dayOfWeek = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
  return resolveEmployeeDayPolicy({ person, office, policies, dayOfWeek })
}
