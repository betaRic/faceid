function parseTimeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
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

  const morningStart = parseTimeToMinutes(policy.morningIn)
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

      if (minuteOfDay >= afternoonStart) {
        if (!segments.pmIn) segments.pmIn = log
        segments.pmOut = log
      }
    })

  if (segments.amIn === segments.amOut) segments.amOut = null
  if (segments.pmIn === segments.pmOut) segments.pmOut = null

  if (!segments.pmIn && logs.length >= 3) {
    segments.pmIn = logs[logs.length - 2]
  }

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

export function buildAttendanceSummary({ attendance, persons, offices, targetDate }) {
  const grouped = new Map()
  const officesById = new Map(offices.map(office => [office.id, office]))
  const personsByKey = new Map(persons.map(person => [person.employeeId || person.name, person]))

  attendance.forEach(log => {
    if (log.date !== targetDate) return
    const employeeKey = log.employeeId || log.name
    if (!grouped.has(employeeKey)) grouped.set(employeeKey, [])
    grouped.get(employeeKey).push(log)
  })

  return Array.from(grouped.entries()).map(([employeeKey, logs]) => {
    const person = personsByKey.get(employeeKey) || persons.find(item => item.name === logs[0]?.name) || null
    const office = officesById.get(logs[0]?.officeId) || officesById.get(person?.officeId) || null
    const segments = computeSegmentTimes(logs, office)
    const workingMinutes = computeWorkingMinutes(segments)
    const lateMinutes = computeLateMinutes(segments, office)
    const undertimeMinutes = computeUndertimeMinutes(segments, office)

    return {
      employeeId: person?.employeeId || '--',
      name: person?.name || logs[0]?.name || 'Unknown employee',
      officeName: office?.name || logs[0]?.officeName || 'Unassigned',
      amIn: formatClock(segments.amIn?.timestamp),
      amOut: formatClock(segments.amOut?.timestamp),
      pmIn: formatClock(segments.pmIn?.timestamp),
      pmOut: formatClock(segments.pmOut?.timestamp),
      lateMinutes,
      undertimeMinutes,
      workingHours: formatMinutes(workingMinutes),
      status: workingMinutes === 0 ? 'No complete logs' : undertimeMinutes > 0 ? 'Undertime' : lateMinutes > 0 ? 'Late' : 'Complete',
    }
  }).sort((left, right) => left.name.localeCompare(right.name))
}
