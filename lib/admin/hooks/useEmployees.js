import { useCallback, useEffect, useRef } from 'react'
import { useAdminStore } from '../store'
import { updatePersonRecord } from '@/lib/data-store'

const EMPLOYEE_PAGE_SIZE = 24

export function useEmployees() {
  const store = useAdminStore()
  const abortRef = useRef(null)

  const fetchEmployees = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    store.setEmployeesLoaded(false)
    const params = new URLSearchParams({ mode: 'directory', limit: String(EMPLOYEE_PAGE_SIZE) })
    if (store.employeeQuery) params.set('q', store.employeeQuery)
    if (store.employeeOfficeFilter !== 'all') params.set('officeId', store.employeeOfficeFilter)
    if (store.employeeStatusFilter !== 'all') params.set('status', store.employeeStatusFilter)
    if (store.employeeApprovalFilter !== 'all') params.set('approval', store.employeeApprovalFilter)
    if (store.employeeCursor) params.set('cursor', store.employeeCursor)

    try {
      const res = await fetch(`/api/persons?${params.toString()}`, { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        store.setEmployees(data)
      } else {
        store.setEmployees({ persons: [], page: {} })
        store.addToast(data.message || 'Failed to load employees', 'error')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        store.setEmployees({ persons: [], page: {} })
        store.addToast(err?.message || 'Failed to load employees', 'error')
      }
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [
    store.employeeQuery,
    store.employeeOfficeFilter,
    store.employeeStatusFilter,
    store.employeeApprovalFilter,
    store.employeeCursor,
    store.employeeRefreshKey,
  ])

  const handleEmployeeUpdate = useCallback(async (person, updates, successMsg = '') => {
    store.setPending(`employee-update-${person.id}`, true)
    try {
      await updatePersonRecord(person, updates)
      store.refreshEmployees()
      if (successMsg) store.addToast(successMsg, 'success')
    } catch (err) {
      store.addToast(err?.message || 'Update failed', 'error')
    }
    store.setPending(`employee-update-${person.id}`, false)
  }, [])

  const handleEmployeeDelete = useCallback(async (person) => {
    if (!window.confirm(`Delete ${person.name}? This cannot be undone.`)) return
    store.setPending(`employee-delete-${person.id}`, true)
    try {
      const res = await fetch(`/api/persons/${person.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        store.refreshEmployees()
        store.addToast(`${person.name} deleted`, 'success')
      } else {
        store.addToast(data.message || 'Delete failed', 'error')
      }
    } catch {
      store.addToast('Delete failed', 'error')
    }
    store.setPending(`employee-delete-${person.id}`, false)
  }, [])

  return {
    employees: store.employees,
    employeesLoaded: store.employeesLoaded,
    employeeTotal: store.employeeTotal,
    employeeApprovedCount: store.employeeApprovedCount,
    employeePendingCount: store.employeePendingCount,
    employeeRejectedCount: store.employeeRejectedCount,
    employeeHasMore: store.employeeHasMore,
    employeeHistoryLength: store.employeeHistory.length,
    employeeQuery: store.employeeQuery,
    setEmployeeQuery: store.setEmployeeQuery,
    employeeOfficeFilter: store.employeeOfficeFilter,
    setEmployeeOfficeFilter: store.setEmployeeOfficeFilter,
    employeeStatusFilter: store.employeeStatusFilter,
    setEmployeeStatusFilter: store.setEmployeeStatusFilter,
    employeeApprovalFilter: store.employeeApprovalFilter,
    setEmployeeApprovalFilter: store.setEmployeeApprovalFilter,
    handlePreviousPage: store.goToPreviousPage,
    handleNextPage: () => store.setEmployeeCursor(store.employeeCursor, true),
    refreshEmployees: store.refreshEmployees,
    handleEmployeeUpdate,
    handleEmployeeDelete,
    editingEmployee: store.editingEmployee,
    setEditingEmployee: store.setEditingEmployee,
    deletingEmployee: store.deletingEmployee,
    setDeletingEmployee: store.setDeletingEmployee,
    isPending: store.isPending,
  }
}
