// lib/attendance/write.js
import { FieldValue } from 'firebase-admin/firestore'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { kvDel } from '@/lib/kv-utils'

export function getCooldownForActionMinutes(office, action) {
  const policy = office?.workPolicy || {}
  const raw = action === 'checkin'
    ? Number(policy.checkInCooldownMinutes ?? 30)
    : Number(policy.checkOutCooldownMinutes ?? 5)
  return Number.isFinite(raw) && raw >= 0 ? raw : action === 'checkin' ? 30 : 5
}

export async function writeAttendanceAtomically(db, entry, cooldownMs) {
  const attendanceId = `${entry.employeeId}_${entry.timestamp}`
  const attendanceRef = db.collection('attendance').doc(attendanceId)
  const attendanceLockRef = db.collection('attendance_locks').doc(entry.employeeId)
  const { descriptor, landmarks, ...storedEntry } = entry
  const entryPreview = {
    id: attendanceId,
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

  return db.runTransaction(async transaction => {
    const [attendanceSnap, attendanceLockSnap] = await Promise.all([
      transaction.get(attendanceRef),
      transaction.get(attendanceLockRef),
    ])

    if (attendanceSnap.exists) {
      return {
        ok: false,
        duplicate: true,
        entry: { id: attendanceSnap.id, ...attendanceSnap.data() },
      }
    }

    const lastTimestamp = Number(attendanceLockSnap.data()?.lastTimestamp ?? 0)
    if (cooldownMs > 0 && lastTimestamp && entry.timestamp - lastTimestamp < cooldownMs) {
      return {
        ok: false,
        duplicate: true,
        entry: attendanceLockSnap.data()?.lastEntryPreview || null,
      }
    }

    transaction.set(attendanceRef, {
      ...storedEntry,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false })

    transaction.set(attendanceLockRef, {
      employeeId: entry.employeeId,
      officeId: entry.officeId,
      lastTimestamp: entry.timestamp,
      lastAttendanceId: attendanceId,
      lastAction: entry.action || '',
      lastEntryPreview: entryPreview,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return { ok: true, attendanceId, storedEntry, entryPreview }
  })
}

async function invalidateAttendanceCache(employeeId, dateKey) {
  const cacheKey = `attendance:logs:${employeeId}:${dateKey}`
  await kvDel(cacheKey)
}

export async function updateDailyAttendanceCache(db, entry, dailyLogs, person, office) {
  await invalidateAttendanceCache(entry.employeeId, entry.dateKey)
  
  const refreshedLogs = [...dailyLogs, entry]
    .sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0))

  const dailyRecord = deriveDailyAttendanceRecord({
    logs: refreshedLogs,
    person,
    office,
    targetDateKey: entry.dateKey,
    targetDateLabel: entry.dateLabel,
  })

  await db.collection('attendance_daily').doc(`${entry.employeeId}_${entry.dateKey}`).set({
    ...dailyRecord,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }).catch(err => {
    console.error('Failed to update daily attendance cache:', err)
  })
}