// lib/attendance/logs.js
import { toLegacyAttendanceDate } from '@/lib/attendance-time'
import { kvGet, kvSet } from '@/lib/kv-utils'

const ATTENDANCE_LOG_CACHE_TTL_SECONDS = 120

export async function getAttendanceLogsForDate(db, employeeId, dateKey, legacyDateLabel = '') {
  const cacheKey = `attendance:logs:${employeeId}:${dateKey}`
  const cached = await kvGet(cacheKey)
  if (cached && Array.isArray(cached)) {
    return cached
  }

  const snapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .where('dateKey', '==', dateKey)
    .orderBy('timestamp', 'asc')
    .get()

  let logs = []
  if (!snapshot.empty) {
    logs = snapshot.docs.map(record => ({ id: record.id, ...record.data() }))
  } else if (legacyDateLabel) {
    const legacySnapshot = await db
      .collection('attendance')
      .where('employeeId', '==', employeeId)
      .where('date', '==', legacyDateLabel)
      .orderBy('timestamp', 'asc')
      .get()
    logs = legacySnapshot.docs.map(record => ({ id: record.id, ...record.data() }))
  }

  if (logs.length > 0) {
    await kvSet(cacheKey, logs, { ex: ATTENDANCE_LOG_CACHE_TTL_SECONDS })
  }

  return logs
}

export function buildAttendanceDocId(employeeId, timestamp) {
  return `${employeeId}_${timestamp}`
}

export function buildStoredAttendanceEntry(entry) {
  const { descriptor, landmarks, challenge, ...storedEntry } = entry
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
