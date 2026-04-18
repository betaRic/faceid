'use client'

import { memo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { startTransition } from 'react'
import { useEmployees, useOffices } from '@/lib/admin/hooks'
import { Field, Badge, StatusBadge, ApprovalBadge } from '@/components/shared/ui'

function MetricCard({ label, value, subtle }) {
  return (
    <div className={`rounded-[1.5rem] border px-4 py-3 ${subtle ? 'border-black/5 bg-stone-50' : 'border-black/5 bg-white/80'}`}>
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-ink">{value}</div>
    </div>
  )
}

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
    employeeApprovedCount, employeePendingCount, employeeRejectedCount,
    employeeHasMore, employeeHistoryLength,
    employeeQuery, setEmployeeQuery,
    employeeOfficeFilter, setEmployeeOfficeFilter,
    employeeStatusFilter, setEmployeeStatusFilter,
    employeeApprovalFilter, setEmployeeApprovalFilter,
    handlePreviousPage, handleNextPage, refreshEmployees,
    setEditingEmployee, setDeletingEmployee,
  } = useEmployees()
  const { visibleOffices } = useOffices()

  const onSearchChange = useCallback((e) => {
    startTransition(() => setEmployeeQuery(e.target.value))
  }, [setEmployeeQuery])

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

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total" value={employeesLoaded ? String(employeeTotal).padStart(2, '0') : '--'} subtle />
        <MetricCard label="Approved" value={employeesLoaded ? String(employeeApprovedCount).padStart(2, '0') : '--'} subtle />
        <MetricCard label="Pending" value={employeesLoaded ? String(employeePendingCount).padStart(2, '0') : '--'} subtle />
        <MetricCard label="Rejected" value={employeesLoaded ? String(employeeRejectedCount).padStart(2, '0') : '--'} subtle />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 px-4 py-3 text-sm">
        <span className="text-muted">
          {employeesLoaded ? `Showing ${employeeTotal} records` : 'Loading...'}
        </span>
        <div className="flex flex-wrap items-center gap-2">
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
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-ink">{person.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-wider text-muted">{person.employeeId}</div>
                  </div>
                  <StatusBadge active={person.active !== false} />
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
                <td className="px-5 py-10 text-center text-muted" colSpan={6}>No employees match the current filters.</td>
              </tr>
            ) : (
              employees.map((person) => (
                <tr key={person.id} className="bg-white">
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
