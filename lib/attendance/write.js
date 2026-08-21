import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { resolveWorkforcePolicyForDate } from '@/lib/workforce-policy'
import { kvDel } from '@/lib/kv-utils'
import {
  upsertLocalDailyAttendanceRecord,
  writeLocalAttendanceAtomically,
} from '@/lib/postgres/attendance-store'

export function getCooldownForActionMinutes(office, action) {
  const policy = office?.workPolicy || {}
  const raw = action === 'checkin'
    ? Number(policy.checkInCooldownMinutes ?? 30)
    : Number(policy.checkOutCooldownMinutes ?? 5)
  return Number.isFinite(raw) && raw >= 0 ? raw : action === 'checkin' ? 30 : 5
}

export async function writeAttendanceAtomically(db, entry, cooldownMs) {
  return writeLocalAttendanceAtomically(entry, cooldownMs)
}

async function invalidateAttendanceCache(identityKey, dateKey) {
  const cacheKey = `attendance:logs:${identityKey}:${dateKey}`
  await kvDel(cacheKey)
}

export async function updateDailyAttendanceCache(db, entry, dailyLogs, person, office) {
  await invalidateAttendanceCache(entry.personId || entry.employeeId, entry.dateKey)
  
  const refreshedLogs = [...dailyLogs, entry]
    .sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0))

  const policyOverride = await resolveWorkforcePolicyForDate({ person, office, dateKey: entry.dateKey })
  const dailyRecord = deriveDailyAttendanceRecord({
    logs: refreshedLogs,
    person,
    office,
    targetDateKey: entry.dateKey,
    targetDateLabel: entry.dateLabel,
    policyOverride,
  })

  await upsertLocalDailyAttendanceRecord(dailyRecord)
}
