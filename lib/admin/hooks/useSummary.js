import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '../store'

export function useSummary() {
  const store = useAdminStore(useShallow((state) => ({
    summaryDate: state.summaryDate,
    summaryOfficeFilter: state.summaryOfficeFilter,
    summaryEmployeeFilter: state.summaryEmployeeFilter,
    summaryRows: state.summaryRows,
    summaryLoading: state.summaryLoading,
    setSummaryDate: state.setSummaryDate,
    setSummaryOfficeFilter: state.setSummaryOfficeFilter,
    setSummaryEmployeeFilter: state.setSummaryEmployeeFilter,
    setSummaryRows: state.setSummaryRows,
    setSummaryLoading: state.setSummaryLoading,
    addToast: state.addToast,
  })))
  const abortRef = useRef(null)
  const [allSummaryRows, setAllSummaryRows] = useState([])
  const {
    summaryDate,
    summaryOfficeFilter,
    summaryEmployeeFilter,
    summaryRows,
    summaryLoading,
    setSummaryDate,
    setSummaryOfficeFilter,
    setSummaryEmployeeFilter,
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

  const applyEmployeeFilter = useCallback((rows, employeeFilter) => {
    if (employeeFilter === 'all') return rows
    return rows.filter((row) => row.employeeId === employeeFilter)
  }, [])

  const fetchSummary = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setSummaryLoading(true)
    const params = new URLSearchParams({ date: summaryDate })
    if (summaryOfficeFilter !== 'all') params.set('officeId', summaryOfficeFilter)

    try {
      const res = await fetch(`/api/attendance/daily?${params.toString()}`, { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        const records = data.records || []
        setAllSummaryRows(records)
        setSummaryRows(applyEmployeeFilter(
          records,
          useAdminStore.getState().summaryEmployeeFilter,
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
    applyEmployeeFilter,
    setSummaryLoading,
    setSummaryRows,
    summaryDate,
    summaryOfficeFilter,
  ])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary, summaryDate, summaryOfficeFilter])

  useEffect(() => {
    setSummaryRows(applyEmployeeFilter(allSummaryRows, summaryEmployeeFilter))
  }, [allSummaryRows, applyEmployeeFilter, setSummaryRows, summaryEmployeeFilter])

  return {
    summaryDate,
    setSummaryDate,
    summaryOfficeFilter,
    setSummaryOfficeFilter,
    summaryEmployeeFilter,
    setSummaryEmployeeFilter,
    summaryRows,
    summaryLoading,
    summaryEmployeeOptions,
    reloadSummary: fetchSummary,
  }
}
