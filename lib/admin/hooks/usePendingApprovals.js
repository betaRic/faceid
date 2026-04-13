import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Polls the person directory for a pending enrollment count.
 * Lightweight: only fetches page metadata (limit=1), not full records.
 */
export function usePendingApprovals(intervalMs = 60_000) {
  const [pendingCount, setPendingCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(null)

  const fetchCount = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/persons?mode=directory&approval=pending&limit=1', {
        signal: abortRef.current.signal,
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.ok) setPendingCount(data.page?.pending || 0)
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Silent — non-critical, polling will retry
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    fetchCount()
    timerRef.current = setInterval(fetchCount, intervalMs)
    return () => {
      clearInterval(timerRef.current)
      abortRef.current?.abort()
    }
  }, [fetchCount, intervalMs])

  return { pendingCount, loaded, refetch: fetchCount }
}