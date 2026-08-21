// lib/attendance/logs.js
import { getLocalAttendanceLogsForDate } from '@/lib/postgres/attendance-store'

export async function getAttendanceLogsForDate(_db, employeeId, dateKey, _legacyDateLabel = '', personId = '') {
  return getLocalAttendanceLogsForDate(employeeId, dateKey, personId)
}

export function buildAttendanceDocId(identityKey, timestamp) {
  return `${identityKey}_${timestamp}`
}

export function buildStoredAttendanceEntry(entry) {
  const { descriptor, landmarks, challenge, ...storedEntry } = entry
  return storedEntry
}

export function buildAttendanceEntryPreview(entry) {
  if (!entry) return null
  return {
    id: entry.id || buildAttendanceDocId(entry.personId || entry.employeeId, entry.timestamp),
    personId: entry.personId || '',
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
    fieldDutyStatus: entry.fieldDutyStatus || '',
    fieldDutyReason: entry.fieldDutyReason || '',
    fieldDutyRemarks: entry.fieldDutyRemarks || '',
  }
}
