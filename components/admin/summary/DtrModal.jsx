'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { downloadDtrPdf } from '@/lib/dtr-pdf'
import { DTR_MONTH_NAMES, formatDtrRangeForFilename, getDaysInMonth } from '@/lib/dtr'
import DtrPreviewView from './DtrPreviewView'
import DtrSelectionView from './DtrSelectionView'

export default function DtrModal({ summaryRows, onClose }) {
  const [dtrMonth, setDtrMonth] = useState(new Date().getMonth() + 1)
  const [dtrYear, setDtrYear] = useState(new Date().getFullYear())
  const [dtrRange, setDtrRange] = useState('full')
  const [customStartDay, setCustomStartDay] = useState(1)
  const [customEndDay, setCustomEndDay] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [dtrLoading, setDtrLoading] = useState(false)
  const [dtrProgress, setDtrProgress] = useState({ current: 0, total: 0 })
  const [dtrEmployees, setDtrEmployees] = useState([])
  const [downloadKind, setDownloadKind] = useState('dtr')
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const abortRef = useRef(false)
  const daysInMonth = getDaysInMonth(dtrYear, dtrMonth)

  useEffect(() => {
    setCustomStartDay(prev => Math.min(prev, daysInMonth))
    setCustomEndDay(prev => Math.min(Math.max(prev, 1), daysInMonth))
  }, [daysInMonth])

  useEffect(() => {
    if (customStartDay > customEndDay) {
      setCustomEndDay(customStartDay)
    }
  }, [customEndDay, customStartDay])

  const uniqueEmployees = useMemo(() => (
    [...new Map(summaryRows.map(row => [row.employeeId, row])).values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  ), [summaryRows])

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return uniqueEmployees
    const query = search.toLowerCase()
    return uniqueEmployees.filter(employee => (
      (employee.name || '').toLowerCase().includes(query)
      || (employee.employeeId || '').toLowerCase().includes(query)
      || (employee.officeName || '').toLowerCase().includes(query)
    ))
  }, [search, uniqueEmployees])

  const allVisibleSelected = filteredEmployees.length > 0
    && filteredEmployees.every(employee => selectedIds.has(employee.employeeId))

  const handleSelectAll = useCallback(() => {
    setSelectedIds(previous => {
      const next = new Set(previous)
      const visibleIds = filteredEmployees.map(employee => employee.employeeId)
      const everySelected = visibleIds.every(id => next.has(id))
      if (everySelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [filteredEmployees])

  const toggleEmployee = useCallback((employeeId) => {
    setSelectedIds(previous => {
      const next = new Set(previous)
      if (next.has(employeeId)) next.delete(employeeId)
      else next.add(employeeId)
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    const selectedEmployees = uniqueEmployees.filter(employee => selectedIds.has(employee.employeeId))
    if (selectedEmployees.length === 0) return

    setDtrLoading(true)
    setDtrEmployees([])
    setDtrProgress({ current: 0, total: selectedEmployees.length })
    abortRef.current = false

    try {
      const employeeResponse = await fetch('/api/hr/dtr/employees', { credentials: 'include' })
      const employeeData = await employeeResponse.json()
      if (!employeeData.ok) {
        setDtrLoading(false)
        return
      }

      const employeeMap = new Map(employeeData.employees.map(employee => [employee.employeeId, employee]))
      const results = []

      for (let index = 0; index < selectedEmployees.length; index += 1) {
        if (abortRef.current) break

        const employee = selectedEmployees[index]
        const personDoc = employeeMap.get(employee.employeeId)
        if (!personDoc) {
          setDtrProgress({ current: index + 1, total: selectedEmployees.length })
          continue
        }

        const params = new URLSearchParams({
          employeeId: personDoc.id,
          month: String(dtrMonth),
          year: String(dtrYear),
          range: dtrRange,
        })

        if (dtrRange === 'custom') {
          params.set('customStartDay', String(customStartDay))
          params.set('customEndDay', String(customEndDay))
        }

        const response = await fetch(`/api/hr/dtr?${params}`, { credentials: 'include' })
        const data = await response.json()
        if (data.ok && data.dtr) {
          results.push(data.dtr)
        }

        setDtrProgress({ current: index + 1, total: selectedEmployees.length })
      }

      setDtrEmployees(results)

      if (results.length > 0) {
        window.setTimeout(async () => {
          const suffix = formatDtrRangeForFilename(results[0]?.rangeSpec)
          if (downloadKind === 'raw') {
            const filename = `RAW_ATTENDANCE_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${results.length}employees`
            await downloadDtrPdf(filename, '.form48-container', { orientation: 'portrait' })
          } else {
            const filename = `DTR_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${results.length}employees`
            await downloadDtrPdf(filename)
          }
        }, 600)
      }
    } catch (error) {
      console.error('DTR generation failed:', error)
    }

    setDtrLoading(false)
  }, [customEndDay, customStartDay, downloadKind, dtrMonth, dtrRange, dtrYear, selectedIds, uniqueEmployees])

  const handleDownloadAgain = useCallback(async () => {
    setPdfDownloading(true)
    const suffix = formatDtrRangeForFilename(dtrEmployees[0]?.rangeSpec)
    if (downloadKind === 'raw') {
      const filename = `RAW_ATTENDANCE_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${dtrEmployees.length}employees`
      await downloadDtrPdf(filename, '.form48-container', { orientation: 'portrait' })
    } else {
      const filename = `DTR_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${dtrEmployees.length}employees`
      await downloadDtrPdf(filename)
    }
    setPdfDownloading(false)
  }, [downloadKind, dtrEmployees, dtrMonth, dtrYear])

  const handleCancel = useCallback(() => {
    abortRef.current = true
  }, [])

  const handleBackToSelection = useCallback(() => {
    setDtrEmployees([])
    setSelectedIds(new Set())
  }, [])

  const totalRawRows = dtrEmployees.reduce((sum, dtr) => {
    const rows = (dtr?.rows || []).filter(row => row.inMonth && row.isActive)
    return sum + rows.length
  }, 0)

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-3 print:bg-white print:p-0 sm:p-4"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={event => {
        if (event.target === event.currentTarget && !dtrLoading) onClose()
      }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none"
        exit={{ opacity: 0, y: 24 }}
        initial={{ opacity: 0, y: 24 }}
      >
        {dtrEmployees.length > 0 ? (
          <DtrPreviewView
            downloadKind={downloadKind}
            dtrEmployees={dtrEmployees}
            dtrMonth={dtrMonth}
            dtrYear={dtrYear}
            onBack={handleBackToSelection}
            onClose={onClose}
            onDownloadAgain={handleDownloadAgain}
            pdfDownloading={pdfDownloading}
            totalRawRows={totalRawRows}
          />
        ) : (
          <DtrSelectionView
            allVisibleSelected={allVisibleSelected}
            customEndDay={customEndDay}
            customStartDay={customStartDay}
            daysInMonth={daysInMonth}
            downloadKind={downloadKind}
            dtrLoading={dtrLoading}
            dtrMonth={dtrMonth}
            dtrProgress={dtrProgress}
            dtrRange={dtrRange}
            dtrYear={dtrYear}
            filteredEmployees={filteredEmployees}
            onCancel={handleCancel}
            onClose={onClose}
            onGenerate={handleGenerate}
            onSearchChange={setSearch}
            onSelectAll={handleSelectAll}
            onSetCustomEndDay={setCustomEndDay}
            onSetCustomStartDay={setCustomStartDay}
            onSetDownloadKind={setDownloadKind}
            onSetDtrMonth={setDtrMonth}
            onSetDtrRange={setDtrRange}
            onSetDtrYear={setDtrYear}
            onToggleEmployee={toggleEmployee}
            search={search}
            selectedIds={selectedIds}
            uniqueEmployees={uniqueEmployees}
          />
        )}
      </motion.div>
    </motion.div>
  )
}
