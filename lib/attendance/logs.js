import { toLegacyAttendanceDate } from '@/lib/attendance-time'

const ATTENDANCE_LOG_CACHE_TTL_SECONDS = 120
let kvClient = null

async function getKv() {
  if (kvClient) return kvClient

  const redisUrl = process.env.REDIS_URL
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN

  if (redisUrl) {
    const { Redis } = await import('@upstash/redis')
    kvClient = new Redis({ url: redisUrl, token: 'dummy' })
    return kvClient
  }

  if (kvUrl && kvToken) {
    const { Redis } = await import('@upstash/redis')
    kvClient = new Redis({ url: kvUrl, token: kvToken })
    return kvClient
  }

  return null
}

export async function getAttendanceLogsForDate(db, employeeId, dateKey, legacyDateLabel = '') {
  const kv = await getKv()
  const cacheKey = `attendance:logs:${employeeId}:${dateKey}`
  
  if (kv) {
    try {
      const cached = await kv.get(cacheKey)
      if (cached && Array.isArray(cached)) {
        return cached
      }
    } catch {
    }
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

  if (kv && logs.length > 0) {
    try {
      await kv.set(cacheKey, logs, { ex: ATTENDANCE_LOG_CACHE_TTL_SECONDS })
    } catch {
    }
  }

  return logs
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
