import { resolveOfficeSignatory, findOfficeDivision } from '@/lib/offices'
import { normalizePersonNamePart } from '@/lib/person-name'

export const DTR_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const DTR_DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

const DTR_DAY_DISPLAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FAMILY_NAME_PARTICLES = new Set(['DA', 'DE', 'DEL', 'DELA', 'DELOS', 'DI', 'DOS', 'LA', 'LAS', 'SAN', 'SANTA', 'VAN', 'VON'])

export const DTR_RANGE_OPTIONS = [
  { value: 'full', label: '1st - 30th/31st' },
  { value: '1-15', label: '1st - 15th' },
  { value: '16-end', label: '16th - 30th/31st' },
  { value: 'custom', label: 'Custom Range' },
]

export const DTR_PANEL_DEFINITIONS = [
  { key: 'first', startDay: 1, endDay: 15, label: '1 - 15' },
  { key: 'second', startDay: 16, endDay: 31, label: '16 - 31' },
]

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function getDtrCalendarDay(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function buildDtrRangeSpec({
  month,
  year,
  range = 'full',
  customStartDay,
  customEndDay,
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const normalizedRange = ['1-15', '16-end', 'custom', 'full'].includes(range) ? range : 'full'

  let startDay = 1
  let endDay = daysInMonth

  if (normalizedRange === '1-15') {
    endDay = Math.min(15, daysInMonth)
  } else if (normalizedRange === '16-end') {
    startDay = Math.min(16, daysInMonth)
  } else if (normalizedRange === 'custom') {
    startDay = clampDtrDay(customStartDay, daysInMonth, 1)
    endDay = clampDtrDay(customEndDay, daysInMonth, daysInMonth)
    if (startDay > endDay) {
      [startDay, endDay] = [endDay, startDay]
    }
  }

  return {
    month,
    year,
    range: normalizedRange,
    daysInMonth,
    startDay,
    endDay,
    label: `${startDay}-${endDay}`,
    coversFirstHalf: startDay <= 15,
    coversSecondHalf: endDay >= 16,
  }
}

export function filterAttendanceDaysByRange(days, rangeSpec) {
  return (days || []).filter((day) => {
    const dayNumber = extractDayNumber(day)
    if (!dayNumber) return false
    return dayNumber >= rangeSpec.startDay && dayNumber <= rangeSpec.endDay
  })
}

export function buildDtrDocument({
  employee,
  office = null,
  divisionId = '',
  signatoryOverride = null,
  month,
  year,
  range = 'full',
  customStartDay,
  customEndDay,
  dayRecords = [],
}) {
  const rangeSpec = buildDtrRangeSpec({ month, year, range, customStartDay, customEndDay })
  const lookup = buildDayRecordLookup(dayRecords)
  const rows = []

  for (let day = 1; day <= 31; day++) {
    const inMonth = day <= rangeSpec.daysInMonth
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const calendarDay = inMonth ? getDtrCalendarDay(year, month, day) : null
    const source = inMonth ? lookup.get(dateKey) || lookup.get(day) || lookup.get(String(day)) || null : null
    const isActive = inMonth && day >= rangeSpec.startDay && day <= rangeSpec.endDay
    const hasAnyTime = Boolean(normalizeTimeValue(source?.amIn) || normalizeTimeValue(source?.pmIn))
    const undertime = isActive ? normalizeWholeNumber(source?.undertime) : 0
    const totalHours = isActive
      ? normalizeWholeNumber(source?.totalHours, hasAnyTime ? Math.max(0, 480 - undertime) : 0)
      : 0

    rows.push({
      day,
      dateKey,
      panel: day <= 15 ? 'first' : 'second',
      dayOfWeek: inMonth && calendarDay !== null ? DTR_DAY_NAMES[calendarDay] : '',
      inMonth,
      isWeekend: inMonth && calendarDay !== null ? [0, 6].includes(calendarDay) : false,
      isActive,
      isDisabled: !inMonth || !isActive,
      amIn: isActive ? normalizeTimeValue(source?.amIn) : '',
      amOut: isActive ? normalizeTimeValue(source?.amOut) : '',
      pmIn: isActive ? normalizeTimeValue(source?.pmIn) : '',
      pmOut: isActive ? normalizeTimeValue(source?.pmOut) : '',
      undertime,
      undertimeHours: undertime > 0 ? Math.floor(undertime / 60) : '',
      undertimeMinutes: undertime > 0 ? undertime % 60 : '',
      totalHours,
      manualEntries: isActive && Array.isArray(source?.manualEntries)
        ? source.manualEntries.map(entry => ({
            time: String(entry?.time || '').trim(),
            action: String(entry?.action || '').trim(),
            remark: String(entry?.remark || '').trim(),
          })).filter(entry => entry.remark)
        : [],
      timeLogEntries: isActive
        ? (Array.isArray(source?.timeLogEntries) && source.timeLogEntries.length > 0
          ? source.timeLogEntries
          : (source?.manualEntries || []).map(entry => ({ ...entry, source: 'Manual override' })))
          .map(entry => ({
            time: String(entry?.time || '').trim(),
            action: String(entry?.action || '').trim(),
            source: String(entry?.source || 'System scan').trim(),
            remark: String(entry?.remark || '').trim(),
            timestamp: Number(entry?.timestamp || 0),
          })).filter(entry => entry.time || entry.action || entry.remark)
        : [],
      remarks: isActive && Array.isArray(source?.remarks)
        ? [...new Set(source.remarks.map(value => String(value || '').trim()).filter(Boolean))]
        : [],
    })
  }

  const panels = DTR_PANEL_DEFINITIONS.map((panel) => {
    const panelRows = rows.filter((row) => row.panel === panel.key)
    return {
      ...panel,
      rows: panelRows,
      summary: summarizeDtrRows(panelRows),
      hasActiveRows: panelRows.some((row) => row.isActive),
    }
  })

  const resolvedDivisionId = String(divisionId || employee?.divisionId || '').trim()
  const division = office && resolvedDivisionId ? findOfficeDivision(office, resolvedDivisionId) : null
  const autoSignatory = office ? resolveOfficeSignatory(office, resolvedDivisionId) : { name: '', position: '' }
  const overrideName = String(signatoryOverride?.name || '').trim()
  const overridePosition = String(signatoryOverride?.position || '').trim()
  const signatorySource = (overrideName || overridePosition)
    ? { name: overrideName, position: overridePosition }
    : autoSignatory
  const signatory = {
    ...signatorySource,
    name: normalizePersonNamePart(signatorySource?.name),
  }

  return {
    form: 'CSC Form 48',
    title: 'DAILY TIME RECORD',
    employee: {
      id: employee?.id || employee?.employeeId || '',
      name: normalizePersonNamePart(employee?.name),
      nameParts: splitDtrEmployeeName(employee),
      employeeId: employee?.employeeId || '',
      position: employee?.position || '',
      office: employee?.office || '',
      divisionId: resolvedDivisionId,
      divisionName: division?.name || employee?.divisionName || '',
      divisionShortName: division?.shortName || '',
    },
    officialHours: resolveDtrOfficialHours(office),
    signatory,
    period: {
      month,
      year,
      monthLabel: DTR_MONTH_NAMES[month - 1] || '',
      periodLabel: `${(DTR_MONTH_NAMES[month - 1] || '').toUpperCase()} ${rangeSpec.startDay}-${rangeSpec.endDay}, ${year}`,
      start: `${month}/${rangeSpec.startDay}/${year}`,
      end: `${month}/${rangeSpec.endDay}/${year}`,
      range: rangeSpec.range,
      rangeLabel: rangeSpec.label,
      customStartDay: rangeSpec.range === 'custom' ? rangeSpec.startDay : null,
      customEndDay: rangeSpec.range === 'custom' ? rangeSpec.endDay : null,
    },
    rangeSpec,
    rows,
    panels,
    summary: summarizeDtrRows(rows),
    manualRemarks: rows.flatMap(row => {
      if (row.manualEntries.length > 0) {
        return row.manualEntries.map(entry => ({ dateKey: row.dateKey, day: row.day, ...entry }))
      }
      return row.remarks.map(remark => ({ dateKey: row.dateKey, day: row.day, time: '', action: '', remark }))
    }),
    timeLogDetails: rows.flatMap(row => row.timeLogEntries.map(entry => ({
      dateKey: row.dateKey,
      day: row.day,
      ...entry,
    }))),
  }
}

export function splitDtrEmployeeName(employee = {}) {
  const familyName = normalizePersonNamePart(employee.familyName || employee.lastName || employee.surname)
  const firstName = normalizePersonNamePart(employee.firstName || employee.givenName)
  const rawName = normalizePersonNamePart(employee.name).replace(/\s+/g, ' ')
  let middleInitial = normalizeMiddleInitial(employee.middleInitial) || deriveMiddleInitial(employee.middleName)

  // Older records can have name parts without middleName while their legacy display name
  // still contains it (for example, "LONARIO, JAN ERIC LANCIOLA"). Preserve the M.I.
  // field in the DTR by taking the first letter of that final given-name token.
  if (!middleInitial && rawName.includes(',')) {
    const givenParts = rawName.split(',').slice(1).join(',').trim().split(/\s+/).filter(Boolean)
    middleInitial = deriveMiddleInitial(givenParts.at(-1) || '')
  }

  if (familyName || firstName || middleInitial) {
    return { familyName, firstName, middleInitial }
  }

  if (!rawName) return { familyName: '', firstName: '', middleInitial: '' }

  if (rawName.includes(',')) {
    const [rawFamilyName, ...rest] = rawName.split(',')
    const givenParts = rest.join(',').trim().split(/\s+/).filter(Boolean)
    const parsedMiddleInitial = normalizeMiddleInitial(givenParts.at(-1) || '')
    const parsedFirstName = parsedMiddleInitial ? givenParts.slice(0, -1).join(' ') : givenParts.join(' ')
    return {
      familyName: rawFamilyName.trim(),
      firstName: parsedFirstName,
      middleInitial: parsedMiddleInitial,
    }
  }

  const parts = rawName.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { familyName: parts[0], firstName: '', middleInitial: '' }

  let familyStart = parts.length - 1
  while (familyStart > 0 && FAMILY_NAME_PARTICLES.has(stripNamePunctuation(parts[familyStart - 1]).toUpperCase())) {
    familyStart -= 1
  }

  const familyTokens = parts.slice(familyStart)
  const givenTokens = parts.slice(0, familyStart)
  const parsedMiddleInitial = normalizeMiddleInitial(givenTokens.at(-1) || '')

  return {
    familyName: familyTokens.join(' '),
    firstName: parsedMiddleInitial ? givenTokens.slice(0, -1).join(' ') : givenTokens.join(' '),
    middleInitial: parsedMiddleInitial,
  }
}

export function resolveDtrOfficialHours(office = null) {
  const policy = office?.workPolicy || {}
  const morningIn = normalizeClockLabel(policy.morningIn || '08:00')
  const morningOut = normalizeClockLabel(policy.morningOut || '12:00')
  const afternoonIn = normalizeClockLabel(policy.afternoonIn || '13:00')
  const afternoonOut = normalizeClockLabel(policy.afternoonOut || '17:00')

  return {
    regularDays: summarizeWorkingDays(policy.workingDays),
    arrivalDeparture: `${morningIn}-${morningOut} to ${afternoonIn}-${afternoonOut}`,
  }
}

export function formatDtrRangeForFilename(rangeSpec) {
  if (!rangeSpec) return 'full'
  if (rangeSpec.range === 'full') return `1-${rangeSpec.daysInMonth}`
  return `${rangeSpec.startDay}-${rangeSpec.endDay}`
}

function clampDtrDay(value, daysInMonth, fallback) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(daysInMonth, Math.max(1, number))
}

function buildDayRecordLookup(dayRecords) {
  const lookup = new Map()

  if (dayRecords instanceof Map) {
    return new Map(dayRecords)
  }

  if (Array.isArray(dayRecords)) {
    dayRecords.forEach((record) => {
      if (!record) return
      if (record.dateKey) lookup.set(record.dateKey, record)
      const dayNumber = extractDayNumber(record)
      if (dayNumber) {
        lookup.set(dayNumber, record)
        lookup.set(String(dayNumber), record)
      }
    })
    return lookup
  }

  if (dayRecords && typeof dayRecords === 'object') {
    Object.entries(dayRecords).forEach(([key, value]) => {
      lookup.set(key, value)
    })
  }

  return lookup
}

function extractDayNumber(record) {
  if (!record) return null
  if (Number.isFinite(Number(record.day))) {
    return Number(record.day)
  }
  if (record.dateKey) {
    const parts = String(record.dateKey).split('-')
    const day = Number.parseInt(parts[2] || '', 10)
    return Number.isFinite(day) ? day : null
  }
  if (record.date) {
    const day = new Date(record.date).getDate()
    return Number.isFinite(day) ? day : null
  }
  return null
}

function normalizeTimeValue(value) {
  if (!value || value === '--') return ''
  return String(value)
}

function normalizeWholeNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed)) return parsed
  return fallback
}

