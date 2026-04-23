'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { startTransition } from 'react'
import { useEmployees, useOffices } from '@/lib/admin/hooks'
import { Field, Badge, StatusBadge, ApprovalBadge } from '@/components/shared/ui'
import {
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_REJECTED,
} from '@/lib/person-approval'

function ActionButton({ children, onClick, disabled, className = '', busy }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${className} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
      disabled={disabled || busy}
      onClick={onClick}
      type="button"
    >
      {busy ? '...' : children}
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
    employeeStatusFilter, setEmployeeStatusFilter,
    employeeApprovalFilter, setEmployeeApprovalFilter,
    handlePreviousPage, handleNextPage, refreshEmployees,
    handleBulkEmployeeUpdate,
    setEditingEmployee, setDeletingEmployee,
  } = useEmployees()
  const { visibleOffices } = useOffices()
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([])
  const [bulkAction, setBulkAction] = useState('')
  const selectedEmployeeIdSet = useMemo(() => new Set(selectedEmployeeIds), [selectedEmployeeIds])
  const selectedEmployees = useMemo(
    () => employees.filter((person) => selectedEmployeeIdSet.has(person.id)),
    [employees, selectedEmployeeIdSet],
  )
  const allPageSelected = employees.length > 0 && selectedEmployeeIds.length === employees.length
  const pendingOnPage = useMemo(
    () => employees.filter((person) => person.approvalStatus === 'pending'),
    [employees],
  )

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
      approve: {
        updates: { approvalStatus: PERSON_APPROVAL_APPROVED },
        successMessage: `Approved ${selectedEmployees.length} employee(s)`,
        failureMessage: 'Bulk approval incomplete',
        pendingKey: 'employees-bulk-approve',
      },
      reject: {
        updates: { approvalStatus: PERSON_APPROVAL_REJECTED },
        successMessage: `Rejected ${selectedEmployees.length} employee(s)`,
        failureMessage: 'Bulk rejection incomplete',
        pendingKey: 'employees-bulk-reject',
      },
      activate: {
        updates: { active: true },
        successMessage: `Activated ${selectedEmployees.length} employee(s)`,
        failureMessage: 'Bulk activation incomplete',
        pendingKey: 'employees-bulk-activate',
      },
      deactivate: {
        updates: { active: false },
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
      className="flex h-full min-h-0 flex-col gap-5 overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur sm:p-6"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Employees</div>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink">Directory</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Search">
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
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Approval">
            <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setEmployeeApprovalFilter(e.target.value)} value={employeeApprovalFilter}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 px-4 py-3 text-sm">
        <span className="text-muted">
          {employeesLoaded ? `Showing ${employeeTotal} records` : 'Loading...'}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={employees.length === 0} onClick={toggleSelectAllOnPage}>
            {allPageSelected ? 'Clear page' : 'Select page'}
          </ActionButton>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={pendingOnPage.length === 0} onClick={() => setSelectedEmployeeIds(pendingOnPage.map((person) => person.id))}>
            Select pending
          </ActionButton>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={employeeHistoryLength === 0} onClick={handlePreviousPage}>
            ← Prev
          </ActionButton>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" disabled={!employeeHasMore} onClick={handleNextPage}>
            Next →
          </ActionButton>
          <ActionButton className="border-black/10 bg-white text-ink hover:bg-stone-100" onClick={refreshEmployees} busy={!employeesLoaded}>
            Refresh
          </ActionButton>
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
              busy={bulkAction === 'approve'}
              className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              onClick={() => runBulkUpdate('approve')}
            >
              Approve selected
            </ActionButton>
            <ActionButton
              disabled={Boolean(bulkAction)}
              busy={bulkAction === 'reject'}
              className="border-red-200 bg-white text-red-700 hover:bg-red-50"
              onClick={() => runBulkUpdate('reject')}
            >
              Reject selected
            </ActionButton>
            <ActionButton
              disabled={Boolean(bulkAction)}
              busy={bulkAction === 'activate'}
              className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
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

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/5">
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
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge active={person.active !== false} />
                    {selectedEmployeeIdSet.has(person.id) ? (
                      <Badge variant="info">Selected</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ApprovalBadge status={person.approvalStatus} />
                  <Badge>{person.officeName}</Badge>
                  <Badge>{`${person.sampleCount ?? 0} sample(s)`}</Badge>
                  {person.duplicateReviewRequired ? <Badge variant="warning">Duplicate review</Badge> : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ActionButton
                    className="border-black/10 bg-white text-ink hover:bg-stone-100"
                    onClick={() => setEditingEmployee(person)}
                  >
                    {person.approvalStatus === 'pending' ? 'Review record' : 'Manage record'}
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
              <th className="px-5 py-3">Approval</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white">
            {!employeesLoaded ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : employees.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-center text-muted" colSpan={7}>No employees match the current filters.</td>
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
                        {person.duplicateReviewRequired ? (
                          <div className="mt-1">
                            <Badge variant="warning">Duplicate review</Badge>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{person.officeName}</td>
                  <td className="px-5 py-3 text-muted">{person.sampleCount ?? 0}</td>
                  <td className="px-5 py-3"><ApprovalBadge status={person.approvalStatus} /></td>
                  <td className="px-5 py-3"><StatusBadge active={person.active !== false} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <ActionButton
                        className="border-black/10 bg-white text-ink hover:bg-stone-100"
                        onClick={() => setEditingEmployee(person)}
                      >
                        {person.approvalStatus === 'pending' ? 'Review' : 'Manage'}
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
