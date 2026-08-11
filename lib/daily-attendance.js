function parseTimeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number)
  return (hours * 60) + minutes
}

const ATTENDANCE_TIME_ZONE = 'Asia/Manila'
const FULL_DAY_WORK_MINUTES = 8 * 60

const attendanceMinutePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ATTENDANCE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const attendanceClockFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: ATTENDANCE_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

function toAttendanceMinutesFromTimestamp(timestamp) {
  const parts = attendanceMinutePartsFormatter.formatToParts(new Date(timestamp))
  const hours = Number(parts.find(part => part.type === 'hour')?.value ?? NaN)
  const minutes = Number(parts.find(part => part.type === 'minute')?.value ?? NaN)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return (hours * 60) + minutes
}

function toMinutesFromTimestamp(timestamp) {
  return toAttendanceMinutesFromTimestamp(timestamp)
}

function formatMinutes(value) {
  if (value == null) return '--'
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

function formatClock(timestamp) {
  if (!timestamp) return '--'
  return attendanceClockFormatter.format(new Date(timestamp))
}

function buildEmptySegments() {
  return {
    amIn: null,
    amOut: null,
    pmIn: null,
    pmOut: null,
  }
}

function getAttendanceAction(log) {
  const action = String(log?.action || '').trim().toLowerCase()
  return action === 'checkin' || action === 'checkout' ? action : ''
}

function hasMorningSegment(segments) {
  return Boolean(segments.amIn || segments.amOut)
}

function hasAfternoonSegment(segments) {
  return Boolean(segments.pmIn || segments.pmOut)
}

function hasDistinctMorningOut(segments) {
  return Boolean(segments.amOut && segments.amOut !== segments.amIn)
}

function assignCheckInSegment(segments, log, minuteOfDay, morningEnd) {
  const shouldUseAfternoon = (
    minuteOfDay > morningEnd ||
    hasDistinctMorningOut(segments) ||
    hasAfternoonSegment(segments)
  )

  if (shouldUseAfternoon) {
    if (!segments.pmIn) segments.pmIn = log
    return
  }

  if (!segments.amIn) segments.amIn = log
}

function assignCheckOutSegment(segments, log, minuteOfDay, afternoonStart) {
  const shouldUseAfternoon = (
    minuteOfDay >= afternoonStart ||
    hasAfternoonSegment(segments)
  )

  if (shouldUseAfternoon) {
    if (!segments.pmIn && segments.amIn && !hasDistinctMorningOut(segments)) {
      segments.pmIn = log
      return
    }

    segments.pmOut = log
    return
  }

  segments.amOut = log
}

function assignLegacySegment(segments, log, minuteOfDay, morningEnd, afternoonStart) {
  if (minuteOfDay <= morningEnd) {
    if (!segments.amIn) segments.amIn = log
    segments.amOut = log
    return
  }

  if (minuteOfDay < afternoonStart) {
    if (segments.amIn && !hasDistinctMorningOut(segments)) {
      segments.amOut = log
      return
    }

    if (!segments.pmIn) segments.pmIn = log
    segments.pmOut = log
    return
  }

  if (!segments.pmIn) segments.pmIn = log
  segments.pmOut = log
}

function computeSegmentTimes(logs, office) {
  const policy = office?.workPolicy
  if (!policy) return buildEmptySegments()

  const morningEnd = parseTimeToMinutes(policy.morningOut)
  const afternoonStart = parseTimeToMinutes(policy.afternoonIn)
  const segments = buildEmptySegments()

  logs
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter(log => String(log?.fieldDutyStatus || '').toLowerCase() !== 'pending')
    .forEach(log => {
      const minuteOfDay = toMinutesFromTimestamp(log.timestamp)
      const action = getAttendanceAction(log)

      if (action === 'checkin') {
        assignCheckInSegment(segments, log, minuteOfDay, morningEnd)
        return
      }

      if (action === 'checkout') {
        assignCheckOutSegment(segments, log, minuteOfDay, afternoonStart)
        return
      }

      assignLegacySegment(segments, log, minuteOfDay, morningEnd, afternoonStart)
    })

  if (segments.amIn === segments.amOut) segments.amOut = null
  if (segments.pmIn === segments.pmOut) segments.pmOut = null

  return segments
}

function computeWorkingMinutes(segments) {
  let total = 0
  if (segments.amIn && segments.amOut) total += Math.max(0, Math.round((segments.amOut.timestamp - segments.amIn.timestamp) / 60000))
  if (segments.pmIn && segments.pmOut) total += Math.max(0, Math.round((segments.pmOut.timestamp - segments.pmIn.timestamp) / 60000))
  return total
}

function computeLateMinutes(segments, office, flexitime = false) {
  if (flexitime) return 0
  if (!segments.amIn || !office?.workPolicy) return 0
  const target = parseTimeToMinutes(office.workPolicy.morningIn)
  return Math.max(0, toMinutesFromTimestamp(segments.amIn.timestamp) - target)
}

function computeUndertimeMinutes(workingMinutes, requiredMinutes = FULL_DAY_WORK_MINUTES) {
  if (!Number.isFinite(workingMinutes) || workingMinutes <= 0) return 0
  return Math.max(0, requiredMinutes - workingMinutes)
}

function deriveStatus(workingMinutes, lateMinutes, undertimeMinutes) {
  if (workingMinutes === 0) return 'No complete logs'
  if (undertimeMinutes > 0 && lateMinutes > 0) return 'Late / Undertime'
  if (undertimeMinutes > 0) return 'Undertime'
  if (lateMinutes > 0) return 'Late'
  return 'Complete'
}

function buildSegmentsFromDailyRecord(record) {
  return {
    amIn: record?.amInTimestamp ? { timestamp: Number(record.amInTimestamp) } : null,
    amOut: record?.amOutTimestamp ? { timestamp: Number(record.amOutTimestamp) } : null,
    pmIn: record?.pmInTimestamp ? { timestamp: Number(record.pmInTimestamp) } : null,
    pmOut: record?.pmOutTimestamp ? { timestamp: Number(record.pmOutTimestamp) } : null,
  }
}

export function recalculateDailyAttendanceMetrics(record, office) {
  const segments = buildSegmentsFromDailyRecord(record)
  const workingMinutes = computeWorkingMinutes(segments)
  const lateMinutes = computeLateMinutes(segments, office)
  const undertimeMinutes = computeUndertimeMinutes(workingMinutes)

  return {
    ...record,
    lateMinutes,
    undertimeMinutes,
    undertime: undertimeMinutes,
    workingMinutes,
    workingHours: formatMinutes(workingMinutes),
    status: deriveStatus(workingMinutes, lateMinutes, undertimeMinutes),
  }
}

/**
 * Returns the next expected attendance action for an employee.
 *
 * 'checkin'  — employee needs to scan in (start of AM or PM session)
 * 'checkout' — employee needs to scan out (end of AM or PM session)
 * 'complete' — full AM+PM day already recorded; attendance route blocks further scans
 *
 * FIXED: was incorrectly returning 'checkout' on a complete day, allowing a 5th scan.
 */
export function getNextAttendanceAction(logs, office, timestamp = Date.now(), policyOverride = null) {
  if (!office?.workPolicy) {
    throw new Error('Office work policy is not configured. Contact admin to set up office schedule.')
  }

  const effectiveOffice = policyOverride?.schedule
    ? { ...office, workPolicy: { ...(office?.workPolicy || {}), ...policyOverride.schedule } }
    : office
  const segments = computeSegmentTimes(logs, effectiveOffice)
  const afternoonStart = parseTimeToMinutes(effectiveOffice.workPolicy.afternoonIn)
  const currentMinuteOfDay = toMinutesFromTimestamp(timestamp)

  // A flexitime employee may legitimately use a continuous two-punch day
  // (for example 06:00 to 17:00). Do not force that second scan into PM-in
  // once the required daily minutes have already been completed.
  const requiredMinutes = Number(policyOverride?.flexitime?.requiredMinutes)
  if (policyOverride?.flexitime?.enabled === true && segments.amIn && !segments.amOut && !segments.pmIn && Number.isFinite(requiredMinutes) && requiredMinutes > 0) {
    const elapsedMinutes = Math.max(0, Math.round((timestamp - segments.amIn.timestamp) / 60000))
    if (elapsedMinutes >= requiredMinutes) return 'checkout'
  }

  if (segments.pmIn && !segments.pmOut) return 'checkout'
  if (!hasMorningSegment(segments) && segments.pmOut) return 'complete'
  if (!segments.amIn) return 'checkin'
  if (!segments.amOut && !segments.pmIn && currentMinuteOfDay >= afternoonStart) return 'checkin'
  if (!segments.amOut) return 'checkout'
  if (!segments.pmIn) return 'checkin'
  if (!segments.pmOut) return 'checkout'

  // Full AM+PM day recorded — attendance route returns 409 blocked_day_complete
  return 'complete'
}

export function deriveDailyAttendanceRecord({
  logs,
  person,
  office,
  targetDateKey,
  targetDateLabel = targetDateKey,
  policyOverride = null,
}) {
  const effectiveOffice = policyOverride?.schedule
    ? { ...office, workPolicy: { ...(office?.workPolicy || {}), ...policyOverride.schedule } }
    : office
  const segments = computeSegmentTimes(logs, effectiveOffice)
  const scheduledMinutes = policyOverride?.schedule
    ? Math.max(0, parseTimeToMinutes(policyOverride.schedule.morningOut) - parseTimeToMinutes(policyOverride.schedule.morningIn))
      + Math.max(0, parseTimeToMinutes(policyOverride.schedule.afternoonOut) - parseTimeToMinutes(policyOverride.schedule.afternoonIn))
    : FULL_DAY_WORK_MINUTES
  const flexiRequiredMinutes = Number(policyOverride?.flexitime?.requiredMinutes)
  const requiredMinutes = policyOverride?.flexitime?.enabled === true && Number.isFinite(flexiRequiredMinutes) && flexiRequiredMinutes > 0
    ? flexiRequiredMinutes
    : scheduledMinutes
  // A continuous flexitime day can legitimately have only a start and end
  // scan. The generic AM/PM segmenter puts a late checkout into PM-out; pair
  // it with AM-in when it satisfies the configured flexitime requirement.
  const continuousEnd = !segments.amOut && !segments.pmOut ? segments.pmIn : segments.pmOut
  if (policyOverride?.flexitime?.enabled === true && segments.amIn && !segments.amOut && continuousEnd) {
    const elapsedMinutes = Math.max(0, Math.round((continuousEnd.timestamp - segments.amIn.timestamp) / 60000))
    if (elapsedMinutes >= requiredMinutes) {
      segments.amOut = continuousEnd
      segments.pmIn = null
      segments.pmOut = null
    }
  }
  const workingMinutes = computeWorkingMinutes(segments)
  const lateMinutes = computeLateMinutes(segments, effectiveOffice, policyOverride?.flexitime?.enabled === true)
  const undertimeMinutes = computeUndertimeMinutes(workingMinutes, requiredMinutes)
  const status = deriveStatus(workingMinutes, lateMinutes, undertimeMinutes)

  return {
    personId: person?.id || person?.personId || logs[0]?.personId || '',
    employeeId: person?.employeeId || logs[0]?.employeeId || '--',
    name: person?.name || logs[0]?.name || 'Unknown employee',
    officeId: effectiveOffice?.id || person?.officeId || logs[0]?.officeId || '',
    officeName: effectiveOffice?.name || logs[0]?.officeName || person?.officeName || 'Unassigned',
    divisionId: person?.divisionId || '',
    divisionName: person?.divisionName || '',
    dateKey: targetDateKey,
    date: targetDateKey,
    dateLabel: targetDateLabel,
    amInTimestamp: segments.amIn?.timestamp || null,
    amOutTimestamp: segments.amOut?.timestamp || null,
    pmInTimestamp: segments.pmIn?.timestamp || null,
    pmOutTimestamp: segments.pmOut?.timestamp || null,
    amIn: formatClock(segments.amIn?.timestamp),
    amOut: formatClock(segments.amOut?.timestamp),
    pmIn: formatClock(segments.pmIn?.timestamp),
    pmOut: formatClock(segments.pmOut?.timestamp),
    lateMinutes,
    undertimeMinutes,
    workingMinutes,
    workingHours: formatMinutes(workingMinutes),
    status,
    logCount: logs.length,
    decisionCodes: Array.from(new Set(logs.map(log => log.decisionCode).filter(Boolean))),
    updatedAtMs: Date.now(),
  }
}
