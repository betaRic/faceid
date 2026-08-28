'use client'

import { memo, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices, useAttendance, useEmployees } from '@/lib/admin/hooks'
import { MaintenanceEvidencePanel } from './MaintenanceEvidencePanel'
import { Button, LoadingState, PageHeader, Status, Surface } from '@/components/ui'

function MetricCard({ label, value }) {
  return (
    <div className="border-l-2 border-line pl-4">
      <div className="text-sm text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  )
}

function BiometricFollowUpCard({ onOpenEmployees }) {
  const [state, setState] = useState({ loading: true, candidates: [], error: '' })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch('/api/admin/reenrollment-candidates?limit=4&days=14', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const data = await res.json().catch(() => null)
        if (!cancelled && res.ok) {
          setState({ loading: false, candidates: data?.biometricFollowUp || [], error: '' })
        } else if (!cancelled) {
          setState({ loading: false, candidates: [], error: 'Biometric follow-up could not be loaded.' })
        }
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          setState({ loading: false, candidates: [], error: 'Biometric follow-up could not be loaded.' })
        }
      }
    }

    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return (
    <Surface className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Biometric follow-up</h2>
        <p className="mt-1 text-sm text-secondary">Profiles are listed for missing biometrics or when repeated failed matches warrant administrator review.</p>
      </div>
      {state.loading ? (
        <LoadingState>Loading follow-up…</LoadingState>
      ) : state.error ? (
        <div className="text-sm text-secondary" role="status">{state.error}</div>
      ) : state.candidates.length === 0 ? (
        <div className="text-sm text-secondary">No biometric follow-up is currently flagged.</div>
      ) : (
        <div className="grid gap-3">
          {state.candidates.map(candidate => (
            <div key={candidate.personId} className="border-t border-line px-1 py-3 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{candidate.name}</div>
                  <div className="mt-1 text-xs text-muted">
                    {[candidate.employeeId, candidate.officeName || 'Unassigned office'].filter(Boolean).join(' • ')}
                  </div>
                </div>
                <Status tone="warning">
                  {candidate.followUpReason === 'missing_biometrics'
                    ? 'Missing biometrics'
                    : `${candidate.claimedMismatchCount || 0} identity mismatches`}
                </Status>
              </div>
              <div className="mt-2 text-xs text-muted">
                {candidate.followUpReason === 'missing_biometrics'
                  ? 'No active biometric samples'
                  : 'Repeated claimed identity mismatch'}
                {' • '}{candidate.descriptorCount || 0} sample(s)
              </div>
            </div>
          ))}
        </div>
      )}
      <Button variant="secondary" onClick={onOpenEmployees}>
        Review employees
      </Button>
    </Surface>
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
    <Surface className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Scan device activity</h2>
      </div>
      {state.summary ? (
        <dl className="grid grid-cols-3 divide-x divide-line rounded-control border border-line">
          {['active', 'idle', 'stale'].map((key) => (
            <div className="px-3 py-3 text-center" key={key}>
              <dt className="text-xs capitalize text-secondary">{key}</dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">{state.summary[key]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="text-sm text-muted">{state.loading ? 'Loading devices...' : 'No scan telemetry yet.'}</div>
      )}
      {state.devices.length > 0 ? (
        <div className="grid gap-3">
          {state.devices.map(device => (
            <div key={device.kioskId} className="border-t border-line px-1 py-3 text-sm first:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate font-semibold text-ink">{device.kioskId}</div>
                <Status tone={device.status === 'active' ? 'success' : device.status === 'idle' ? 'warning' : 'danger'}>{device.status}</Status>
              </div>
              <div className="mt-1 text-xs text-muted">{device.officeName || 'Unassigned office'} • {device.source}</div>
              <div className="mt-1 text-xs text-muted">{device.lastDecisionCode || 'No recent decision recorded'}</div>
            </div>
          ))}
        </div>
      ) : null}
    </Surface>
  )
}

function DashboardPanelInner() {
  const { offices, visibleOffices } = useOffices()
  const { attendanceLoaded, todaysLogs } = useAttendance()
  const { employeeTotal, employeesLoaded } = useEmployees()
  const { admins, adminsLoaded, roleScope, setActivePanel } = useAdminStore(useShallow((state) => ({
    admins: state.admins,
    adminsLoaded: state.adminsLoaded,
    roleScope: state.roleScope,
    setActivePanel: state.setActivePanel,
  })))
  const [showBenchmark, setShowBenchmark] = useState(false)

  const employeeMetric = employeesLoaded
    ? String(employeeTotal).padStart(2, '0')
    : String(offices.reduce((total, office) => total + Number(office.employees || 0), 0)).padStart(2, '0')

  return (
    <section className="flex min-h-0 flex-col gap-4 md:h-full md:overflow-hidden">
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
        <div className="grid gap-5">
          <PageHeader title="Operations overview" description="Current staffing, attendance, scan-device activity, and items requiring administrator review." />
          <Surface className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Offices" value={String(visibleOffices.length).padStart(2, '0')} />
            <MetricCard label="Employees" value={employeeMetric} />
            <MetricCard label="Today" value={attendanceLoaded ? String(todaysLogs.length).padStart(2, '0') : '--'} />
            <MetricCard label="Admins" value={roleScope === 'regional' && adminsLoaded ? String(admins.length).padStart(2, '0') : '--'} />
          </Surface>

          <div className="grid gap-5 xl:grid-cols-2">
            <BiometricFollowUpCard onOpenEmployees={() => setActivePanel('employees')} />
            <KioskDevicesCard />
          </div>

          <Surface className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">System diagnostics</h2>
                <p className="mt-1 text-sm text-muted">
                  Keep this collapsed during normal admin work. Open it when you need scan quality and device breakdowns.
                </p>
              </div>
              <Button
                onClick={() => setShowBenchmark((value) => !value)}
                variant="secondary"
              >
                {showBenchmark ? 'Hide diagnostics' : 'Open diagnostics'}
              </Button>
            </div>

            {showBenchmark ? (
              <div className="mt-4">
                <MaintenanceEvidencePanel />
              </div>
            ) : null}
          </Surface>
        </div>
      </div>
    </section>
  )
}

export const DashboardPanel = memo(DashboardPanelInner)
