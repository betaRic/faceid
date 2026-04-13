'use client'

import { useEffect, useState } from 'react'
import { useAuditLogs } from '@/lib/admin/hooks/useAuditLogs'
import { SkeletonLine, SkeletonCard } from './Skeleton'

const DECISION_CODES = [
  { value: '', label: 'All failures' },
  { value: 'blocked_no_reliable_match', label: 'Not recognized' },
  { value: 'blocked_liveness_failed', label: 'Photo detected' },
  { value: 'blocked_geofence', label: 'Outside location' },
  { value: 'blocked_inactive', label: 'Inactive account' },
  { value: 'blocked_pending_approval', label: 'Pending approval' },
  { value: 'blocked_wifi_mismatch', label: 'Wrong WiFi' },
  { value: 'blocked_rate_limited', label: 'Rate limited' },
  { value: 'blocked_ambiguous_match', label: 'Ambiguous match' },
]

export function AuditLogsPanel() {
  const { logs, summary, loading, error, fetchLogs, fetchSummary, hasMore, loadMore } = useAuditLogs()
  const [filter, setFilter] = useState('')
  const [view, setView] = useState('summary')
  const [dateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [dateTo] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    fetchSummary(dateFrom, dateTo)
  }, [dateFrom, dateTo, fetchSummary])

  const handleFilterChange = (code) => {
    setFilter(code)
    if (code) {
      fetchLogs({ decisionCode: code, limit: 100 })
      setView('list')
    } else {
      fetchSummary(dateFrom, dateTo)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Audit Logs</h2>
        <select
          className="input w-48"
          value={filter}
          onChange={(e) => handleFilterChange(e.target.value)}
        >
          {DECISION_CODES.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {view === 'summary' && summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricBox
              label="Total Failures"
              value={summary.total}
              color="red"
            />
            {Object.entries(summary.byDecisionCode)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([code, count]) => (
                <MetricBox
                  key={code}
                  label={code.replace('blocked_', '').replace(/_/g, ' ')}
                  value={count}
                  color={count > 10 ? 'red' : count > 5 ? 'amber' : 'green'}
                />
              ))}
          </div>

          <div className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Failure Trend (last 7 days)</h3>
            {loading ? (
              <SkeletonCard lines={3} />
            ) : (
              <div className="space-y-2">
                {Object.entries(summary.byDate || {})
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([date, count]) => (
                    <div key={date} className="flex items-center justify-between text-sm">
                      <span className="text-muted">{date}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 rounded-full bg-stone-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              count > 20 ? 'bg-red-400' : count > 10 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, (count / (summary.total || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-mono text-ink">{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Recent Failures</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {summary.recentLogs?.map(log => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg bg-white p-2 text-xs"
                >
                  <div>
                    <span className={`inline-flex rounded px-1.5 py-0.5 font-medium ${
                      log.decisionCode === 'blocked_no_reliable_match'
                        ? 'bg-red-100 text-red-700'
                        : log.decisionCode === 'blocked_liveness_failed'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-stone-100 text-stone-600'
                    }`}>
                      {log.decisionCode?.replace('blocked_', '') || log.action}
                    </span>
                    <span className="ml-2 text-muted">{log.reason}</span>
                  </div>
                  <span className="text-muted">
                    {log.createdAt?.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === 'list' && (
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))
          ) : logs.length === 0 ? (
            <p className="text-center text-muted py-8">No logs found</p>
          ) : (
            logs.map(log => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg border border-black/5 bg-white p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{log.summary}</p>
                  <p className="text-xs text-muted">
                    {log.metadata?.decisionCode} · {log.createdAt?.slice(0, 19)}
                  </p>
                </div>
                <span className={`ml-2 inline-flex rounded px-2 py-1 text-xs font-medium ${
                  log.action === 'attendance_scan_failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-stone-100 text-stone-600'
                }`}>
                  {log.action}
                </span>
              </div>
            ))
          )}

          {hasMore && (
            <button
              className="btn btn-ghost w-full"
              onClick={() => loadMore({ decisionCode: filter })}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

function MetricBox({ label, value, color }) {
  const colorMap = {
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }

  return (
    <div className={`rounded-[1.25rem] border p-4 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono">{value || 0}</p>
    </div>
  )
}