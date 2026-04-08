function parseTimeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number)
  return (hours * 60) + minutes
}

function toMinutesFromTimestamp(timestamp) {
  const date = new Date(timestamp)
  return (date.getHours() * 60) + date.getMinutes()
}

function formatMinutes(value) {
  if (value == null) return '--'

  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

function formatClock(timestamp) {
  if (!timestamp) return '--'

  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function buildEmptySegments() {
  return {
    amIn: null,
    amOut: null,
    pmIn: null,
    pmOut: null,
  }
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
    .forEach(log => {
      const minuteOfDay = toMinutesFromTimestamp(log.timestamp)

      if (minuteOfDay <= morningEnd) {
        if (!segments.amIn) segments.amIn = log
        segments.amOut = log
        return
      }

      // Treat scans between lunch boundaries as the morning exit instead of discarding them.
      if (minuteOfDay < afternoonStart) {
        if (segments.amIn) {
          segments.amOut = log
        }
        return
      }

      if (minuteOfDay >= afternoonStart) {
        if (!segments.pmIn) segments.pmIn = log
        segments.pmOut = log
      }
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

function computeLateMinutes(segments, office) {
  if (!segments.amIn || !office?.workPolicy) return 0

  const target = parseTimeToMinutes(office.workPolicy.morningIn) + office.workPolicy.gracePeriodMinutes
  return Math.max(0, toMinutesFromTimestamp(segments.amIn.timestamp) - target)
}

function computeUndertimeMinutes(segments, office) {
  if (!office?.workPolicy) return 0

  const morningTarget = parseTimeToMinutes(office.workPolicy.morningOut)
  const afternoonTarget = parseTimeToMinutes(office.workPolicy.afternoonOut)

  let undertime = 0

  if (segments.amOut) undertime += Math.max(0, morningTarget - toMinutesFromTimestamp(segments.amOut.timestamp))
  if (segments.pmOut) undertime += Math.max(0, afternoonTarget - toMinutesFromTimestamp(segments.pmOut.timestamp))

  return undertime
}

export function getNextAttendanceAction(logs, office) {
  const segments = computeSegmentTimes(logs, office)

  if (!segments.amIn) return 'checkin'
  if (!segments.amOut) return 'checkout'
  if (!segments.pmIn) return 'checkin'
  if (!segments.pmOut) return 'checkout'

  return 'checkout'
}

export function deriveDailyAttendanceRecord({ logs, person, office, targetDate }) {
  const segments = computeSegmentTimes(logs, office)
  const workingMinutes = computeWorkingMinutes(segments)
  const lateMinutes = computeLateMinutes(segments, office)
  const undertimeMinutes = computeUndertimeMinutes(segments, office)
  const status = workingMinutes === 0
    ? 'No complete logs'
    : undertimeMinutes > 0
      ? 'Undertime'
      : lateMinutes > 0
        ? 'Late'
        : 'Complete'

  return {
    employeeId: person?.employeeId || '--',
    name: person?.name || logs[0]?.name || 'Unknown employee',
    officeId: office?.id || person?.officeId || logs[0]?.officeId || '',
    officeName: office?.name || logs[0]?.officeName || person?.officeName || 'Unassigned',
    date: targetDate,
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
