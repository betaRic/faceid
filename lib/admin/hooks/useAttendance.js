import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '../store'
import { formatAttendanceDateKey, formatAttendanceDateLabel } from '@/lib/attendance-time'

export function useAttendance() {
  const store = useAdminStore(useShallow((state) => ({
    attendance: state.attendance,
    attendanceLoaded: state.attendanceLoaded,
    roleScope: state.roleScope,
    selectedOfficeId: state.selectedOfficeId,
    setAttendance: state.setAttendance,
    setAttendanceLoaded: state.setAttendanceLoaded,
  })))
  const abortRef = useRef(null)
  const {
    attendance,
    attendanceLoaded,
    roleScope,
    selectedOfficeId,
    setAttendance,
    setAttendanceLoaded,
  } = store
  const todaysLogs = useMemo(() => {
    const todayKey = formatAttendanceDateKey(Date.now())
    const todayLabel = formatAttendanceDateLabel(Date.now())
    return attendance.filter((entry) => {
      const matchesScope = roleScope === 'regional' || entry.officeId === selectedOfficeId
      return matchesScope && (entry.dateKey === todayKey || entry.date === todayLabel)
    })
  }, [attendance, roleScope, selectedOfficeId])

  const fetchAttendance = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/attendance/recent', { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        setAttendance(data)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load attendance:', err)
      }
    }
    setAttendanceLoaded(true)
  }, [setAttendance, setAttendanceLoaded])

  useEffect(() => {
    fetchAttendance()
  }, [])

  return {
    attendance,
    attendanceLoaded,
    todaysLogs,
    reload: fetchAttendance,
  }
}
