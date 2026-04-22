import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '../store'
import { updatePersonRecord } from '@/lib/data-store'

const EMPLOYEE_PAGE_SIZE = 24

export function useEmployees() {
  const store = useAdminStore(useShallow((state) => ({
    employees: state.employees,
    employeesLoaded: state.employeesLoaded,
    employeeTotal: state.employeeTotal,
    employeeApprovedCount: state.employeeApprovedCount,
    employeePendingCount: state.employeePendingCount,
    employeeRejectedCount: state.employeeRejectedCount,
    employeeHasMore: state.employeeHasMore,
    employeeHistoryLength: state.employeeHistory.length,
    employeeQuery: state.employeeQuery,
    employeeOfficeFilter: state.employeeOfficeFilter,
    employeeStatusFilter: state.employeeStatusFilter,
    employeeApprovalFilter: state.employeeApprovalFilter,
    employeeCursor: state.employeeCursor,
    employeeRefreshKey: state.employeeRefreshKey,
    editingEmployee: state.editingEmployee,
    deletingEmployee: state.deletingEmployee,
    setEmployees: state.setEmployees,
    setEmployeesLoaded: state.setEmployeesLoaded,
    setEmployeeQuery: state.setEmployeeQuery,
    setEmployeeOfficeFilter: state.setEmployeeOfficeFilter,
    setEmployeeStatusFilter: state.setEmployeeStatusFilter,
    setEmployeeApprovalFilter: state.setEmployeeApprovalFilter,
    setEmployeeCursor: state.setEmployeeCursor,
    refreshEmployees: state.refreshEmployees,
    goToPreviousPage: state.goToPreviousPage,
    setEditingEmployee: state.setEditingEmployee,
    setDeletingEmployee: state.setDeletingEmployee,
    addToast: state.addToast,
    setPending: state.setPending,
    isPending: state.isPending,
  })))
  const abortRef = useRef(null)
  const {
    employees,
    employeesLoaded,
    employeeTotal,
    employeeApprovedCount,
    employeePendingCount,
    employeeRejectedCount,
    employeeHasMore,
    employeeHistoryLength,
    employeeQuery,
    employeeOfficeFilter,
    employeeStatusFilter,
    employeeApprovalFilter,
    employeeCursor,
    employeeRefreshKey,
    editingEmployee,
    deletingEmployee,
    setEmployees,
    setEmployeesLoaded,
    setEmployeeQuery,
    setEmployeeOfficeFilter,
    setEmployeeStatusFilter,
    setEmployeeApprovalFilter,
    setEmployeeCursor,
    refreshEmployees,
    goToPreviousPage,
    setEditingEmployee,
    setDeletingEmployee,
    addToast,
    setPending,
    isPending,
  } = store

  const fetchEmployees = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setEmployeesLoaded(false)
    const params = new URLSearchParams({ mode: 'directory', limit: String(EMPLOYEE_PAGE_SIZE) })
    if (employeeQuery) params.set('q', employeeQuery)
    if (employeeOfficeFilter !== 'all') params.set('officeId', employeeOfficeFilter)
    if (employeeStatusFilter !== 'all') params.set('status', employeeStatusFilter)
    if (employeeApprovalFilter !== 'all') params.set('approval', employeeApprovalFilter)
    if (employeeCursor) params.set('cursor', employeeCursor)

    try {
      const res = await fetch(`/api/persons?${params.toString()}`, { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        setEmployees(data)
      } else {
        setEmployees({ persons: [], page: {} })
        addToast(data.message || 'Failed to load employees', 'error')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setEmployees({ persons: [], page: {} })
        addToast(err?.message || 'Failed to load employees', 'error')
      }
    }
  }, [
    addToast,
    employeeApprovalFilter,
    employeeCursor,
    employeeOfficeFilter,
    employeeQuery,
    employeeStatusFilter,
    setEmployees,
    setEmployeesLoaded,
  ])

  useEffect(() => {
    fetchEmployees()
  }, [
    fetchEmployees,
    employeeQuery,
    employeeOfficeFilter,
    employeeStatusFilter,
    employeeApprovalFilter,
    employeeCursor,
    employeeRefreshKey,
  ])

  const handleEmployeeUpdate = useCallback(async (person, updates, successMsg = '') => {
    setPending(`employee-update-${person.id}`, true)
    try {
      await updatePersonRecord(person, updates)
      refreshEmployees()
      if (successMsg) addToast(successMsg, 'success')
    } catch (err) {
      addToast(err?.message || 'Update failed', 'error')
    }
    setPending(`employee-update-${person.id}`, false)
  }, [addToast, refreshEmployees, setPending])

  const handleEmployeeDelete = useCallback(async (person) => {
    if (!window.confirm(`Delete ${person.name}? This cannot be undone.`)) return
    setPending(`employee-delete-${person.id}`, true)
    try {
      const res = await fetch(`/api/persons/${person.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        refreshEmployees()
        addToast(`${person.name} deleted`, 'success')
      } else {
        addToast(data.message || 'Delete failed', 'error')
      }
    } catch {
      addToast('Delete failed', 'error')
    }
    setPending(`employee-delete-${person.id}`, false)
  }, [addToast, refreshEmployees, setPending])

  const handleBulkEmployeeUpdate = useCallback(async (
    persons,
    updates,
    {
      pendingKey = 'employees-bulk-update',
      successMessage = 'Selected employees updated',
      failureMessage = 'Some employee updates failed',
    } = {},
  ) => {
    if (!Array.isArray(persons) || persons.length === 0) {
      return { successCount: 0, failureCount: 0 }
    }

    setPending(pendingKey, true)

    const queue = [...persons]
    const results = []

    const worker = async () => {
      while (queue.length > 0) {
        const person = queue.shift()
        if (!person) break
        try {
          await updatePersonRecord(person, updates)
          results.push({ ok: true, person })
        } catch (error) {
          results.push({ ok: false, person, error })
        }
      }
    }

    try {
      const concurrency = Math.min(4, queue.length)
      await Promise.all(Array.from({ length: concurrency }, () => worker()))

      const successCount = results.filter((result) => result.ok).length
      const failureCount = results.length - successCount

      if (successCount > 0) {
        refreshEmployees()
        addToast(
          successCount === persons.length
            ? successMessage
            : `${successCount} of ${persons.length} employee updates completed`,
          failureCount > 0 ? 'info' : 'success',
        )
      }

      if (failureCount > 0) {
        const firstError = results.find((result) => !result.ok)?.error
        addToast(
          firstError?.message
            ? `${failureMessage}: ${firstError.message}`
            : failureMessage,
          'error',
        )
      }

      return { successCount, failureCount, results }
    } finally {
      setPending(pendingKey, false)
    }
  }, [addToast, refreshEmployees, setPending])

  return {
    employees,
    employeesLoaded,
    employeeTotal,
    employeeApprovedCount,
    employeePendingCount,
    employeeRejectedCount,
    employeeHasMore,
    employeeHistoryLength,
    employeeQuery,
    setEmployeeQuery,
    employeeOfficeFilter,
    setEmployeeOfficeFilter,
    employeeStatusFilter,
    setEmployeeStatusFilter,
    employeeApprovalFilter,
    setEmployeeApprovalFilter,
    handlePreviousPage: goToPreviousPage,
    handleNextPage: () => setEmployeeCursor(employeeCursor, true),
    refreshEmployees,
    handleEmployeeUpdate,
    handleEmployeeDelete,
    handleBulkEmployeeUpdate,
    editingEmployee,
    setEditingEmployee,
    deletingEmployee,
    setDeletingEmployee,
    isPending,
  }
}
