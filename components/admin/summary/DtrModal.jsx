'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { downloadResponseBlob } from '@/lib/browser-download'
import { getDaysInMonth } from '@/lib/dtr'
import DtrSelectionView from './DtrSelectionView'

export default function DtrModal({ onClose }) {
  const [dtrMonth, setDtrMonth] = useState(new Date().getMonth() + 1)
  const [dtrYear, setDtrYear] = useState(new Date().getFullYear())
  const [dtrRange, setDtrRange] = useState('full')
  const [customStartDay, setCustomStartDay] = useState(1)
  const [customEndDay, setCustomEndDay] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [signatoryName, setSignatoryName] = useState('')
  const [signatoryPosition, setSignatoryPosition] = useState('')
  const [dtrLoading, setDtrLoading] = useState(false)
  const [dtrProgress, setDtrProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [employeesLoading, setEmployeesLoading] = useState(true)
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

  useEffect(() => {
    const controller = new AbortController()
    async function loadDtrEmployees() {
      setEmployeesLoading(true)
      try {
        const response = await fetch('/api/hr/dtr/employees', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.message || 'Failed to load employees for DTR generation.')
        setEmployees(Array.isArray(data?.employees) ? data.employees : [])
      } catch (loadError) {
        if (loadError?.name !== 'AbortError') setError(loadError?.message || 'Failed to load employees for DTR generation.')
      } finally {
        if (!controller.signal.aborted) setEmployeesLoading(false)
      }
    }
    loadDtrEmployees()
    return () => controller.abort()
  }, [])

  const uniqueEmployees = useMemo(() => (
    [...new Map(employees.map(employee => [employee.id, employee])).values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  ), [employees])

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
    && filteredEmployees.every(employee => selectedIds.has(employee.id))

  const handleSelectAll = useCallback(() => {
    setSelectedIds(previous => {
      const next = new Set(previous)
      const visibleIds = filteredEmployees.map(employee => employee.id)
      const everySelected = visibleIds.every(id => next.has(id))
      if (everySelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [filteredEmployees])

  const toggleEmployee = useCallback((personId) => {
    setSelectedIds(previous => {
      const next = new Set(previous)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    const selectedEmployees = uniqueEmployees.filter(employee => selectedIds.has(employee.id))
    if (selectedEmployees.length === 0) return

    setDtrLoading(true)
    setError('')
    setDtrProgress({ current: 0, total: selectedEmployees.length })
    abortRef.current = false

    try {
      const response = await fetch('/api/hr/dtr/workbook', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Person IDs are stable even when plantilla and COS personnel share an Employee ID.
          employeeIds: selectedEmployees.map(employee => employee.id),
          month: dtrMonth,
          year: dtrYear,
          range: dtrRange,
          customStartDay: dtrRange === 'custom' ? customStartDay : undefined,
          customEndDay: dtrRange === 'custom' ? customEndDay : undefined,
          signatoryName: signatoryName.trim() || undefined,
          signatoryPosition: signatoryPosition.trim() || undefined,
        }),
      })

      if (abortRef.current) {
        setDtrLoading(false)
        return
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to generate DTR Excel workbook.')
      }

      await downloadResponseBlob(response, 'DTR.xlsx')
      setDtrProgress({ current: selectedEmployees.length, total: selectedEmployees.length })
    } catch (error) {
      console.error('DTR generation failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate DTR Excel workbook.')
    }

    setDtrLoading(false)
  }, [customEndDay, customStartDay, dtrMonth, dtrRange, dtrYear, selectedIds, signatoryName, signatoryPosition, uniqueEmployees])

  const handleCancel = useCallback(() => {
    abortRef.current = true
  }, [])

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
        <DtrSelectionView
          allVisibleSelected={allVisibleSelected}
          customEndDay={customEndDay}
          customStartDay={customStartDay}
          daysInMonth={daysInMonth}
          dtrLoading={dtrLoading}
          employeesLoading={employeesLoading}
          dtrMonth={dtrMonth}
          dtrProgress={dtrProgress}
          dtrRange={dtrRange}
          dtrYear={dtrYear}
          error={error}
          filteredEmployees={filteredEmployees}
          onCancel={handleCancel}
          onClose={onClose}
          onGenerate={handleGenerate}
          onSearchChange={setSearch}
          onSelectAll={handleSelectAll}
          onSetCustomEndDay={setCustomEndDay}
          onSetCustomStartDay={setCustomStartDay}
          onSetDtrMonth={setDtrMonth}
          onSetDtrRange={setDtrRange}
          onSetDtrYear={setDtrYear}
          onSetSignatoryName={setSignatoryName}
          onSetSignatoryPosition={setSignatoryPosition}
          onToggleEmployee={toggleEmployee}
          search={search}
          selectedIds={selectedIds}
          signatoryName={signatoryName}
          signatoryPosition={signatoryPosition}
          uniqueEmployees={uniqueEmployees}
        />
      </motion.div>
    </motion.div>
  )
}
