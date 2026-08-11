export function createEmployeesSlice(set) {
  return {
    employees: [],
    employeesLoaded: false,
    employeeQuery: '',
    employeeOfficeFilter: 'all',
    employeeDivisionFilter: 'all',
    employeeStatusFilter: 'all',
    employeeApprovalFilter: 'all',
    employeeCursor: '',
    employeeNextCursor: '',
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
      employeeNextCursor: data.page?.nextCursor || '',
      employeeTotal: data.page?.total || 0,
      employeeApprovedCount: data.page?.approved || 0,
      employeePendingCount: data.page?.pending || 0,
      employeeRejectedCount: data.page?.rejected || 0,
    }),
    setEmployeesLoaded: (value) => set({ employeesLoaded: value }),
    setEmployeeQuery: (query) => set({
      employeeQuery: query,
      employeeCursor: '',
      employeeNextCursor: '',
      employeeHistory: [],
    }),
    setEmployeeOfficeFilter: (value) => set({
      employeeOfficeFilter: value,
      employeeDivisionFilter: 'all',
      employeeCursor: '',
      employeeNextCursor: '',
      employeeHistory: [],
    }),
    setEmployeeDivisionFilter: (value) => set({
      employeeDivisionFilter: value,
      employeeCursor: '',
      employeeNextCursor: '',
      employeeHistory: [],
    }),
    setEmployeeStatusFilter: (value) => set({
      employeeStatusFilter: value,
      employeeCursor: '',
      employeeNextCursor: '',
      employeeHistory: [],
    }),
    setEmployeeApprovalFilter: (value) => set({
      employeeApprovalFilter: value,
      employeeCursor: '',
      employeeNextCursor: '',
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
      employeeNextCursor: '',
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
