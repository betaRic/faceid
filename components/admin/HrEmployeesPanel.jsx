'use client'

import { memo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { startTransition } from 'react'
import { useHrEmployees } from '@/lib/hr/hooks'
import { useAdminStore } from '@/lib/admin/store'
import { ApprovalBadge, Badge, StatusBadge } from '@/components/shared/ui'

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-5 py-4"><div className="h-10 w-10 rounded-full bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-6 w-16 rounded-full bg-stone-200" /></td>
      <td className="px-5 py-4"><div className="h-6 w-16 rounded-full bg-stone-200" /></td>
    </tr>
  )
}

function HrEmployeesPanelInner() {
  const employeeRefreshKey = useAdminStore((state) => state.employeeRefreshKey)
  const setDeletingEmployee = useAdminStore((state) => state.setDeletingEmployee)
  const {
    employees,
    employeesLoaded,
    employeeTotal,
    employeeQuery,
    setEmployeeQuery,
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
  } = useHrEmployees()

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees, employeeRefreshKey])

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-5 overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur sm:p-6"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">HR</div>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink">Employees</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Search</label>
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={(e) => { startTransition(() => setEmployeeQuery(e.target.value)) }}
              placeholder="Name or ID"
              value={employeeQuery}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Status</label>
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={(e) => setEmployeeStatusFilter(e.target.value)}
              value={employeeStatusFilter}
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Approval</label>
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={(e) => setEmployeeApprovalFilter(e.target.value)}
              value={employeeApprovalFilter}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 px-4 py-3 text-sm">
        <span className="text-muted">
          {employeesLoaded ? `${employeeTotal} employees` : 'Loading...'}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100 disabled:opacity-40"
            disabled={employeePage <= 1}
            onClick={handlePreviousPage}
          >
            Prev
          </button>
          <span className="text-xs text-muted">Page {employeePage}</span>
          <button
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100 disabled:opacity-40"
            disabled={!employeeHasMore}
            onClick={handleNextPage}
          >
            Next
          </button>
          <button
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100"
            onClick={fetchEmployees}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/5">
        <div className="divide-y divide-black/5 bg-white md:hidden">
          {loading && !employeesLoaded ? (
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
            employees.map((person) => (
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
                </div>
                <button
                  className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  onClick={() => setDeletingEmployee(person)}
                  type="button"
                >
                  Delete employee
                </button>
              </div>
            ))
          )}
        </div>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3">Approval</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white">
            {loading && !employeesLoaded ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : employees.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-center text-muted" colSpan={5}>No employees match the current filters.</td>
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
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{person.officeName}</td>
                  <td className="px-5 py-3"><ApprovalBadge status={person.approvalStatus} /></td>
                  <td className="px-5 py-3"><StatusBadge active={person.active !== false} /></td>
                  <td className="px-5 py-3">
                    <button
                      className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                      onClick={() => setDeletingEmployee(person)}
                      type="button"
                    >
                      Delete
                    </button>
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

export const HrEmployeesPanel = memo(HrEmployeesPanelInner)
