'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ErrorState, LoadingState, Status, Surface } from '@/components/ui'

const REFRESH_INTERVAL_MS = 120_000

function reportParams(period) {
  const params = new URLSearchParams()
  if (period === 'today') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
    params.set('date', `${value.year}-${value.month}-${value.day}`)
  } else if (period === 'month') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date())
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
    params.set('month', `${value.year}-${value.month}`)
  } else {
    params.set('days', '14')
  }
  return params
}

function toneFor(status) {
  if (['healthy', 'stable', 'sufficient', 'fresh', 'ready'].includes(status)) return 'success'
  if (['failing', 'failed', 'truncated', 'stale'].includes(status)) return 'danger'
  return 'warning'
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '--'
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '--'
}

function formatMs(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} ms` : '--'
}

function StatusCard({ label, evidence }) {
  const status = String(evidence?.status || 'unknown')
  return (
    <div className="min-w-0 border-l-2 border-line pl-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <Status tone={toneFor(status)}>{status}</Status>
      </div>
      <p className="mt-2 text-sm leading-5 text-secondary">{evidence?.detail || 'Evidence is unavailable.'}</p>
    </div>
  )
}

function EvidenceGroup({ title, children }) {
  return (
    <details className="border-t border-line py-1 first:border-t-0">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        {title}
      </summary>
      <div className="grid gap-3 pb-4 text-sm md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </details>
  )
}

function EvidenceValue({ label, value, detail }) {
  return (
    <div className="min-w-0 rounded-control border border-line bg-canvas px-3 py-3">
      <dt className="text-xs font-medium text-secondary">{label}</dt>
      <dd className="mt-1 break-words text-base font-semibold tabular-nums text-foreground">{value ?? '--'}</dd>
      {detail ? <div className="mt-1 text-xs leading-5 text-muted">{detail}</div> : null}
    </div>
  )
}

function Breakdown({ items = [] }) {
  if (!items.length) return <p className="text-sm text-secondary">No evidence in this window.</p>
  return items.map(item => (
    <EvidenceValue
      detail={formatPercent(item.rate)}
      key={item.key}
      label={String(item.key || 'unknown').replaceAll('_', ' ')}
      value={item.count ?? item.total ?? 0}
    />
  ))
}

export function MaintenanceEvidencePanel() {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('today')
  const requestRef = useRef(null)

  const fetchEvidence = useCallback(async ({ refresh = false, selectedPeriod = period } = {}) => {
    if (requestRef.current) return
    if (refresh) setRefreshing(true)
    setError('')
    const controller = new AbortController()
    requestRef.current = controller

    try {
      const response = await fetch(`/api/admin/biometric-benchmark?${reportParams(selectedPeriod)}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok || data?.version !== 2) {
        throw new Error(data?.message || 'Maintenance evidence is unavailable.')
      }
      setPayload(data)
    } catch (fetchError) {
      if (fetchError?.name !== 'AbortError') {
        setError('Refresh failed. Showing the last successful report; values may be stale.')
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [period])

  useEffect(() => {
    fetchEvidence({ selectedPeriod: period })
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchEvidence({ refresh: true, selectedPeriod: period })
      }
    }, REFRESH_INTERVAL_MS)
    return () => {
      window.clearInterval(interval)
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [fetchEvidence, period])

  const exportJson = () => {
    if (!payload) return
    const dateKey = new Date().toISOString().slice(0, 10)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `maintenance-evidence-${dateKey}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  if (loading && !payload) {
    return <Surface className="p-5"><LoadingState>Loading maintenance evidence…</LoadingState></Surface>
  }
  if (!payload) {
    return <ErrorState description={error || 'Maintenance evidence is unavailable.'} title="System maintenance unavailable" />
  }

  const statuses = payload.statuses || {}
  const evidence = payload.evidence || {}
  const verification = payload.verification1to1 || {}
  const capture = payload.capture || {}
  const performance = payload.performance || {}
  const population = payload.population || {}
  const system = payload.system
  const actions = [...(payload.actions || []), ...(system?.actions || [])]
    .filter(action => action?.severity !== 'healthy')

  return (
    <Surface className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">System maintenance</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-secondary">
            <Status tone={evidence.truncated ? 'danger' : 'success'}>
              {evidence.truncated ? 'Incomplete window' : 'Complete window'}
            </Status>
            <span>{evidence.loadedEvents ?? 0} loaded events</span>
            <span>{payload.window?.label || 'Selected period'}</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">
            Read-only operational evidence. It does not change biometric profiles, thresholds, attendance, or employee records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" aria-label="Evidence period">
            {[
              ['today', 'Today'],
              ['month', 'This month'],
              ['recent', '14 days'],
            ].map(([key, label]) => (
              <Button
                aria-pressed={period === key}
                className="px-3"
                key={key}
                onClick={() => setPeriod(key)}
                variant={period === key ? 'primary' : 'secondary'}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button disabled={refreshing} onClick={exportJson} variant="secondary">Export JSON</Button>
          <Button disabled={refreshing} onClick={() => fetchEvidence({ refresh: true })} variant="secondary">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-control border border-warning-line bg-warning-surface px-3 py-3 text-sm text-warning" role="status">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatusCard evidence={statuses.telemetry} label="Telemetry" />
        <StatusCard evidence={statuses.verification1to1} label="1:1 verification" />
        <StatusCard evidence={statuses.capture} label="Capture quality" />
        <StatusCard evidence={statuses.performance} label="Performance" />
        {system ? (
          <StatusCard
            evidence={{
              status: system.runtime?.status,
              detail: system.runtime?.buildIdentified
                ? `Build ${system.runtime.buildId} is identified.`
                : 'Runtime build identity is unavailable.',
            }}
            label="Runtime"
          />
        ) : null}
        {system ? (
          <StatusCard
            evidence={{
              status: system.dailySummary?.status,
              detail: `${system.dailySummary?.parityMismatchCount ?? 0} daily summary mismatch(es).`,
            }}
            label="Daily summary"
          />
        ) : null}
      </div>

      {actions.length ? (
        <section className="mt-5 border-t border-line pt-5" aria-labelledby="maintenance-actions-title">
          <h3 className="text-base font-semibold text-foreground" id="maintenance-actions-title">Action required</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {actions.map(action => (
              <div className="rounded-control border border-line bg-canvas px-3 py-3" key={action.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">{action.title}</h4>
                  <Status tone={action.severity === 'critical' ? 'danger' : 'warning'}>{action.severity}</Status>
                </div>
                <p className="mt-1 text-sm leading-5 text-secondary">{action.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-5 border-t border-line">
        <EvidenceGroup title="1:1 verification">
          <EvidenceValue label="Comparison outcomes" value={verification.denominator ?? 0} />
          <EvidenceValue label="Verified identity" value={formatPercent(verification.verifiedIdentityRate)} detail={`${verification.verifiedIdentityCount ?? 0} outcomes`} />
          <EvidenceValue label="Claimed identity mismatch" value={formatPercent(verification.claimedMismatchRate)} detail={`${verification.claimedMismatchCount ?? 0} outcomes`} />
          <EvidenceValue label="Verified distance p95" value={formatNumber(verification.verifiedDistance?.p95)} />
          <EvidenceValue label="Mismatch distance median" value={formatNumber(verification.mismatchDistance?.p50)} />
          <EvidenceValue label="Observed threshold median" value={formatNumber(verification.threshold?.median)} detail="Observed configuration only; not a recommendation." />
        </EvidenceGroup>

        <EvidenceGroup title="Event outcomes">
          <Breakdown items={payload.breakdowns?.categories} />
        </EvidenceGroup>

        <EvidenceGroup title="Telemetry completeness">
          <EvidenceValue label="Window coverage" value={formatPercent(evidence.coverageRate)} detail={`${evidence.loadedEvents ?? 0} of ${evidence.totalWindowEvents ?? 0} events loaded`} />
          <EvidenceValue label="Identity attribution" value={formatPercent(evidence.identityAttributionCoverageRate)} />
          <EvidenceValue label="Server-authoritative evidence" value={formatPercent(evidence.serverAuthoritativeCoverageRate)} />
          <EvidenceValue label="Match distance coverage" value={formatPercent(evidence.matchDistanceCoverageRate)} />
          <EvidenceValue label="Timing coverage" value={formatPercent(evidence.timingCoverageRate)} />
          <EvidenceValue label="Unknown outcomes" value={evidence.unknownOutcomeCount ?? 0} />
        </EvidenceGroup>

        <EvidenceGroup title="Capture and devices">
          <EvidenceValue label="Capture failure rate" value={formatPercent(capture.failureRate)} detail={`${capture.failureCount ?? 0} failures`} />
          <EvidenceValue label="Device groups" value={capture.byDevice?.length ?? 0} />
          <EvidenceValue label="Browser groups" value={capture.byBrowser?.length ?? 0} />
        </EvidenceGroup>

        <EvidenceGroup title="Performance">
          <EvidenceValue label="Server median" value={formatMs(performance.totalServerMs?.p50)} />
          <EvidenceValue label="Server p95" value={formatMs(performance.totalServerMs?.p95)} />
          <EvidenceValue label="Timed events" value={performance.totalServerMs?.count ?? 0} />
        </EvidenceGroup>

        <EvidenceGroup title="Employee coverage">
          <EvidenceValue label="Current employees" value={population.currentApprovedActiveEmployees ?? 0} />
          <EvidenceValue label="Represented employees" value={population.representedCurrentEmployees ?? 0} />
          <EvidenceValue label="Coverage" value={formatPercent(population.coverageRate)} />
          <EvidenceValue label="Repeated mismatch candidates" value={population.repeatedMismatchCandidates?.length ?? 0} />
          <EvidenceValue label="Unattributed failures" value={population.unattributedVerificationFailures ?? 0} />
        </EvidenceGroup>

        {system ? (
          <EvidenceGroup title="Regional runtime">
            <EvidenceValue label="Database" value={system.database?.connected ? 'Connected' : 'Unavailable'} detail={system.database?.serverVersion ? `PostgreSQL ${system.database.serverVersion}` : ''} />
            <EvidenceValue label="Database latency" value={formatMs(system.database?.latencyMs)} />
            <EvidenceValue label="Migrations" value={system.migrations?.status || 'unknown'} detail={`${system.migrations?.pending?.length ?? 0} pending`} />
            <EvidenceValue label="File storage" value={system.storage?.status || 'unknown'} />
            <EvidenceValue label="Human models" value={system.models?.human?.status || 'unknown'} />
            <EvidenceValue label="OpenVINO files" value={system.models?.openvino?.status || 'unknown'} detail={system.models?.openvino?.inferenceVerified ? 'Inference verified' : 'Inference not verified'} />
            <EvidenceValue label="Node runtime" value={system.runtime?.nodeVersion || 'unknown'} detail={system.runtime?.buildId ? `Build ${system.runtime.buildId}` : 'Build ID unavailable'} />
            <EvidenceValue label="Daily summary" value={system.dailySummary?.status || 'unknown'} detail={system.dailySummary?.dateKey || ''} />
          </EvidenceGroup>
        ) : null}
      </div>
    </Surface>
  )
}
