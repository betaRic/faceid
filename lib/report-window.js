const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

function parseDateKey(value) {
  const match = String(value || '').trim().match(DATE_KEY_PATTERN)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const normalized = new Date(Date.UTC(year, month - 1, day))
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) {
    return null
  }

  return {
    year,
    month,
    day,
    dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

function parseMonthKey(value) {
  const match = String(value || '').trim().match(MONTH_KEY_PATTERN)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { year, month, monthKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}` }
}

function toPhtStartUtcMs(dateParts) {
  return Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, -8, 0, 0, 0)
}

function dateKeyFromPhtStartMs(ms) {
  const date = new Date(ms + (8 * 60 * 60 * 1000))
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function addDaysToDateKey(dateKey, days) {
  const parsed = parseDateKey(dateKey)
  if (!parsed) return ''
  return dateKeyFromPhtStartMs(toPhtStartUtcMs(parsed) + (Number(days || 0) * MS_PER_DAY))
}

function buildWindow({
  mode,
  label,
  startMs,
  endMs,
  fromDateKey,
  toDateKey,
  endDateExclusive,
}) {
  const windowDays = Math.max(1, Math.round((endMs - startMs) / MS_PER_DAY))
  return {
    mode,
    label,
    startMs,
    endMs,
    startUtc: new Date(startMs).toISOString(),
    endUtcExclusive: new Date(endMs).toISOString(),
    fromDateKey,
    toDateKey,
    endDateExclusive,
    windowDays,
    explicit: mode !== 'recent-days',
  }
}

export function resolveReportWindow(searchParams, options = {}) {
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now()
  const defaultDays = clamp(options.defaultDays ?? 14, 1, options.maxDays ?? 62)
  const maxDays = clamp(options.maxDays ?? 62, 1, 366)
  const params = searchParams || new URLSearchParams()

  const exactDate = parseDateKey(params.get('date'))
  if (exactDate) {
    const startMs = toPhtStartUtcMs(exactDate)
    const endDateExclusive = addDaysToDateKey(exactDate.dateKey, 1)
    const endMs = toPhtStartUtcMs(parseDateKey(endDateExclusive))
    return buildWindow({
      mode: 'date',
      label: exactDate.dateKey,
      startMs,
      endMs,
      fromDateKey: exactDate.dateKey,
      toDateKey: exactDate.dateKey,
      endDateExclusive,
    })
  }

  const month = parseMonthKey(params.get('month'))
  if (month) {
    const startDateKey = `${month.monthKey}-01`
    const endDateExclusive = month.month === 12
      ? `${String(month.year + 1).padStart(4, '0')}-01-01`
      : `${String(month.year).padStart(4, '0')}-${String(month.month + 1).padStart(2, '0')}-01`
    const startMs = toPhtStartUtcMs(parseDateKey(startDateKey))
    const endMs = toPhtStartUtcMs(parseDateKey(endDateExclusive))
    return buildWindow({
      mode: 'month',
      label: month.monthKey,
      startMs,
      endMs,
      fromDateKey: startDateKey,
      toDateKey: addDaysToDateKey(endDateExclusive, -1),
      endDateExclusive,
    })
  }

  const fromDate = parseDateKey(params.get('from'))
  const toDate = parseDateKey(params.get('to'))
  if (fromDate || toDate) {
    const fallbackEndKey = dateKeyFromPhtStartMs(now)
    const startDateKey = fromDate?.dateKey || fallbackEndKey
    const inclusiveToKey = toDate?.dateKey || startDateKey
    const startMs = toPhtStartUtcMs(parseDateKey(startDateKey))
    const endDateExclusive = addDaysToDateKey(inclusiveToKey, 1)
    const endMs = toPhtStartUtcMs(parseDateKey(endDateExclusive))
    if (endMs > startMs) {
      return buildWindow({
        mode: 'range',
        label: startDateKey === inclusiveToKey ? startDateKey : `${startDateKey} to ${inclusiveToKey}`,
        startMs,
        endMs,
        fromDateKey: startDateKey,
        toDateKey: inclusiveToKey,
        endDateExclusive,
      })
    }
  }

  const days = clamp(params.get('days') || defaultDays, 1, maxDays)
  const endMs = now
  const startMs = now - (days * MS_PER_DAY)
  return buildWindow({
    mode: 'recent-days',
    label: `Last ${days} day${days === 1 ? '' : 's'}`,
    startMs,
    endMs,
    fromDateKey: dateKeyFromPhtStartMs(startMs),
    toDateKey: dateKeyFromPhtStartMs(endMs),
    endDateExclusive: '',
  })
}

