'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { formatAttendanceDateKey } from '../../lib/attendance-time'
import { firebaseEnabled } from '../../lib/firebase/client'
import ActionButton from './ActionButton'
import Field from './Field'
import InfoRow from './InfoRow'
import LoadingPanel from './LoadingPanel'
import MetricCard from './MetricCard'

const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

function getScopeLabel(roleScope) {
  return roleScope === 'office' ? 'Office admin' : 'Regional admin'
}

function formatDays(dayValues = []) {
  if (!dayValues.length) return 'None'
  return dayValues
    .map(dayValue => {
      const date = new Date(Date.UTC(2024, 0, 7 + Number(dayValue)))
      return weekdayFormatter.format(date)
    })
    .join(', ')
}

function formatTime(value) {
  if (!value) return '--'
  const [hours, minutes] = String(value).split(':')
  const numericHours = Number(hours)
  const suffix = numericHours >= 12 ? 'PM' : 'AM'
  const displayHours = ((numericHours + 11) % 12) + 1
  return `${displayHours}:${minutes} ${suffix}`
}

function formatFirestoreIndexSummary(summary) {
  if (!summary) return 'Regional admins can submit the required Firestore composite indexes and field overrides from here.'
  const failureCount = Number(summary?.composite?.failed || 0) + Number(summary?.fieldOverrides?.failed || 0)
  const compositeSummary = `${Number(summary?.composite?.submitted || 0)} submitted / ${Number(summary?.composite?.existing || 0)} existing`
  const fieldSummary = `${Number(summary?.fieldOverrides?.submitted || 0)} field updates`
  return failureCount > 0
    ? `Last sync finished with ${failureCount} failures. Composite: ${compositeSummary}. Field overrides: ${fieldSummary}.`
    : `Last sync submitted successfully. Composite: ${compositeSummary}. Field overrides: ${fieldSummary}.`
}

export default function DashboardPanel({
  roleScope,
  selectedOfficeId,
  offices,
  persons,
  attendance,
  attendanceLoaded,
  admins,
  adminsLoaded,
  baseOffice,
  visibleOffices,
  scopedOfficeCount,
  employeeMetricValue,
  todaysLogs,
  firestoreIndexSummary,
  isPending,
  handleApplyFirestoreIndexes,
  setActivePanel,
  setSelectedOfficeId,
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
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Dashboard</div>
          <h2 className="mt-2 font-display text-3xl text-ink sm:text-4xl">Regional super admin overview</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            This layout replaces the old stacked admin page with a clearer workspace. Use the sidebar to move between sections without scrolling through the entire admin tool.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Region offices" value={String(scopedOfficeCount).padStart(2, '0')} />
        <MetricCard label="Employees" value={employeeMetricValue} />
        <MetricCard label="Today logs" value={attendanceLoaded ? String(todaysLogs).padStart(2, '0') : '--'} />
        <MetricCard label="Admins" value={roleScope === 'regional' ? (adminsLoaded ? String(admins.length).padStart(2, '0') : '--') : '--'} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:min-h-0 xl:flex-1">
        <section className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-50 xl:flex xl:min-h-0 xl:flex-col">
          <div className="border-b border-black/5 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Office snapshot</div>
            <h3 className="mt-2 text-xl font-semibold text-ink">Region XII offices</h3>
          </div>
          <div className="overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/90 text-xs uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-5 py-4">Code</th>
                  <th className="px-5 py-4">Office</th>
                  <th className="px-5 py-4">Province / City</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Employees</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {visibleOffices.map(office => (
                  <tr
                    key={office.id}
                    className="cursor-pointer bg-transparent transition hover:bg-white"
                    onClick={() => {
                      setSelectedOfficeId(office.id)
                      setActivePanel('office')
                    }}
                  >
                    <td className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">{office.code || office.shortName}</td>
                    <td className="px-5 py-4 font-semibold text-ink">{office.name}</td>
                    <td className="px-5 py-4 text-muted">{office.provinceOrCity || office.location}</td>
                    <td className="px-5 py-4 text-muted">{office.officeType}</td>
                    <td className="px-5 py-4 text-muted">{office.employees ?? persons.filter(person => person.officeId === office.id).length}</td>
                    <td className="px-5 py-4">
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                        onClick={event => {
                          event.stopPropagation()
                          setSelectedOfficeId(office.id)
                          setActivePanel('office')
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-5 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_auto]">
          <section className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-5 xl:min-h-0 xl:overflow-auto">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Live summary</div>
            <h3 className="mt-2 text-xl font-semibold text-ink">{baseOffice?.name || 'Office record'}</h3>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Schedule" value={baseOffice?.workPolicy.schedule || '--'} />
              <InfoRow label="Work days" value={formatDays(baseOffice?.workPolicy.workingDays)} />
              <InfoRow label="WFH days" value={formatDays(baseOffice?.workPolicy.wfhDays)} />
              <InfoRow
                label="Duty hours"
                value={baseOffice ? `${formatTime(baseOffice.workPolicy.morningIn)} to ${formatTime(baseOffice.workPolicy.afternoonOut)}` : '--'}
              />
              <InfoRow label="Geofence" value={baseOffice ? `${baseOffice.gps.radiusMeters} m radius` : '--'} />
            </div>
          </section>

          {roleScope === 'regional' ? (
            <section className="rounded-[1.5rem] border border-black/5 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">System maintenance</div>
              <h3 className="mt-2 text-xl font-semibold text-ink">Firestore indexes</h3>
              <p className="mt-2 text-sm leading-7 text-muted">
                This stays in the admin workspace on purpose. Public pages should not be able to mutate Firestore infrastructure.
              </p>
              <div className="mt-4 rounded-[1.25rem] border border-black/5 bg-stone-50 px-4 py-3 text-sm leading-7 text-muted">
                {formatFirestoreIndexSummary(firestoreIndexSummary)}
              </div>
              <div className="mt-4">
                <ActionButton
                  busy={isPending('firestore-index-sync')}
                  busyLabel="Submitting..."
                  className="bg-brand text-white hover:bg-brand-dark"
                  label="Apply required indexes"
                  onClick={handleApplyFirestoreIndexes}
                />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </motion.section>
  )
}
