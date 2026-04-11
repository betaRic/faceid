import { useCallback, useEffect } from 'react'
import { useAdminStore } from '../store'

export function useSummary() {
  const store = useAdminStore()
  const abortRef = { current: null }

  const fetchSummary = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    store.setSummaryLoading(true)
    const params = new URLSearchParams({ date: store.summaryDate })
    if (store.summaryOfficeFilter !== 'all') params.set('officeId', store.summaryOfficeFilter)

    try {
      const res = await fetch(`/api/attendance/daily?${params.toString()}`, { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        store.setSummaryRows(data.records || [])
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        store.addToast('Failed to load summary', 'error')
      }
    }
    store.setSummaryLoading(false)
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [store.summaryDate, store.summaryOfficeFilter, store.summaryEmployeeFilter])

  const handleExport = useCallback(async () => {
    store.setPending('summary-export', true)
    try {
      const params = new URLSearchParams({ date: store.summaryDate })
      if (store.summaryOfficeFilter !== 'all') params.set('officeId', store.summaryOfficeFilter)
      const res = await fetch(`/api/attendance/daily?${params.toString()}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.message)

      let rows = data.records || []
      if (store.summaryEmployeeFilter !== 'all') {
        rows = rows.filter((r) => r.employeeId === store.summaryEmployeeFilter)
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
      a.download = `attendance-${store.summaryDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
      store.addToast('Exported successfully', 'success')
    } catch (err) {
      store.addToast(err?.message || 'Export failed', 'error')
    }
    store.setPending('summary-export', false)
  }, [store.summaryDate, store.summaryOfficeFilter, store.summaryEmployeeFilter])

  return {
    summaryDate: store.summaryDate,
    setSummaryDate: store.setSummaryDate,
    summaryOfficeFilter: store.summaryOfficeFilter,
    setSummaryOfficeFilter: store.setSummaryOfficeFilter,
    summaryEmployeeFilter: store.summaryEmployeeFilter,
    setSummaryEmployeeFilter: store.setSummaryEmployeeFilter,
    summaryRows: store.summaryRows,
    summaryLoading: store.summaryLoading,
    summaryEmployeeOptions: store.getSummaryEmployeeOptions(),
    handleExport,
    isPending: store.isPending,
  }
}
