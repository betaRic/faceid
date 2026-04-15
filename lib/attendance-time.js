export const ATTENDANCE_TIME_ZONE = 'Asia/Manila'

export function getPhNow() {
  return Date.now()
}

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

const attendanceHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ATTENDANCE_TIME_ZONE,
  hour: '2-digit',
  hour12: false,
})

const attendanceMinuteFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ATTENDANCE_TIME_ZONE,
  minute: '2-digit',
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

export function getAttendanceHour(timestamp) {
  return Number.parseInt(attendanceHourFormatter.format(new Date(timestamp)), 10)
}

export function getAttendanceMinute(timestamp) {
  return Number.parseInt(attendanceMinuteFormatter.format(new Date(timestamp)), 10)
}

export function getAttendanceMinutesOfDay(timestamp) {
  return (getAttendanceHour(timestamp) * 60) + getAttendanceMinute(timestamp)
}

export function buildAttendanceStamp(timestamp) {
  const ts = timestamp ?? getPhNow()
  return {
    timestamp: ts,
    dateKey: formatAttendanceDateKey(ts),
    dateLabel: formatAttendanceDateLabel(ts),
    timeLabel: formatAttendanceTimeLabel(ts),
  }
}

export function buildAttendanceEntryTiming(timestamp) {
  const ts = timestamp ?? getPhNow()
  const stamp = buildAttendanceStamp(ts)

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

export function getDayOfWeekPh(timestamp) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ATTENDANCE_TIME_ZONE,
    weekday: 'long',
  })
  return formatter.format(new Date(timestamp ?? getPhNow())).toUpperCase()
}

export function getDayNumberPh(timestamp) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ATTENDANCE_TIME_ZONE,
    weekday: 'numeric',
  })
  return Number(formatter.format(new Date(timestamp ?? getPhNow())))
}

export function isPhWeekend(timestamp) {
  const day = getDayNumberPh(timestamp)
  return day === 0 || day === 6
}

