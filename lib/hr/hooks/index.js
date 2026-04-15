'use client'

import { create } from 'zustand'
import { useCallback, useState } from 'react'

function createHrStore() {
  return create((set, get) => ({
    hrUser: null,
    hrUserLoaded: false,
    hrUserError: null,

    employees: [],
    employeesLoaded: false,
    employeeTotal: 0,
    employeeQuery: '',
    employeeOfficeFilter: '',
    employeeStatusFilter: '',
    employeeApprovalFilter: '',
    employeePage: 1,
    employeeHasMore: false,

    setHrUser: (hrUser) => set({ hrUser, hrUserLoaded: true }),
    setHrUserError: (hrUserError) => set({ hrUserError, hrUserLoaded: true }),
    logout: () => set({ hrUser: null, hrUserLoaded: false, hrUserError: null, employees: [] }),

    setEmployees: (employees) => set({ employees, employeesLoaded: true }),
    setEmployeeQuery: (employeeQuery) => set({ employeeQuery, employeePage: 1 }),
    setEmployeeOfficeFilter: (employeeOfficeFilter) => set({ employeeOfficeFilter, employeePage: 1 }),
    setEmployeeStatusFilter: (employeeStatusFilter) => set({ employeeStatusFilter, employeePage: 1 }),
    setEmployeeApprovalFilter: (employeeApprovalFilter) => set({ employeeApprovalFilter, employeePage: 1 }),
    setEmployeePage: (employeePage) => set({ employeePage }),
    setEmployeePagination: (total, hasMore) => set({ employeeTotal: total, employeeHasMore: hasMore }),
  }))
}

const hrStore = createHrStore()

export function useHrStore() {
  return hrStore()
}

export function useHrSession() {
  const { hrUser, hrUserLoaded, hrUserError, setHrUser, setHrUserError, logout } = useHrStore()
  const [loading, setLoading] = useState(false)

  const checkSession = useCallback(async () => {
    if (hrUserLoaded) return hrUser
    setLoading(true)
    try {
      const res = await fetch('/api/hr/session', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setHrUser(data.hrUser)
        return data.hrUser
      } else {
        setHrUserError(data.message)
        return null
      }
    } catch (err) {
      setHrUserError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [hrUserLoaded, hrUser, setHrUser, setHrUserError])

  const loginWithPin = useCallback(async (pin) => {
    setLoading(true)
    try {
      const res = await fetch('/api/hr/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.ok) {
        return await checkSession()
      }
      return { ok: false, message: data.message }
    } catch (err) {
      return { ok: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [checkSession])

  const loginWithEmailPin = useCallback(async (email, pin) => {
    setLoading(true)
    try {
      const res = await fetch('/api/hr/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, pin }),
      })
      const data = await res.json()
      if (data.ok) {
        return await checkSession()
      }
      return { ok: false, message: data.message }
    } catch (err) {
      return { ok: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [checkSession])

  const hrLogout = useCallback(async () => {
    setLoading(true)
    try {
      await fetch('/api/hr/logout', {
        method: 'POST',
        credentials: 'include',
      })
      logout()
    } finally {
      setLoading(false)
    }
  }, [logout])

  return {
    hrUser,
    hrUserLoaded,
    hrUserError,
    loading,
    checkSession,
    loginWithPin,
    loginWithEmailPin,
    hrLogout,
  }
}

export function useHrEmployees() {
  const {
    employees,
    employeesLoaded,
    employeeTotal,
    employeeQuery,
    employeeOfficeFilter,
    employeeStatusFilter,
    employeeApprovalFilter,
    employeePage,
    employeeHasMore,
    setEmployees,
    setEmployeeQuery,
    setEmployeeOfficeFilter,
    setEmployeeStatusFilter,
    setEmployeeApprovalFilter,
    setEmployeePage,
    setEmployeePagination,
  } = useHrStore()

  const [loading, setLoading] = useState(false)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(employeePage))
      if (employeeQuery) params.set('query', employeeQuery)
      if (employeeOfficeFilter) params.set('officeId', employeeOfficeFilter)
      if (employeeStatusFilter) params.set('status', employeeStatusFilter)
      if (employeeApprovalFilter) params.set('approval', employeeApprovalFilter)

      const res = await fetch(`/api/hr/employees?${params}`, { credentials: 'include' })
      const data = await res.json()

      if (data.ok) {
        setEmployees(data.employees)
        setEmployeePagination(data.pagination.total, data.pagination.hasMore)
      }
    } finally {
      setLoading(false)
    }
  }, [employeePage, employeeQuery, employeeOfficeFilter, employeeStatusFilter, employeeApprovalFilter, setEmployees, setEmployeePagination])

  const handlePreviousPage = useCallback(() => {
    if (employeePage > 1) {
      setEmployeePage(employeePage - 1)
    }
  }, [employeePage, setEmployeePage])

  const handleNextPage = useCallback(() => {
    if (employeeHasMore) {
      setEmployeePage(employeePage + 1)
    }
  }, [employeePage, employeeHasMore, setEmployeePage])

  return {
    employees,
    employeesLoaded,
    employeeTotal,
    employeeQuery,
    setEmployeeQuery,
    employeeOfficeFilter,
    setEmployeeOfficeFilter,
    employeeStatusFilter,
    setEmployeeStatusFilter,
    employeeApprovalFilter,
    setEmployeeApprovalFilter,
    employeePage,
    employeeHasMore,
    handlePreviousPage,
    handleNextPage,
    fetchEmployees,
    loading,
  }
}