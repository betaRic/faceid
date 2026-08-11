import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '../store'

export function useSummary() {
  const store = useAdminStore(useShallow((state) => ({
    summaryDate: state.summaryDate,
    summaryOfficeFilter: state.summaryOfficeFilter,
    summaryDivisionFilter: state.summaryDivisionFilter,
    summaryEmployeeFilter: state.summaryEmployeeFilter,
    summaryQuery: state.summaryQuery,
    summaryRows: state.summaryRows,
    summaryLoading: state.summaryLoading,
    setSummaryDate: state.setSummaryDate,
    setSummaryOfficeFilter: state.setSummaryOfficeFilter,
    setSummaryDivisionFilter: state.setSummaryDivisionFilter,
    setSummaryEmployeeFilter: state.setSummaryEmployeeFilter,
    setSummaryQuery: state.setSummaryQuery,
    setSummaryRows: state.setSummaryRows,
    setSummaryLoading: state.setSummaryLoading,
    addToast: state.addToast,
  })))
  const abortRef = useRef(null)
  const [allSummaryRows, setAllSummaryRows] = useState([])
  const {
    summaryDate,
    summaryOfficeFilter,
    summaryDivisionFilter,
    summaryEmployeeFilter,
    summaryQuery,
    summaryRows,
    summaryLoading,
    setSummaryDate,
    setSummaryOfficeFilter,
    setSummaryDivisionFilter,
    setSummaryEmployeeFilter,
    setSummaryQuery,
    setSummaryRows,
    setSummaryLoading,
    addToast,
  } = store
  const summaryEmployeeOptions = useMemo(() => {
    const seen = new Set()
    return allSummaryRows
      .filter((row) => !seen.has(row.employeeId) && seen.add(row.employeeId))
      .map((row) => ({ employeeId: row.employeeId, name: row.name }))
  }, [allSummaryRows])

  const applyFilters = useCallback((rows, employeeFilter, query) => {
    let filtered = employeeFilter === 'all'
      ? rows
      : rows.filter((row) => row.employeeId === employeeFilter)
    const normalizedQuery = String(query || '').trim().toLowerCase()
    if (!normalizedQuery) return filtered
    return filtered.filter((row) => [
      row.name,
      row.employeeId,
      row.position,
      row.officeName,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
  }, [])

  const fetchSummary = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setSummaryLoading(true)
    const params = new URLSearchParams({ date: summaryDate })
    if (summaryOfficeFilter !== 'all') params.set('officeId', summaryOfficeFilter)
    if (summaryDivisionFilter !== 'all') params.set('divisionId', summaryDivisionFilter)

    try {
      const res = await fetch(`/api/attendance/daily?${params.toString()}`, { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        const records = data.records || []
        setAllSummaryRows(records)
        setSummaryRows(applyFilters(
          records,
          useAdminStore.getState().summaryEmployeeFilter,
          useAdminStore.getState().summaryQuery,
        ))
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addToast('Failed to load summary', 'error')
      }
    }
    setSummaryLoading(false)
  }, [
    addToast,
    applyFilters,
    setSummaryLoading,
    setSummaryRows,
    summaryDate,
    summaryOfficeFilter,
    summaryDivisionFilter,
  ])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary, summaryDate, summaryOfficeFilter, summaryDivisionFilter])

  useEffect(() => {
    setSummaryRows(applyFilters(allSummaryRows, summaryEmployeeFilter, summaryQuery))
  }, [allSummaryRows, applyFilters, setSummaryRows, summaryEmployeeFilter, summaryQuery])

  return {
    summaryDate,
    setSummaryDate,
    summaryOfficeFilter,
    summaryDivisionFilter,
    setSummaryOfficeFilter,
    setSummaryDivisionFilter,
    summaryEmployeeFilter,
    setSummaryEmployeeFilter,
    summaryQuery,
    setSummaryQuery,
    summaryRows,
    summaryLoading,
    summaryEmployeeOptions,
    reloadSummary: fetchSummary,
  }
}
