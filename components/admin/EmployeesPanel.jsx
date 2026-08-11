'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { startTransition } from 'react'
import { useEmployees, useOffices } from '@/lib/admin/hooks'
import { Field, Badge } from '@/components/shared/ui'
import EmployeeAccessCodeExportActions from './EmployeeAccessCodeExportActions'

function LifecycleBadge({ status }) {
  const value = status || 'inactive'
  const palette = value === 'active' ? 'bg-emerald-100 text-emerald-800' : value === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] ${palette}`}>{value === 'pending' ? 'Pending review' : value}</span>
}

function ActionButton({ children, onClick, disabled, className = '', busy }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${className} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
      disabled={disabled || busy}
      onClick={onClick}
      type="button"
    >
      {busy ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Processing...</> : children}
    </button>
  )
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-5 py-4"><div className="h-4 w-4 rounded bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-10 w-10 rounded-full bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-6 w-16 rounded-full bg-stone-200" /></td>
    </tr>
  )
}

function EmployeesPanelInner() {
  const {
    employees, employeesLoaded, employeeTotal,
    employeeHasMore, employeeHistoryLength,
    employeeQuery, setEmployeeQuery,
    employeeOfficeFilter, setEmployeeOfficeFilter,
    employeeDivisionFilter, setEmployeeDivisionFilter,
    employeeStatusFilter, setEmployeeStatusFilter,
    handlePreviousPage, handleNextPage, refreshEmployees,
    handleBulkEmployeeUpdate,
    setEditingEmployee, setDeletingEmployee,
  } = useEmployees()
  const { visibleOffices } = useOffices()
  const selectedOffice = useMemo(
    () => visibleOffices.find((office) => office.id === employeeOfficeFilter) || null,
    [employeeOfficeFilter, visibleOffices],
  )
  const officeDivisions = Array.isArray(selectedOffice?.divisions) ? selectedOffice.divisions : []
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([])
  const [bulkAction, setBulkAction] = useState('')
  const selectedEmployeeIdSet = useMemo(() => new Set(selectedEmployeeIds), [selectedEmployeeIds])
  const selectedEmployees = useMemo(
    () => employees.filter((person) => selectedEmployeeIdSet.has(person.id)),
    [employees, selectedEmployeeIdSet],
  )
  const allPageSelected = employees.length > 0 && selectedEmployeeIds.length === employees.length
  const pendingOnPage = useMemo(
    () => employees.filter((person) => person.lifecycleStatus === 'pending'),
    [employees],
  )
  const employeePage = employeeHistoryLength + 1
  const employeePageCount = Math.max(1, Math.ceil(employeeTotal / 24))

  const onSearchChange = useCallback((e) => {
    startTransition(() => setEmployeeQuery(e.target.value))
  }, [setEmployeeQuery])

  useEffect(() => {
    setSelectedEmployeeIds((current) => current.filter((id) => employees.some((person) => person.id === id)))
  }, [employees])

  const toggleSelectedEmployee = useCallback((personId) => {
    setSelectedEmployeeIds((current) => (
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId]
    ))
  }, [])

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedEmployeeIds(allPageSelected ? [] : employees.map((person) => person.id))
  }, [allPageSelected, employees])

  const runBulkUpdate = useCallback(async (mode) => {
    if (selectedEmployees.length === 0) return

    setBulkAction(mode)

    const configs = {
      activate: {
        updates: { lifecycleStatus: 'active' },
        successMessage: `Activated ${selectedEmployees.length} employee(s)`,
        failureMessage: 'Bulk activation incomplete',
        pendingKey: 'employees-bulk-activate',
      },
      deactivate: {
        updates: { lifecycleStatus: 'inactive' },
        successMessage: `Deactivated ${selectedEmployees.length} employee(s)`,
        failureMessage: 'Bulk deactivation incomplete',
        pendingKey: 'employees-bulk-deactivate',
      },
    }

    const config = configs[mode]
    if (!config) {
      setBulkAction('')
      return
    }

    await handleBulkEmployeeUpdate(selectedEmployees, config.updates, config)
    setSelectedEmployeeIds([])
    setBulkAction('')
  }, [handleBulkEmployeeUpdate, selectedEmployees])

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-0 flex-col gap-2 bg-white p-3 sm:p-4 md:h-full md:overflow-hidden"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          <Field className="col-span-2 xl:col-span-1" label="Search">
            <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={onSearchChange} placeholder="Name or ID" value={employeeQuery} />
          </Field>
          <Field label="Office">
            <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setEmployeeOfficeFilter(e.target.value)} value={employeeOfficeFilter}>
              <option value="all">All offices</option>
              {visibleOffices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setEmployeeStatusFilter(e.target.value)} value={employeeStatusFilter}>
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="pending">Pending review</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          {officeDivisions.length > 0 ? (
            <Field label="Division">
              <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setEmployeeDivisionFilter(e.target.value)} value={employeeDivisionFilter}>
                <option value="all">All divisions</option>
                {officeDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
              </select>
            </Field>
          ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-black/5 bg-stone-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted">
          {employeesLoaded ? `Showing ${employeeTotal} records` : 'Loading...'}
        </span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={employees.length === 0} onClick={toggleSelectAllOnPage}>
            {allPageSelected ? 'Clear page' : 'Select page'}
          </ActionButton>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={pendingOnPage.length === 0} onClick={() => setSelectedEmployeeIds(pendingOnPage.map((person) => person.id))}>
            Select pending
          </ActionButton>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={!employeesLoaded || employeeHistoryLength === 0} onClick={handlePreviousPage}>
            ← Prev
          </ActionButton>
          <span aria-live="polite" className="col-span-2 self-center whitespace-nowrap px-1 text-center text-xs font-semibold text-muted sm:col-auto">
            Page {employeePage} of {employeePageCount}
          </span>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={!employeesLoaded || !employeeHasMore} onClick={handleNextPage}>
            Next →
          </ActionButton>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" onClick={refreshEmployees} busy={!employeesLoaded}>
            Refresh
          </ActionButton>
          <EmployeeAccessCodeExportActions />
        </div>
      </div>

      {selectedEmployees.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-navy/10 bg-navy/[0.04] px-4 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-navy-dark">Bulk actions</div>
              <div className="mt-1 text-sm text-ink">
                {selectedEmployees.length} employee{selectedEmployees.length > 1 ? 's' : ''} selected on this page
              </div>
            </div>
            <button
              className="text-sm font-semibold text-muted transition hover:text-ink"
              onClick={() => setSelectedEmployeeIds([])}
              type="button"
            >
              Clear selection
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={Boolean(bulkAction)}
              busy={bulkAction === 'activate'}
              className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              onClick={() => runBulkUpdate('activate')}
            >
              Activate selected
            </ActionButton>
            <ActionButton
              disabled={Boolean(bulkAction)}
              busy={bulkAction === 'deactivate'}
              className="border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
              onClick={() => runBulkUpdate('deactivate')}
            >
              Deactivate selected
            </ActionButton>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-black/5 md:min-h-0 md:flex-1 md:overflow-auto">
        <div className="divide-y divide-black/5 bg-white md:hidden">
          {!employeesLoaded ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse px-4 py-4">
                <div className="h-4 w-32 rounded bg-stone-200" />
                <div className="mt-3 h-3 w-24 rounded bg-stone-200" />
              </div>
            ))
          ) : employees.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              No employees match the current filters.
            </div>
          ) : (
            employees.map(person => (
              <div key={person.id} className="grid gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <input
                      checked={selectedEmployeeIdSet.has(person.id)}
                      className="mt-1 h-4 w-4 rounded border-black/15 text-navy focus:ring-navy"
                      onChange={() => toggleSelectedEmployee(person.id)}
                      type="checkbox"
                    />
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-ink">{person.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-wider text-muted">{person.employeeId}</div>
                      {person.position ? (
                        <div className="mt-0.5 text-xs text-muted">{person.position}</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <LifecycleBadge status={person.lifecycleStatus} />
                    {selectedEmployeeIdSet.has(person.id) ? (
                      <Badge variant="info">Selected</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{person.officeName}{person.divisionName ? ` — ${person.divisionName}` : ''}</Badge>
                  <Badge>{`${person.sampleCount ?? 0} sample(s)`}</Badge>
                  {person.duplicateReviewRequired ? <Badge variant="warning">Duplicate review</Badge> : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ActionButton
                    className="border-black/10 bg-white text-ink hover:bg-stone-100"
                    onClick={() => setEditingEmployee(person)}
                  >
                    {person.lifecycleStatus === 'pending' ? 'Review record' : 'Manage record'}
                  </ActionButton>
                  <ActionButton
                    className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                    onClick={() => setDeletingEmployee(person)}
                  >
                    Delete employee
                  </ActionButton>
                </div>
              </div>
            ))
          )}
        </div>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="w-12 px-5 py-3">
                <input
                  checked={allPageSelected}
                  className="h-4 w-4 rounded border-black/15 text-navy focus:ring-navy"
                  onChange={toggleSelectAllOnPage}
                  type="checkbox"
                />
              </th>
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3">Samples</th>
              <th className="px-5 py-3">Lifecycle</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white">
            {!employeesLoaded ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : employees.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-center text-muted" colSpan={6}>No employees match the current filters.</td>
              </tr>
            ) : (
              employees.map((person) => (
                <tr key={person.id} className={`bg-white ${selectedEmployeeIdSet.has(person.id) ? 'bg-navy/[0.03]' : ''}`}>
                  <td className="px-5 py-3">
                    <input
                      checked={selectedEmployeeIdSet.has(person.id)}
                      className="h-4 w-4 rounded border-black/15 text-navy focus:ring-navy"
                      onChange={() => toggleSelectedEmployee(person.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/10 text-sm font-bold text-navy-dark">
                        {String(person.name || '?')[0]}
                      </div>
                      <div>
                        <div className="font-medium text-ink">{person.name}</div>
                        <div className="text-xs uppercase tracking-wider text-muted">{person.employeeId}</div>
                        {person.accessCode ? <div className="text-xs font-semibold text-navy">Access code: {person.accessCode}</div> : null}
                        {person.position ? (
                          <div className="text-xs text-muted">{person.position}</div>
                        ) : null}
                        {person.duplicateReviewRequired ? (
                          <div className="mt-1">
                            <Badge variant="warning">Duplicate review</Badge>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    <div>{person.officeName}</div>
                    {person.divisionName ? (
                      <div className="text-xs text-muted">{person.divisionName}</div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-muted">{person.sampleCount ?? 0}</td>
                  <td className="px-5 py-3"><LifecycleBadge status={person.lifecycleStatus} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <ActionButton
                        className="border-black/10 bg-white text-ink hover:bg-stone-100"
                        onClick={() => setEditingEmployee(person)}
                      >
                        {person.lifecycleStatus === 'pending' ? 'Review' : 'Manage'}
                      </ActionButton>
                      <ActionButton
                        className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                        onClick={() => setDeletingEmployee(person)}
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.section>
  )
}

export const EmployeesPanel = memo(EmployeesPanelInner)