function summarizeWorkingDays(workingDays) {
  const days = Array.isArray(workingDays)
    ? [...new Set(workingDays.map(day => Number.parseInt(day, 10)).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      .sort((a, b) => a - b)
    : []

  const normalized = days.length ? days : [1, 2, 3, 4, 5]
  const isContiguous = normalized.every((day, index) => index === 0 || day === normalized[index - 1] + 1)

  if (isContiguous && normalized.length > 1) {
    return `${DTR_DAY_DISPLAY_NAMES[normalized[0]]}- ${DTR_DAY_DISPLAY_NAMES[normalized[normalized.length - 1]]}`
  }

  return normalized.map(day => DTR_DAY_DISPLAY_NAMES[day]).join(', ')
}

function normalizeClockLabel(value) {
  const [hourPart, minutePart = '00'] = String(value || '').split(':')
  const hour = Number.parseInt(hourPart, 10)
  const minute = Number.parseInt(minutePart, 10)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return String(value || '').trim()
  const normalizedHour = hour % 12 || 12
  return `${normalizedHour}:${String(minute).padStart(2, '0')}`
}

function normalizeMiddleInitial(value) {
  const normalized = stripNamePunctuation(value).trim()
  return /^[A-Za-z]$/.test(normalized) ? normalized.toUpperCase() + '.' : ''
}

function deriveMiddleInitial(value) {
  const normalized = stripNamePunctuation(value).trim()
  const initial = normalized.match(/[A-Za-z]/)?.[0] || ''
  return initial ? initial.toUpperCase() + '.' : ''
}

function stripNamePunctuation(value) {
  return String(value || '').replace(/[.,]/g, '')
}

function summarizeDtrRows(rows) {
  let totalUndertime = 0
  let totalHours = 0
  let daysPresent = 0
  let daysAbsent = 0
  let totalDays = 0

  rows.forEach((row) => {
    if (!row.inMonth || !row.isActive || row.isWeekend) return
    totalDays += 1

    const hasAttendance = Boolean(row.amIn || row.pmIn)
    if (hasAttendance) {
      daysPresent += 1
      totalUndertime += row.undertime || 0
      totalHours += row.totalHours || 0
    } else {
      daysAbsent += 1
    }
  })

  return {
    totalDays,
    daysPresent,
    daysAbsent,
    undertime: totalUndertime,
    totalHours,
  }
}
