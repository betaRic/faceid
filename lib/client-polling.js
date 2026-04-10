'use client'

const DEFAULT_POLL_INTERVAL_MS = 30 * 1000
const MAX_BACKOFF_MS = 5 * 60 * 1000  // Cap at 5 minutes

/**
 * Creates a polling subscription with exponential backoff on failure.
 *
 * On success: resets to the base interval.
 * On failure: doubles the wait each time (with ±20% jitter), up to MAX_BACKOFF_MS.
 * This prevents thundering herd when the server comes back online after an outage.
 */
export function createPollingSubscription(load, onData, onError, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  let active = true
  let inFlight = false
  let failCount = 0
  let timerId = null

  function getNextDelay() {
    if (failCount === 0) return intervalMs
    const backoff = Math.min(intervalMs * Math.pow(1.6, failCount), MAX_BACKOFF_MS)
    // ±20% jitter to spread out retries from multiple clients
    const jitter = backoff * 0.2 * (Math.random() * 2 - 1)
    return Math.round(backoff + jitter)
  }

  function schedule() {
    if (!active || typeof window === 'undefined') return
    if (timerId) window.clearTimeout(timerId)
    timerId = window.setTimeout(() => {
      timerId = null
      run()
    }, getNextDelay())
  }

  const run = async () => {
    if (!active || inFlight) return

    inFlight = true
    try {
      const payload = await load()
      if (!active) return
      failCount = 0
      onData?.(payload)
    } catch (error) {
      failCount++
      if (active) onError?.(error)
    } finally {
      inFlight = false
      if (active) schedule()
    }
  }

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined' || document.hidden) return
    // Tab became visible — run immediately, reset backoff if we had a failure
    // (the server may have come back while the tab was hidden)
    if (timerId) {
      window.clearTimeout(timerId)
      timerId = null
    }
    run()
  }

  // Initial load
  run()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  return () => {
    active = false
    if (timerId && typeof window !== 'undefined') {
      window.clearTimeout(timerId)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}
