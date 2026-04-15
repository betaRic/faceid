export function isPublicAttendanceEnabled() {
  const publicFlag = String(process.env.NEXT_PUBLIC_ENABLE_PUBLIC_ATTENDANCE || '').trim().toLowerCase()
  const serverFlag = String(process.env.PUBLIC_ATTENDANCE_ENABLED || '').trim().toLowerCase()
  return publicFlag === 'true' || serverFlag === 'true'
}
