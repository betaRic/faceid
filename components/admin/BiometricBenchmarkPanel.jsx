'use client'

import { useEffect, useState } from 'react'
import { SkeletonLine } from './Skeleton'

function formatPercent(value) {
  if (!Number.isFinite(value)) return '--'
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`
}

function formatMetric(value, digits = 3) {
  if (!Number.isFinite(value)) return '--'
  return Number(value).toFixed(digits)
}

function statusClasses(status) {
  switch (status) {
    case 'pass': return 'bg-emerald-100 text-emerald-800'
    case 'warn': return 'bg-amber-100 text-amber-800'
    case 'fail': return 'bg-red-100 text-red-800'
    default: return 'bg-stone-100 text-stone-700'
  }
}

function MetricTile({ label, value, detail }) {
  return (
    <div className="rounded-[1.15rem] border border-black/5 bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-ink">{value}</div>
      {detail ? <div className="mt-1 text-[11px] leading-5 text-muted">{detail}</div> : null}
    </div>
  )
}

export function BiometricBenchmarkPanel() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchReport = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await fetch('/api/admin/biometric-benchmark?days=14&limit=1200', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) {
        setReport(data.report)
      }
    } catch {
      // Non-critical dashboard module
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchReport()
    const interval = setInterval(() => fetchReport(true), 120000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
        <div className="grid gap-3">
          <SkeletonLine className="h-4 w-44 rounded-full" />
          <SkeletonLine className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!report) return null

  const mobile = report.byDevice?.mobile || {}
  const desktop = report.byDevice?.desktop || {}
  const gate = report.operationalGate || { status: 'insufficient', checks: [], summary: 'No report available.' }

  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Benchmark Gate</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(gate.status)}`}>
              {gate.status === 'pass'
                ? 'Operational gate passed'
                : gate.status === 'warn'
                  ? 'Operational gate warning'
                  : gate.status === 'fail'
                    ? 'Operational gate failed'
                    : 'Insufficient evidence'}
            </span>
            <span className="text-xs text-muted">
              {report.sampleSize} scan events • {report.windowDays} days
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">{gate.summary}</p>
        </div>
        <button
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:bg-stone-100 disabled:opacity-50"
          disabled={refreshing}
          onClick={() => fetchReport(true)}
          type="button"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <div className="font-semibold">Current truth</div>
        <div className="mt-1">{report.reality?.note}</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Challenge coverage" value={formatPercent(report.summary?.challengeCoverageRate)} detail="Recent requests using the challenge-protected path" />
        <MetricTile label="Mobile no-match" value={formatPercent(mobile.noReliableMatchRate)} detail={`${mobile.total || 0} mobile events`} />
        <MetricTile label="Desktop no-match" value={formatPercent(desktop.noReliableMatchRate)} detail={`${desktop.total || 0} desktop events`} />
        <MetricTile label="Accepted p95 distance" value={formatMetric(report.summary?.acceptedP95Distance)} detail="Lower is better" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.2rem] border border-black/5 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">Gate checks</div>
          <div className="mt-3 grid gap-2">
            {gate.checks.map(check => (
              <div key={check.id} className="rounded-xl border border-black/5 bg-stone-50 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">{check.label}</div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses(check.status)}`}>
                    {check.status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  {typeof check.value === 'number' && check.value <= 1
                    ? formatPercent(check.value)
                    : String(check.value ?? '--')}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">{check.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.2rem] border border-black/5 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">Device breakdown</div>
            <div className="mt-3 grid gap-3">
              <MetricTile label="Mobile accepted" value={formatPercent(mobile.acceptedRate)} detail={`median face ratio ${formatMetric(mobile.medianFaceAreaRatio)}`} />
              <MetricTile label="Desktop accepted" value={formatPercent(desktop.acceptedRate)} detail={`median face ratio ${formatMetric(desktop.medianFaceAreaRatio)}`} />
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-black/5 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">Top decision codes</div>
            <div className="mt-3 grid gap-2">
              {report.decisions?.slice(0, 5).map(item => (
                <div key={item.decisionCode} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm">
                  <span className="truncate text-ink">{item.decisionCode}</span>
                  <span className="shrink-0 font-semibold text-muted">{formatPercent(item.rate)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
