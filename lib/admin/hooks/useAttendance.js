import { useCallback, useEffect, useRef } from 'react'
import { useAdminStore } from '../store'

export function useAttendance() {
  const store = useAdminStore()
  const abortRef = { current: null }

  const fetchAttendance = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/attendance/recent', { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        store.setAttendance(data)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load attendance:', err)
      }
    }
    store.setAttendanceLoaded(false)
  }, [])

  useEffect(() => {
    fetchAttendance()
  }, [])

  return {
    attendance: store.attendance,
    attendanceLoaded: store.attendanceLoaded,
    todaysLogs: store.getTodaysLogs(),
    reload: fetchAttendance,
  }
}
