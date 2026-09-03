import { deriveDailyAttendanceRecord, getNextAttendanceAction } from '@/lib/daily-attendance'
import { buildScanEventRecord } from '@/lib/scan-events'
import { buildAttendanceEntryPreview } from '@/lib/attendance/logs'
import {
  getLocalAttendanceLock,
  getLocalAttendanceLogsForDate,
  insertLocalAttendanceEntry,
  upsertLocalAttendanceLock,
  upsertLocalDailyAttendanceRecord,
  writeLocalScanEvent,
} from '@/lib/postgres/attendance-store'
import { withPostgresTransaction } from '@/lib/postgres/client'

export function getCooldownForActionMinutes(office, action) {
  const policy = office?.workPolicy || {}
  const raw = action === 'checkin'
    ? Number(policy.checkInCooldownMinutes ?? 30)
    : Number(policy.checkOutCooldownMinutes ?? 5)
  return Number.isFinite(raw) && raw >= 0 ? raw : action === 'checkin' ? 30 : 5
}

function latestEntryPreview(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return null
  return buildAttendanceEntryPreview(logs[logs.length - 1])
}

export async function commitAcceptedAttendance({
  entry,
  person,
  office,
  policyOverride = null,
  scanEventContext = {},
}) {
  const personId = String(entry?.personId || '').trim()
  if (!personId) throw new Error('A canonical person ID is required to save attendance.')

  return withPostgresTransaction(async client => {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`attendance:${personId}`],
    )

    const lockedLogs = await getLocalAttendanceLogsForDate(
      entry.employeeId || '',
      entry.dateKey || '',
      personId,
      { client },
    )
    const nextAction = getNextAttendanceAction(lockedLogs, office, entry.timestamp, policyOverride)
    if (nextAction === 'complete') {
      return {
        ok: false,
        reason: 'complete',
        action: 'complete',
        entry: latestEntryPreview(lockedLogs),
      }
    }

    const committedEntry = {
      ...entry,
      action: nextAction,
      ...(entry.fieldDutyStatus === 'pending' ? { requestedAction: nextAction } : {}),
    }
    const cooldownMs = getCooldownForActionMinutes(office, nextAction) * 60 * 1000
    const lock = await getLocalAttendanceLock(personId, { client })
    const lastTimestamp = Number(lock?.last_timestamp_ms || 0)
    if (
      cooldownMs > 0
      && lastTimestamp
      && Number(committedEntry.timestamp || 0) - lastTimestamp < cooldownMs
    ) {
      return {
        ok: false,
        reason: 'cooldown',
        action: nextAction,
        entry: lock?.last_entry_preview || latestEntryPreview(lockedLogs),
      }
    }

    const stored = await insertLocalAttendanceEntry(committedEntry, { client })
    await upsertLocalDailyAttendanceRecord(deriveDailyAttendanceRecord({
      logs: [...lockedLogs, committedEntry],
      person,
      office,
      targetDateKey: committedEntry.dateKey,
      targetDateLabel: committedEntry.dateLabel,
      policyOverride,
    }), { client })

    await writeLocalScanEvent(buildScanEventRecord({
      ...scanEventContext,
      status: committedEntry.fieldDutyStatus === 'pending' ? 'pending' : 'accepted',
      entry: committedEntry,
      person,
    }), { client })
    await upsertLocalAttendanceLock(
      committedEntry,
      stored.attendanceId,
      stored.entryPreview,
      { client },
    )

    return {
      ok: true,
      action: nextAction,
      storedEntry: stored.storedEntry,
      entryPreview: stored.entryPreview,
    }
  })
}
