import 'server-only'

import { toLegacyAttendanceDate } from '@/lib/attendance-time'
import { queryPostgres } from '@/lib/postgres/client'

export function normalizeDailyRecord(record, fallbackDateKey = '') {
  const data = typeof record?.data === 'function' ? record.data() : record
  if (!data) return null

  const dateKey = String(data.dateKey || data.date || fallbackDateKey || '')
  const dateLabel = String(data.dateLabel || data.date || toLegacyAttendanceDate(dateKey) || '')
  const amInTimestamp = Number(data.amInTimestamp ?? 0) || null
  const amOutTimestamp = Number(data.amOutTimestamp ?? 0) || null
  let pmInTimestamp = Number(data.pmInTimestamp ?? 0) || null
  let pmOutTimestamp = Number(data.pmOutTimestamp ?? 0) || null
  let pmIn = String(data.pmIn || '--')
  let pmOut = String(data.pmOut || '--')

  // Repair the orphan PM-out shape produced when an afternoon scan followed a missed AM out.
  if (amInTimestamp && !amOutTimestamp && !pmInTimestamp && pmOutTimestamp) {
    pmInTimestamp = pmOutTimestamp
    pmIn = pmOut && pmOut !== '--' ? pmOut : pmIn
    pmOutTimestamp = null
    pmOut = '--'
  }

  return {
    id: record?.id || `${data.employeeId || 'unknown'}_${dateKey}`,
    personId: String(data.personId || ''),
    employeeId: String(data.employeeId || ''),
    name: String(data.name || ''),
    officeId: String(data.officeId || ''),
    officeName: String(data.officeName || 'Unassigned'),
    dateKey,
    date: dateKey,
    dateLabel,
    amInTimestamp,
    amOutTimestamp,
    pmInTimestamp,
    pmOutTimestamp,
    amIn: String(data.amIn || '--'),
    amOut: String(data.amOut || '--'),
    pmIn,
    pmOut,
    lateMinutes: Number(data.lateMinutes ?? 0),
    undertimeMinutes: Number(data.undertimeMinutes ?? 0),
    undertime: Number(data.undertimeMinutes ?? 0),
    workingMinutes: Number(data.workingMinutes ?? 0),
    workingHours: String(data.workingHours || '--'),
    status: String(data.status || 'No complete logs'),
    logCount: Number(data.logCount ?? 0),
    decisionCodes: Array.isArray(data.decisionCodes) ? data.decisionCodes.filter(Boolean).map(String) : [],
    updatedAtMs: Number(data.updatedAtMs ?? 0),
  }
}

export function hasDailyAttendanceLogs(record) {
  return Boolean(
    record?.logCount
    || record?.amInTimestamp
    || record?.amOutTimestamp
    || record?.pmInTimestamp
    || record?.pmOutTimestamp,
  )
}

function getMonthDateKeys(year, month) {
  const numericYear = Number(year)
  const numericMonth = Number(month)
  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
    return []
  }

  const daysInMonth = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate()
  return Array.from({ length: daysInMonth }, (_, index) => (
    `${numericYear}-${String(numericMonth).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
  ))
}

export async function listDailyAttendanceRecordsForDate(db, dateKey) {
  void db
  const result = await queryPostgres(
    'SELECT id, data FROM attendance_daily WHERE date_key = $1 ORDER BY name ASC',
    [String(dateKey || '')],
  )
  return result.rows
    .map(row => normalizeDailyRecord({ id: row.id, ...row.data }, dateKey))
    .filter(Boolean)
}

export async function getEmployeeDailyAttendanceRecord(db, personId, dateKey, legacyEmployeeId = '') {
  const normalizedPersonId = String(personId || '').trim()
  const normalizedEmployeeId = String(legacyEmployeeId || personId || '').trim()
  const normalizedDateKey = String(dateKey || '').trim()
  if (!normalizedPersonId || !normalizedDateKey) return null

  void db
  void normalizedEmployeeId
  const result = await queryPostgres(
    'SELECT id, data FROM attendance_daily WHERE person_id = $1 AND date_key = $2 LIMIT 1',
    [normalizedPersonId, normalizedDateKey],
  )
  return result.rows[0] ? normalizeDailyRecord({ id: result.rows[0].id, ...result.rows[0].data }, normalizedDateKey) : null
}

export async function listEmployeeDailyAttendanceRecordsForMonth(db, personId, year, month, legacyEmployeeId = '') {
  const normalizedPersonId = String(personId || '').trim()
  const normalizedEmployeeId = String(legacyEmployeeId || personId || '').trim()
  if (!normalizedPersonId) return []

  const dateKeys = getMonthDateKeys(year, month)
  if (dateKeys.length === 0) return []

  void db
  void normalizedEmployeeId
  const result = await queryPostgres(
    `
      SELECT id, data
      FROM attendance_daily
      WHERE person_id = $1
        AND date_key = ANY($2::text[])
      ORDER BY date_key ASC
    `,
    [normalizedPersonId, dateKeys],
  )
  return result.rows.map(row => normalizeDailyRecord({ id: row.id, ...row.data })).filter(Boolean)
}

export async function listEmployeeDailyAttendanceRecords(db, personId, legacyEmployeeId = '') {
  void db
  void legacyEmployeeId
  const result = await queryPostgres(
    'SELECT id, data FROM attendance_daily WHERE person_id = $1 ORDER BY date_key ASC',
    [String(personId || '')],
  )
  return result.rows.map(row => normalizeDailyRecord({ id: row.id, ...row.data })).filter(Boolean)
}
