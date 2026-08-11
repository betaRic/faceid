import { formatAttendanceDateKey } from '@/lib/attendance-time'

export function createSummarySlice(set, get) {
  const today = formatAttendanceDateKey(Date.now())

  return {
    todayIso: today,
    summaryDate: today,
    summaryOfficeFilter: 'all',
    summaryDivisionFilter: 'all',
    summaryEmployeeFilter: 'all',
    summaryQuery: '',
    summaryRows: [],
    summaryLoading: false,
    setSummaryDate: (value) => set({ summaryDate: value }),
    setSummaryOfficeFilter: (value) => set({
      summaryOfficeFilter: value,
      summaryDivisionFilter: 'all',
      summaryEmployeeFilter: 'all',
    }),
    setSummaryDivisionFilter: (value) => set({ summaryDivisionFilter: value }),
    setSummaryEmployeeFilter: (value) => set({ summaryEmployeeFilter: value }),
    setSummaryQuery: (value) => set({ summaryQuery: value }),
    setSummaryRows: (rows) => set((state) => {
      let filtered = rows || []
      if (state.summaryEmployeeFilter !== 'all') {
        filtered = filtered.filter((row) => row.employeeId === state.summaryEmployeeFilter)
      }
      if (state.summaryDivisionFilter !== 'all') filtered = filtered.filter(row => row.divisionId === state.summaryDivisionFilter)
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
