import 'server-only'

import { toLegacyAttendanceDate } from '@/lib/attendance-time'

function normalizeDailyRecord(record, fallbackDateKey = '') {
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
  const fallbackDateLabel = toLegacyAttendanceDate(dateKey)

  const snapshot = await db
    .collection('attendance_daily')
    .where('dateKey', '==', dateKey)
    .orderBy('name', 'asc')
    .get()

  let records = snapshot.docs
    .map(record => normalizeDailyRecord(record, dateKey))
    .filter(Boolean)

  if (records.length > 0) return records

  if (!fallbackDateLabel) return []

  const legacySnapshot = await db
    .collection('attendance_daily')
    .where('date', '==', fallbackDateLabel)
    .orderBy('name', 'asc')
    .get()

  records = legacySnapshot.docs
    .map(record => normalizeDailyRecord(record, dateKey))
    .filter(Boolean)

  return records
}

export async function getEmployeeDailyAttendanceRecord(db, employeeId, dateKey) {
  const normalizedEmployeeId = String(employeeId || '').trim()
  const normalizedDateKey = String(dateKey || '').trim()
  if (!normalizedEmployeeId || !normalizedDateKey) return null

  const record = await db
    .collection('attendance_daily')
    .doc(`${normalizedEmployeeId}_${normalizedDateKey}`)
    .get()

  return record.exists ? normalizeDailyRecord(record, normalizedDateKey) : null
}

export async function listEmployeeDailyAttendanceRecordsForMonth(db, employeeId, year, month) {
  const normalizedEmployeeId = String(employeeId || '').trim()
  if (!normalizedEmployeeId) return []

  const dateKeys = getMonthDateKeys(year, month)
  if (dateKeys.length === 0) return []

  const refs = dateKeys.map(dateKey => (
    db.collection('attendance_daily').doc(`${normalizedEmployeeId}_${dateKey}`)
  ))
  const records = await db.getAll(...refs)

  return records
    .map((record, index) => (record.exists ? normalizeDailyRecord(record, dateKeys[index]) : null))
    .filter(Boolean)
}

export async function listEmployeeDailyAttendanceRecords(db, employeeId) {
  const snapshot = await db
    .collection('attendance_daily')
    .where('employeeId', '==', employeeId)
    .get()

  return snapshot.docs
    .map(record => normalizeDailyRecord(record))
    .filter(Boolean)
    .sort((left, right) => String(left.dateKey).localeCompare(String(right.dateKey)))
}
