// Desktop browsers often provide a stable Wi-Fi reading rather than GPS.
// Stop at the already-accepted policy limit; reuse only the browser's short cache.
export function getLocationStartupOptions(policy, nav = globalThis.navigator) {
  const ua = String(nav?.userAgent || '')
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)
    || nav?.userAgentData?.mobile === true
    || (/Macintosh|Mac OS X/i.test(ua) && Number(nav?.maxTouchPoints) > 1)
  const desktop = !mobile && /Windows NT|Macintosh|Mac OS X|X11|CrOS/i.test(ua)
  const maxAccuracy = Number(policy.maxAccuracyMeters)
  return {
    ...policy,
    timeout: policy.bootTimeoutMs,
    maximumAge: desktop ? 30000 : 0,
    targetAccuracyMeters: desktop && Number.isFinite(maxAccuracy) && maxAccuracy > 0
      ? maxAccuracy : policy.targetAccuracyMeters,
  }
}

// Keep the device's real accuracy. Never average positions or shrink uncertainty.
export function requestBestDeviceLocation({
  timeout = 30000, maximumAge = 0, targetAccuracyMeters = 50,
  geolocation = globalThis.navigator?.geolocation, signal, onProgress, onComplete,
  maxAccuracyMeters = 250,
} = {}) {
  const monotonicStart = performance.now()
  const startedAt = Date.now()
  let readingCount = 0, firstAccuracy, firstReadingMs, acceptedMs
  const report = (reason, position) => {
    if (!onComplete) return
    const envelope = { stage: 'location', reason, elapsedMs: performance.now() - monotonicStart,
      readingPredatesRequest: position ? position.timestamp < startedAt : null,
      metrics: { firstAccuracy, firstReadingMs, acceptedMs, readingCount,
        bestAccuracy: position?.coords?.accuracy, readingAgeMs: position ? Math.max(0, Date.now() - position.timestamp) : undefined,
        maxAccuracy: maxAccuracyMeters, targetAccuracy: targetAccuracyMeters, maximumAge, timeout } }
    // Diagnostic callbacks cannot change completion or reject attendance startup.
    queueMicrotask(() => { try { onComplete(envelope) } catch {} })
  }
  return new Promise((resolve, reject) => {
    if (!geolocation?.watchPosition) {
      report('unsupported')
      reject(new Error('Location services are not available on this device.'))
      return
    }
    const budget = Math.max(1000, Math.min(60000, Number(timeout) || 30000))
    const age = Math.max(0, Number(maximumAge) || 0)
    let best = null, done = false, watchId, fallbackStarted = false
    const finish = (error, position) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (watchId !== undefined) geolocation.clearWatch(watchId)
      signal?.removeEventListener('abort', abort)
      const reason = error ? error.name === 'AbortError' ? 'cancelled' : Number(error.code) === 1 ? 'permission_denied'
        : Number(error.code) === 3 ? 'timeout' : 'unavailable'
        : position.coords.accuracy <= maxAccuracyMeters ? 'ready' : 'imprecise'
      report(reason, position || best)
      if (error) reject(error)
      else resolve(position)
    }
    const abort = () => finish(new DOMException('Location request cancelled.', 'AbortError'))
    const timer = setTimeout(() => {
      finish(best ? null : Object.assign(new Error('Location request timed out.'), { code: 3 }), best)
    }, budget)
    const receive = position => {
      if (done) return
      const { latitude, longitude, accuracy } = position?.coords || {}
      if (![latitude, longitude, accuracy].every(Number.isFinite)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0) return
      if (!Number.isFinite(position.timestamp) || position.timestamp < startedAt - age) return
      readingCount++
      if (firstReadingMs === undefined) { firstReadingMs = performance.now() - monotonicStart; firstAccuracy = accuracy }
      if (acceptedMs === undefined && accuracy <= maxAccuracyMeters) acceptedMs = performance.now() - monotonicStart
      if (!best || accuracy < best.coords.accuracy) {
        best = position
        onProgress?.({ accuracyMeters: accuracy })
      }
      if (best.coords.accuracy <= targetAccuracyMeters) finish(null, best)
    }
    const failed = error => {
      if (done) return
      if (Number(error?.code) === 1) { finish(error); return }
      // One network-based attempt can help indoor devices, but shares the deadline.
      if (!fallbackStarted && geolocation.getCurrentPosition) {
        fallbackStarted = true
        const remaining = budget - (Date.now() - startedAt)
        if (remaining > 0) geolocation.getCurrentPosition(receive, fallbackError => {
          if (Number(fallbackError?.code) === 1) finish(fallbackError)
        }, { enableHighAccuracy: false, maximumAge: age, timeout: remaining })
      }
    }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      watchId = geolocation.watchPosition(receive, failed, {
        enableHighAccuracy: true, maximumAge: age, timeout: budget,
      })
      if (done) geolocation.clearWatch(watchId)
    } catch (error) { finish(error) }
  })
}
