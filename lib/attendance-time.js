export const ATTENDANCE_TIME_ZONE = 'Asia/Manila'

const attendanceDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ATTENDANCE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const attendanceDateLabelFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: ATTENDANCE_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const attendanceTimeLabelFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: ATTENDANCE_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

export function formatAttendanceDateKey(timestamp) {
  return attendanceDateKeyFormatter.format(new Date(timestamp))
}

export function formatAttendanceDateLabel(timestamp) {
  return attendanceDateLabelFormatter.format(new Date(timestamp))
}

export function formatAttendanceTimeLabel(timestamp) {
  return attendanceTimeLabelFormatter.format(new Date(timestamp))
}

export function buildAttendanceStamp(timestamp = Date.now()) {
  return {
    timestamp,
    dateKey: formatAttendanceDateKey(timestamp),
    dateLabel: formatAttendanceDateLabel(timestamp),
    timeLabel: formatAttendanceTimeLabel(timestamp),
  }
}

export function buildAttendanceEntryTiming(timestamp = Date.now()) {
  const stamp = buildAttendanceStamp(timestamp)

  return {
    timestamp: stamp.timestamp,
    dateKey: stamp.dateKey,
    date: stamp.dateLabel,
    dateLabel: stamp.dateLabel,
    time: stamp.timeLabel,
  }
}

export function toLegacyAttendanceDate(dateKey) {
  const match = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''

  const [, year, month, day] = match
  return `${Number(month)}/${Number(day)}/${year}`
}

export function isAttendanceDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}
