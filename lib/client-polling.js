'use client'

const DEFAULT_POLL_INTERVAL_MS = 30 * 1000

export function createPollingSubscription(load, onData, onError, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  let active = true
  let inFlight = false
  let timerId = null

  const run = async () => {
    if (!active || inFlight) return

    inFlight = true

    try {
      const payload = await load()
      if (!active) return
      onData?.(payload)
    } catch (error) {
      if (active) onError?.(error)
    } finally {
      inFlight = false
    }
  }

  const schedule = () => {
    if (!active || typeof window === 'undefined') return

    if (timerId) window.clearInterval(timerId)

    timerId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      run()
    }, intervalMs)
  }

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined' || document.hidden) return
    run()
  }

  run()
  schedule()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  return () => {
    active = false

    if (timerId && typeof window !== 'undefined') {
      window.clearInterval(timerId)
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}
