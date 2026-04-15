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

export const DTR_DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

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
    const dateObj = inMonth ? new Date(year, month - 1, day) : null
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
      dayOfWeek: inMonth && dateObj ? DTR_DAY_NAMES[dateObj.getDay()] : '',
      inMonth,
      isWeekend: inMonth && dateObj ? [0, 6].includes(dateObj.getDay()) : false,
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

  return {
    form: 'CSC Form 48',
    title: 'DAILY TIME RECORD',
    employee: {
      id: employee?.id || employee?.employeeId || '',
      name: employee?.name || '',
      employeeId: employee?.employeeId || '',
      position: employee?.position || '',
      office: employee?.office || '',
    },
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
