import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Polls `/api/persons/pending-count` for the header badge.
 *
 * Quota hygiene: one Firestore `count()` aggregation per call, paused while
 * the tab is hidden, default 5-min interval. A visible admin tab costs at most
 * ~12 reads/hour; a backgrounded tab costs zero.
 */
const DEFAULT_INTERVAL_MS = 5 * 60_000
const MIN_VISIBILITY_REFETCH_GAP_MS = 30_000

export function usePendingApprovals(intervalMs = DEFAULT_INTERVAL_MS) {
  const [pendingCount, setPendingCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const lastFetchAtRef = useRef(0)

  const fetchCount = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    lastFetchAtRef.current = Date.now()

    try {
      const res = await fetch('/api/persons/pending-count', {
        signal: abortRef.current.signal,
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.ok) setPendingCount(Number(data.pending) || 0)
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Silent — non-critical, polling will retry
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    const scheduleNext = () => {
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') fetchCount()
      }, intervalMs)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetchAtRef.current >= MIN_VISIBILITY_REFETCH_GAP_MS) {
        fetchCount()
      }
      scheduleNext()
    }

    fetchCount()
    scheduleNext()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      abortRef.current?.abort()
    }
  }, [fetchCount, intervalMs])

  return { pendingCount, loaded, refetch: fetchCount }
}
