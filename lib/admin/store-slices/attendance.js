import { formatAttendanceDateKey, formatAttendanceDateLabel } from '@/lib/attendance-time'

export function createAttendanceSlice(set, get) {
  return {
    attendance: [],
    attendanceLoaded: false,
    setAttendance: (data) => set({
      attendance: data.attendance || [],
      attendanceLoaded: true,
    }),
    setAttendanceLoaded: (value) => set({ attendanceLoaded: value }),
    getTodaysLogs: () => {
      const { attendance, roleScope, selectedOfficeId } = get()
      const todayKey = formatAttendanceDateKey(Date.now())
      const todayLabel = formatAttendanceDateLabel(Date.now())

      return attendance.filter((entry) => {
        const matchesScope = roleScope === 'regional' || entry.officeId === selectedOfficeId
        return matchesScope && (entry.dateKey === todayKey || entry.date === todayLabel)
      })
    },
  }
}
