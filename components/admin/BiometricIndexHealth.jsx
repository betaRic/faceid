'use client'

import { useEffect, useState } from 'react'
import { SkeletonLine } from './Skeleton'

export function BiometricIndexHealth({ onRebuildRequest }) {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rebuilding, setRebuilding] = useState(false)

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/admin/biometric-index/health')
      const data = await res.json()
      if (data.ok) setHealth(data)
    } catch {
      // Silently fail - health check is non-critical
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleRebuild = async () => {
    setRebuilding(true)
    try {
      const res = await fetch('/api/admin/maintenance/biometric-index', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        await fetchHealth()
        onRebuildRequest?.(data)
      }
    } catch {
      // Silently fail
    } finally {
      setRebuilding(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
        <div className="flex items-center gap-3">
          <SkeletonLine className="h-4 w-4 rounded-full" />
          <SkeletonLine className="h-4 w-32" />
        </div>
      </div>
    )
  }

  if (!health) return null

  const statusColor = {
    healthy: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    critical: 'bg-red-100 text-red-800',
  }[health.status] || 'bg-stone-100 text-stone-800'

  const statusLabel = {
    healthy: 'Index healthy',
    warning: 'Index needs sync',
    critical: 'Index critical',
  }[health.status] || 'Index status unknown'

  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
            {statusLabel}
          </span>
          <div className="text-xs text-muted">
            <span className="font-semibold text-ink">{health.indexedPersonsCount}</span>
            {' / '}
            <span>{health.personsWithSamples}</span>
            {' persons indexed'}
          </div>
        </div>
        {(health.missingFromIndex > 0 || health.indexBreakdown?.byApprovalStatus?.pending > 0) && (
          <button
            className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
            disabled={rebuilding}
            onClick={handleRebuild}
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild Index'}
          </button>
        )}
        {health.missingFromIndex === 0 && health.indexBreakdown?.byApprovalStatus?.pending === 0 && (
          <button
            className="rounded-full border border-navy/20 bg-navy/5 px-4 py-2 text-xs font-semibold text-navy transition hover:bg-navy/10 disabled:opacity-50"
            disabled={rebuilding}
            onClick={handleRebuild}
          >
            {rebuilding ? 'Rebuilding...' : 'Force Rebuild'}
          </button>
        )}
      </div>
    </div>
  )
}
