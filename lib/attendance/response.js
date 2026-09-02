const HR_RECENT_ATTENDANCE_FIELDS = [
  'id', 'employeeId', 'personId', 'name', 'officeId', 'officeName',
  'action', 'timestamp', 'dateKey', 'dateLabel', 'date', 'time',
  'attendanceMode', 'decisionCode', 'confidence', 'source', 'manualSlot', 'fieldDutyStatus',
]

const HR_CORRECTION_ATTENDANCE_FIELDS = [...HR_RECENT_ATTENDANCE_FIELDS, 'overrideReason']

function serializeScalarAttendance(entry, fields) {
  return Object.fromEntries(fields
    .map(field => [field, entry?.[field]])
    .filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value)))
}

export function serializeHrRecentAttendance(entry) {
  return serializeScalarAttendance(entry, HR_RECENT_ATTENDANCE_FIELDS)
}

export function serializeHrCorrectionAttendance(entry) {
  return serializeScalarAttendance(entry, HR_CORRECTION_ATTENDANCE_FIELDS)
}
