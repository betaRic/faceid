import { create } from 'zustand'
import { createSessionUiSlice } from './store-slices/session-ui'
import { createOfficesSlice } from './store-slices/offices'
import { createEmployeesSlice } from './store-slices/employees'
import { createAttendanceSlice } from './store-slices/attendance'
import { createAdminsSlice } from './store-slices/admins'
import { createSummarySlice } from './store-slices/summary'

export const useAdminStore = create((set, get) => ({
  ...createSessionUiSlice(set, get),
  ...createOfficesSlice(set, get),
  ...createEmployeesSlice(set, get),
  ...createAttendanceSlice(set, get),
  ...createAdminsSlice(set, get),
  ...createSummarySlice(set, get),

  getEmployeeMetric: () => {
    const { employeesLoaded, employeeTotal, roleScope, offices, selectedOfficeId } = get()

    if (employeesLoaded) {
      return String(employeeTotal).padStart(2, '0')
    }

    if (roleScope === 'regional') {
      return String(
        offices.reduce((total, office) => total + Number(office.employees || 0), 0),
      ).padStart(2, '0')
    }

    const selectedOffice = offices.find((office) => office.id === selectedOfficeId)
    return String(Number(selectedOffice?.employees || 0)).padStart(2, '0')
  },
}))
