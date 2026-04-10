'use client'

import { motion } from 'framer-motion'
import { startTransition } from 'react'
import ActionButton from './ActionButton'
import Field from './Field'
import LoadingPanel from './LoadingPanel'
import MetricCard from './MetricCard'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
  PERSON_APPROVAL_REJECTED,
} from '../../lib/person-approval'

function formatApprovalLabel(status) {
  return String(status || '').replace(/\b\w/g, char => char.toUpperCase())
}

function getApprovalBadgeClass(status) {
  if (status === PERSON_APPROVAL_APPROVED) return 'bg-emerald-100 text-emerald-800'
  if (status === PERSON_APPROVAL_PENDING) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-700'
}

function formatRelativeDate(value) {
  if (!value) return null
  try {
    const date = value?.toDate ? value.toDate() : new Date(value)
    const days = Math.floor((Date.now() - date.getTime()) / 86400000)
    if (days === 0) return 'Submitted today'
    if (days === 1) return 'Submitted yesterday'
    return `Submitted ${days} days ago`
  } catch {
    return null
  }
}

export default function EmployeesPanel({
  persons,
  personsLoaded,
  employeeDirectoryTotal,
  employeeDirectoryApprovedCount,
  employeeDirectoryPendingCount,
  employeeDirectoryRejectedCount,
  employeeQuery,
  setEmployeeQuery,
  employeeOfficeFilter,
  setEmployeeOfficeFilter,
  employeeStatusFilter,
  setEmployeeStatusFilter,
  employeeApprovalFilter,
  setEmployeeApprovalFilter,
  visibleOffices,
  employeeDirectoryHistory,
  employeeDirectoryHasMore,
  isPending,
  handlePreviousEmployeePage,
  handleNextEmployeePage,
  refreshEmployeeDirectory,
  setStatus,
  handleEmployeeUpdate,
  handleEmployeeDelete,
  openEmployeeEditor,
  offices,
}) {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-dark">Employees</div>
          <h2 className="mt-2 font-display text-3xl text-ink">Employee directory</h2>
          <p className="mt-2 text-sm leading-7 text-muted">
            Review submissions, approve or reject enrollment records, and manage employee assignments.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Search">
            <input
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => {
                const value = event.target.value
                startTransition(() => setEmployeeQuery(value))
              }}
              placeholder="Name or employee ID"
              value={employeeQuery}
            />
          </Field>
          <Field label="Office">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => setEmployeeOfficeFilter(event.target.value)}
              value={employeeOfficeFilter}
            >
              <option value="all">All offices</option>
              {visibleOffices.map(office => (
                <option key={`employee-office-filter-${office.id}`} value={office.id}>{office.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => setEmployeeStatusFilter(event.target.value)}
              value={employeeStatusFilter}
            >
              <option value="all">All status</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </Field>
          <Field label="Approval">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => setEmployeeApprovalFilter(event.target.value)}
              value={employeeApprovalFilter}
            >
              <option value="all">All approvals</option>
              <option value={PERSON_APPROVAL_PENDING}>Pending review</option>
              <option value={PERSON_APPROVAL_APPROVED}>Approved</option>
              <option value={PERSON_APPROVAL_REJECTED}>Rejected</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <MetricCard label="Results" value={personsLoaded ? String(employeeDirectoryTotal).padStart(2, '0') : '--'} subtle />
        <MetricCard label="Approved" value={personsLoaded ? String(employeeDirectoryApprovedCount).padStart(2, '0') : '--'} subtle />
        <MetricCard label="Pending" value={personsLoaded ? String(employeeDirectoryPendingCount).padStart(2, '0') : '--'} subtle />
        <MetricCard label="Rejected" value={personsLoaded ? String(employeeDirectoryRejectedCount).padStart(2, '0') : '--'} subtle />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-[1.5rem] border border-black/5 bg-stone-50 px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          {personsLoaded
            ? `Showing ${employeeDirectoryTotal} employee records.`
            : 'Preparing employee directory query.'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            className="border border-black/10 bg-white text-ink hover:bg-stone-100"
            label="Refresh"
            onClick={() => {
              setStatus('Refreshing employee directory...')
              refreshEmployeeDirectory()
            }}
          />
          <ActionButton
            className="border border-black/10 bg-white text-ink hover:bg-stone-100"
            disabled={employeeDirectoryHistory.length === 0 || !personsLoaded}
            label="← Previous"
            onClick={handlePreviousEmployeePage}
          />
          <ActionButton
            className="border border-black/10 bg-white text-ink hover:bg-stone-100"
            disabled={!employeeDirectoryHasMore || !personsLoaded}
            label="Next →"
            onClick={handleNextEmployeePage}
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
        {!personsLoaded ? (
          <LoadingPanel
            body="Fetching employee records for the current workspace."
            title="Loading employees"
          />
        ) : (
          <table className="min-w-[860px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="px-5 py-4">Employee</th>
                <th className="px-5 py-4">Office</th>
                <th className="px-5 py-4">Samples</th>
                <th className="px-5 py-4">Approval</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {persons.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-muted" colSpan={6}>
                    No employees match the current filters.
                  </td>
                </tr>
              ) : (
                persons.map(person => {
                  const approvalStatus = getEffectivePersonApprovalStatus(person)
                  const submittedLabel = approvalStatus === PERSON_APPROVAL_PENDING
                    ? formatRelativeDate(person.submittedAt)
                    : null

                  return (
                    <tr key={person.id} className="bg-white">
                      {/* Employee: photo thumbnail + name + ID + submission date */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {person.photoUrl ? (
                            <img
                              alt={person.name}
                              className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-black/5"
                              src={person.photoUrl}
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/10 text-xs font-bold text-navy-dark">
                              {String(person.name || '?')[0]}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-ink">{person.name}</div>
                            <div className="text-xs uppercase tracking-[0.12em] text-muted">{person.employeeId}</div>
                            {submittedLabel ? (
                              <div className="mt-0.5 text-xs text-amber-600">{submittedLabel}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* Office */}
                      <td className="px-5 py-4 text-muted">{person.officeName}</td>

                      {/* Samples */}
                      <td className="px-5 py-4 text-muted">{person.sampleCount ?? 0}</td>

                      {/* Approval — badge only. Full approval change is in the Edit modal. */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${getApprovalBadgeClass(approvalStatus)}`}>
                          {formatApprovalLabel(approvalStatus)}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${person.active === false ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {person.active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>

                      {/* Actions: Edit (all changes via modal) + Activate/Deactivate quick toggle */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            busy={isPending(`employee-update-${person.id}`)}
                            busyLabel="..."
                            className="border border-black/10 bg-white text-ink hover:bg-stone-100"
                            label={approvalStatus === PERSON_APPROVAL_PENDING ? 'Review' : 'Edit'}
                            onClick={() => openEmployeeEditor(person)}
                          />
                          <ActionButton
                            busy={isPending(`employee-update-${person.id}`)}
                            busyLabel="..."
                            className={person.active === false
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}
                            label={person.active === false ? 'Reactivate' : 'Deactivate'}
                            onClick={() => {
                              handleEmployeeUpdate(
                                person,
                                { active: person.active === false },
                                person.active === false ? `${person.name} reactivated` : `${person.name} set inactive`,
                              )
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </motion.section>
  )
}
