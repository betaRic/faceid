import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { downloadRawAttendanceWorkbook } from '@/lib/raw-attendance-workbook'
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
    setPending: state.setPending,
    isPending: state.isPending,
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
    setPending,
    isPending,
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

  const handleExport = useCallback(async () => {
    setPending('summary-export', true)
    try {
      const params = new URLSearchParams({ date: summaryDate })
      if (summaryOfficeFilter !== 'all') params.set('officeId', summaryOfficeFilter)
      const res = await fetch(`/api/attendance/daily?${params.toString()}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.message)

      let rows = data.records || []
      if (summaryEmployeeFilter !== 'all') {
        rows = rows.filter((r) => r.employeeId === summaryEmployeeFilter)
      }

      const headers = ['Employee', 'Employee ID', 'Office', 'Date', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Late (min)', 'Undertime (min)', 'Working Hours', 'Status']
      const csv = [
        headers.join(','),
        ...rows.map((row) => [
          `"${row.name || ''}"`, `"${row.employeeId || ''}"`, `"${row.officeName || ''}"`, `"${row.dateKey || ''}"`,
          `"${row.amIn || ''}"`, `"${row.amOut || ''}"`, `"${row.pmIn || ''}"`, `"${row.pmOut || ''}"`,
          row.lateMinutes || 0, row.undertimeMinutes || 0, `"${row.workingHours || ''}"`, `"${row.status || ''}"`,
        ].join(',')),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${summaryDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
      addToast('Exported successfully', 'success')
    } catch (err) {
      addToast(err?.message || 'Export failed', 'error')
    }
    setPending('summary-export', false)
  }, [addToast, setPending, summaryDate, summaryEmployeeFilter, summaryOfficeFilter])

  const handleRawExport = useCallback(async () => {
    setPending('summary-raw-export', true)
    try {
      const params = new URLSearchParams({ date: summaryDate })
      if (summaryOfficeFilter !== 'all') params.set('officeId', summaryOfficeFilter)
      const res = await fetch(`/api/attendance/daily?${params.toString()}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.message)

      let rows = data.records || []
      if (summaryEmployeeFilter !== 'all') {
        rows = rows.filter((r) => r.employeeId === summaryEmployeeFilter)
      }

      downloadRawAttendanceWorkbook(rows, `attendance-raw-${summaryDate}`)
      addToast('Raw attendance exported successfully', 'success')
    } catch (err) {
      addToast(err?.message || 'Raw export failed', 'error')
    }
    setPending('summary-raw-export', false)
  }, [addToast, setPending, summaryDate, summaryEmployeeFilter, summaryOfficeFilter])

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
    handleExport,
    handleRawExport,
    isPending,
  }
}
