export function createEmployeesSlice(set) {
  return {
    employees: [],
    employeesLoaded: false,
    employeeQuery: '',
    employeeOfficeFilter: 'all',
    employeeStatusFilter: 'all',
    employeeApprovalFilter: 'all',
    employeeCursor: '',
    employeeHistory: [],
    employeeHasMore: false,
    employeeTotal: 0,
    employeeApprovedCount: 0,
    employeePendingCount: 0,
    employeeRejectedCount: 0,
    employeeRefreshKey: 0,
    setEmployees: (data) => set({
      employees: data.persons || [],
      employeesLoaded: true,
      employeeHasMore: data.page?.hasMore || false,
      employeeCursor: data.page?.nextCursor || '',
      employeeTotal: data.page?.total || 0,
      employeeApprovedCount: data.page?.approved || 0,
      employeePendingCount: data.page?.pending || 0,
      employeeRejectedCount: data.page?.rejected || 0,
    }),
    setEmployeesLoaded: (value) => set({ employeesLoaded: value }),
    setEmployeeQuery: (query) => set({
      employeeQuery: query,
      employeeCursor: '',
      employeeHistory: [],
    }),
    setEmployeeOfficeFilter: (value) => set({
      employeeOfficeFilter: value,
      employeeCursor: '',
      employeeHistory: [],
    }),
    setEmployeeStatusFilter: (value) => set({
      employeeStatusFilter: value,
      employeeCursor: '',
      employeeHistory: [],
    }),
    setEmployeeApprovalFilter: (value) => set({
      employeeApprovalFilter: value,
      employeeCursor: '',
      employeeHistory: [],
    }),
    setEmployeeCursor: (cursor, addToHistory = false) => set((state) => ({
      employeeCursor: cursor,
      employeeHistory: addToHistory
        ? [...state.employeeHistory, state.employeeCursor]
        : state.employeeHistory,
    })),
    refreshEmployees: () => set((state) => ({
      employeeRefreshKey: state.employeeRefreshKey + 1,
      employeeCursor: '',
      employeeHistory: [],
    })),
    goToPreviousPage: () => set((state) => {
      const nextHistory = [...state.employeeHistory]
      const previousCursor = nextHistory.pop() || ''
      return {
        employeeCursor: previousCursor,
        employeeHistory: nextHistory,
      }
    }),
  }
}
