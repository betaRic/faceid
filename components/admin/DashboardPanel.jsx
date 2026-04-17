'use client'

import { memo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices, useAttendance, useEmployees, useAdmins } from '@/lib/admin/hooks'
import { BiometricIndexHealth } from './BiometricIndexHealth'
import { BiometricBenchmarkPanel } from './BiometricBenchmarkPanel'

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

function ActionButton({ children, onClick, disabled, className = '', busy = false }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${className} ${(disabled || busy) ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
      disabled={disabled || busy}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function ReenrollmentQueueCard({ onOpenEmployees }) {
  const [state, setState] = useState({ loading: true, candidates: [] })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/admin/reenrollment-candidates?limit=4&days=14', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!cancelled && res.ok) {
          setState({ loading: false, candidates: data?.candidates || [] })
        } else if (!cancelled) {
          setState({ loading: false, candidates: [] })
        }
      } catch {
        if (!cancelled) setState({ loading: false, candidates: [] })
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <section className="flex flex-col gap-4 rounded-[1.5rem] border border-black/5 bg-white p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Biometric refresh</div>
        <h3 className="mt-1 text-lg font-semibold text-ink">Reenrollment queue</h3>
      </div>
      {state.loading ? (
        <div className="text-sm text-muted">Loading queue...</div>
      ) : state.candidates.length === 0 ? (
        <div className="text-sm text-muted">No flagged profiles right now.</div>
      ) : (
        <div className="grid gap-3">
          {state.candidates.map(candidate => (
            <div key={candidate.personId} className="rounded-2xl border border-black/5 bg-stone-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{candidate.name}</div>
                  <div className="mt-1 text-xs text-muted">{candidate.employeeId} • {candidate.officeName || 'Unassigned office'}</div>
                </div>
                <div className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  {candidate.noMatchCount || 0} no-match
                </div>
              </div>
              <div className="mt-2 text-xs text-muted">
                {candidate.reenrollmentReason || 'manual_review'} • {candidate.descriptorCount || 0} sample(s)
              </div>
            </div>
          ))}
        </div>
      )}
      <ActionButton className="border-black/10 bg-stone-50 text-ink hover:bg-white" onClick={onOpenEmployees}>
        Review employees
      </ActionButton>
    </section>
  )
}

function KioskDevicesCard() {
  const [state, setState] = useState({ loading: true, summary: null, devices: [] })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/admin/kiosk-devices', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!cancelled && res.ok) {
          setState({
            loading: false,
            summary: data?.summary || null,
            devices: data?.devices?.slice(0, 4) || [],
          })
        } else if (!cancelled) {
          setState({ loading: false, summary: null, devices: [] })
        }
      } catch {
        if (!cancelled) setState({ loading: false, summary: null, devices: [] })
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <section className="flex flex-col gap-4 rounded-[1.5rem] border border-black/5 bg-white p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Scan devices</div>
        <h3 className="mt-1 text-lg font-semibold text-ink">Device activity</h3>
      </div>
      {state.summary ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-stone-50 px-3 py-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted">Active</div>
            <div className="mt-1 text-xl font-semibold text-ink">{state.summary.active}</div>
          </div>
          <div className="rounded-2xl bg-stone-50 px-3 py-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted">Idle</div>
            <div className="mt-1 text-xl font-semibold text-ink">{state.summary.idle}</div>
          </div>
          <div className="rounded-2xl bg-stone-50 px-3 py-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted">Stale</div>
            <div className="mt-1 text-xl font-semibold text-ink">{state.summary.stale}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted">{state.loading ? 'Loading devices...' : 'No scan telemetry yet.'}</div>
      )}
      {state.devices.length > 0 ? (
        <div className="grid gap-3">
          {state.devices.map(device => (
            <div key={device.kioskId} className="rounded-2xl border border-black/5 bg-stone-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate font-semibold text-ink">{device.kioskId}</div>
                <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  device.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : device.status === 'idle'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                }`}>
                  {device.status}
                </div>
              </div>
              <div className="mt-1 text-xs text-muted">{device.officeName || 'Unassigned office'} • {device.source}</div>
              <div className="mt-1 text-xs text-muted">{device.lastDecisionCode || 'No recent decision recorded'}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function DashboardPanelInner() {
  const { offices, selectedOfficeId, setSelectedOfficeId, activeOffice, visibleOffices } = useOffices()
  const { attendanceLoaded, todaysLogs } = useAttendance()
  const { employeeTotal, employeesLoaded } = useEmployees()
  const { admins, adminsLoaded, roleScope } = useAdminStore()
  const { setActivePanel, setPending, setFirestoreIndexSummary } = useAdminStore()

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
      className="flex h-full min-h-0 flex-col gap-6 overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur sm:p-6"
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
        <MetricCard label="Today" value={attendanceLoaded ? String(todaysLogs.length).padStart(2, '0') : '--'} />
        <MetricCard label="Admins" value={roleScope === 'regional' && adminsLoaded ? String(admins.length).padStart(2, '0') : '--'} />
      </div>

      <div className="grid flex-1 gap-5 lg:grid-cols-[1.2fr_360px]">
        <section className="flex flex-col overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-50">
          <div className="border-b border-black/5 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Office snapshot</div>
            <h3 className="mt-1 text-lg font-semibold text-ink">All offices</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="divide-y divide-black/5 bg-white lg:hidden">
              {visibleOffices.map(office => (
                <div key={office.id} className="grid gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wider text-navy-dark">{office.code || office.shortName}</div>
                      <div className="mt-1 text-base font-semibold text-ink">{office.name}</div>
                    </div>
                    <ActionButton
                      className="border-black/10 bg-white text-ink hover:bg-stone-50"
                      onClick={() => { setSelectedOfficeId(office.id); setActivePanel('office') }}
                    >
                      Open
                    </ActionButton>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted">
                    <div className="rounded-xl bg-stone-50 px-3 py-2">{office.provinceOrCity || office.location || '--'}</div>
                    <div className="rounded-xl bg-stone-50 px-3 py-2">{office.officeType || '--'}</div>
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden min-w-full text-left text-sm lg:table">
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
              <div className="border-t border-black/5" />
              <h4 className="text-sm font-semibold text-ink">Biometric Index</h4>
              <BiometricIndexHealth onRebuildRequest={(data) => useAdminStore.getState().addToast(`Rebuilt: ${data.reindexedCount} entries`, 'success')} />
            </section>
          )}

          <ReenrollmentQueueCard onOpenEmployees={() => setActivePanel('employees')} />
          <KioskDevicesCard />
        </div>
      </div>

      <BiometricBenchmarkPanel />
    </motion.section>
  )
}

export const DashboardPanel = memo(DashboardPanelInner)
