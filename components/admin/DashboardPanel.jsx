'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices, useAttendance, useEmployees, useAdmins } from '@/lib/admin/hooks'
import { BiometricIndexHealth } from './BiometricIndexHealth'

const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

function formatDays(dayValues = []) {
  if (!dayValues.length) return 'None'
  return dayValues
    .map((dayValue) => {
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

function MetricCard({ label, value, subtle }) {
  return (
    <div className={`rounded-[1.5rem] border px-5 py-4 ${subtle ? 'border-black/5 bg-stone-50' : 'border-black/5 bg-white/80'}`}>
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-2 font-display text-3xl font-bold text-ink">{value}</div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value || '--'}</span>
    </div>
  )
}

function ActionButton({ children, onClick, disabled, className = '' }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${className} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function DashboardPanelInner() {
  const { offices, selectedOfficeId, setSelectedOfficeId, activeOffice, visibleOffices } = useOffices()
  const { attendance, attendanceLoaded, todaysLogs } = useAttendance()
  const { employeeTotal, employeesLoaded } = useEmployees()
  const { admins, adminsLoaded, roleScope } = useAdminStore()
  const { setActivePanel, setPending, firestoreIndexSummary, setFirestoreIndexSummary } = useAdminStore()

  const handleApplyIndexes = async () => {
    setPending('firestore-index-sync', true)
    try {
      const res = await fetch('/api/admin/maintenance/firestore-indexes', { method: 'POST' })
      const data = await res.json()
      setFirestoreIndexSummary(data.summary || null)
      useAdminStore.getState().addToast(data.message || 'Index sync completed', 'success')
    } catch {
      useAdminStore.getState().addToast('Index sync failed', 'error')
    }
    setPending('firestore-index-sync', false)
  }

  const employeeMetric = employeesLoaded
    ? String(employeeTotal).padStart(2, '0')
    : String(offices.reduce((t, o) => t + Number(o.employees || 0), 0)).padStart(2, '0')

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col gap-6 rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Dashboard</div>
        <h2 className="font-display text-3xl font-bold text-ink">Overview</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Offices" value={String(visibleOffices.length).padStart(2, '0')} />
        <MetricCard label="Employees" value={employeeMetric} />
        <MetricCard label="Today" value={attendanceLoaded ? String(todaysLogs).padStart(2, '0') : '--'} />
        <MetricCard label="Admins" value={roleScope === 'regional' && adminsLoaded ? String(admins.length).padStart(2, '0') : '--'} />
      </div>

      <div className="grid flex-1 gap-5 xl:grid-cols-[1.2fr_360px]">
        <section className="flex flex-col overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-50">
          <div className="border-b border-black/5 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Office snapshot</div>
            <h3 className="mt-1 text-lg font-semibold text-ink">All offices</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Office</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {visibleOffices.map((office) => (
                  <tr
                    key={office.id}
                    className={`cursor-pointer transition hover:bg-white ${office.id === selectedOfficeId ? 'bg-navy/5' : ''}`}
                    onClick={() => { setSelectedOfficeId(office.id); setActivePanel('office') }}
                  >
                    <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-navy-dark">{office.code || office.shortName}</td>
                    <td className="px-5 py-3 font-medium text-ink">{office.name}</td>
                    <td className="px-5 py-3 text-muted">{office.provinceOrCity || office.location}</td>
                    <td className="px-5 py-3 text-muted">{office.officeType}</td>
                    <td className="px-5 py-3">
                      <ActionButton
                        className="border-black/10 bg-white text-ink hover:bg-stone-50"
                        onClick={(e) => { e.stopPropagation(); setSelectedOfficeId(office.id); setActivePanel('office') }}
                      >
                        Edit
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-5">
          <section className="flex flex-col gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Selected office</div>
            <h3 className="text-lg font-semibold text-ink">{activeOffice?.name || 'Select an office'}</h3>
            {activeOffice && (
              <div className="flex flex-col gap-2">
                <InfoRow label="Schedule" value={activeOffice.workPolicy?.schedule} />
                <InfoRow label="Work days" value={formatDays(activeOffice.workPolicy?.workingDays)} />
                <InfoRow label="WFH days" value={formatDays(activeOffice.workPolicy?.wfhDays)} />
                <InfoRow label="Hours" value={activeOffice.workPolicy ? `${formatTime(activeOffice.workPolicy.morningIn)} - ${formatTime(activeOffice.workPolicy.afternoonOut)}` : '--'} />
                <InfoRow label="Geofence" value={activeOffice.gps ? `${activeOffice.gps.radiusMeters}m` : '--'} />
              </div>
            )}
          </section>

          {roleScope === 'regional' && (
            <section className="flex flex-col gap-4 rounded-[1.5rem] border border-black/5 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">System</div>
              <h3 className="text-lg font-semibold text-ink">Maintenance</h3>
              <ActionButton busy={useAdminStore.getState().isPending('firestore-index-sync')} className="bg-navy text-white hover:bg-navy-dark" onClick={handleApplyIndexes}>
                {useAdminStore.getState().isPending('firestore-index-sync') ? 'Applying...' : 'Apply indexes'}
              </ActionButton>
              <BiometricIndexHealth onRebuildRequest={(data) => useAdminStore.getState().addToast(`Rebuilt: ${data.reindexedCount} entries`, 'success')} />
            </section>
          )}
        </div>
      </div>
    </motion.section>
  )
}

export const DashboardPanel = memo(DashboardPanelInner)
