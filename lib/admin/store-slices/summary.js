import { formatAttendanceDateKey } from '@/lib/attendance-time'

export function createSummarySlice(set, get) {
  const today = formatAttendanceDateKey(Date.now())

  return {
    todayIso: today,
    summaryDate: today,
    summaryOfficeFilter: 'all',
    summaryEmployeeFilter: 'all',
    summaryRows: [],
    summaryLoading: false,
    setSummaryDate: (value) => set({ summaryDate: value }),
    setSummaryOfficeFilter: (value) => set({ summaryOfficeFilter: value }),
    setSummaryEmployeeFilter: (value) => set({ summaryEmployeeFilter: value }),
    setSummaryRows: (rows) => set((state) => {
      let filtered = rows || []
      if (state.summaryEmployeeFilter !== 'all') {
        filtered = filtered.filter((row) => row.employeeId === state.summaryEmployeeFilter)
      }
      return { summaryRows: filtered }
    }),
    setSummaryLoading: (value) => set({ summaryLoading: value }),
    getSummaryEmployeeOptions: () => {
      const { summaryRows } = get()
      const seen = new Set()
      return summaryRows
        .filter((row) => !seen.has(row.employeeId) && seen.add(row.employeeId))
        .map((row) => ({
          employeeId: row.employeeId,
          name: row.name,
        }))
    },
  }
}
