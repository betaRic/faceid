'use client'

import { memo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices, useAttendance, useEmployees } from '@/lib/admin/hooks'
import { BiometricBenchmarkPanel } from './BiometricBenchmarkPanel'

function MetricCard({ label, value }) {
  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-white/80 px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-2 font-display text-3xl font-bold text-ink">{value}</div>
    </div>
  )
}

function ActionButton({ children, onClick, disabled, className = '' }) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${className} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
      disabled={disabled}
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
  const { offices, visibleOffices } = useOffices()
  const { attendanceLoaded, todaysLogs } = useAttendance()
  const { employeeTotal, employeesLoaded } = useEmployees()
  const { admins, adminsLoaded, roleScope, setActivePanel } = useAdminStore()

  const employeeMetric = employeesLoaded
    ? String(employeeTotal).padStart(2, '0')
    : String(offices.reduce((total, office) => total + Number(office.employees || 0), 0)).padStart(2, '0')

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-6 overflow-auto rounded-[2rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur sm:p-6"
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

      <div className="grid gap-5 xl:grid-cols-2">
        <ReenrollmentQueueCard onOpenEmployees={() => setActivePanel('employees')} />
        <KioskDevicesCard />
      </div>

      <BiometricBenchmarkPanel />
    </motion.section>
  )
}

export const DashboardPanel = memo(DashboardPanelInner)
