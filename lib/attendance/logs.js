import { toLegacyAttendanceDate } from '@/lib/attendance-time'

export async function getAttendanceLogsForDate(db, employeeId, dateKey, legacyDateLabel = '') {
  const snapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .where('dateKey', '==', dateKey)
    .orderBy('timestamp', 'asc')
    .get()

  if (!snapshot.empty) {
    return snapshot.docs.map(record => ({ id: record.id, ...record.data() }))
  }

  if (!legacyDateLabel) return []

  const legacySnapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .where('date', '==', legacyDateLabel)
    .orderBy('timestamp', 'asc')
    .get()

  return legacySnapshot.docs.map(record => ({ id: record.id, ...record.data() }))
}

export function buildAttendanceDocId(employeeId, timestamp) {
  return `${employeeId}_${timestamp}`
}

export function buildStoredAttendanceEntry(entry) {
  const { descriptor, landmarks, ...storedEntry } = entry
  return storedEntry
}

export function buildAttendanceEntryPreview(entry) {
  if (!entry) return null
  return {
    id: entry.id || buildAttendanceDocId(entry.employeeId, entry.timestamp),
    name: entry.name || '',
    employeeId: entry.employeeId || '',
    officeId: entry.officeId || '',
    officeName: entry.officeName || '',
    action: entry.action || '',
    attendanceMode: entry.attendanceMode || '',
    geofenceStatus: entry.geofenceStatus || '',
    decisionCode: entry.decisionCode || '',
    confidence: Number(entry.confidence ?? 0),
    timestamp: Number(entry.timestamp ?? 0),
    dateKey: entry.dateKey || '',
    dateLabel: entry.dateLabel || entry.date || '',
    date: entry.dateLabel || entry.date || '',
    time: entry.time || '',
  }
}
