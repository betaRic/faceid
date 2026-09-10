import { sanitizePhoneScanReport } from './scan-report-policy.js'
import { getLocationDeviceProfile } from './location-report-policy.js'

export function createScanFailureReporter({ fetchImpl = (...args) => fetch(...args),
  createId = () => globalThis.crypto.randomUUID(), now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const sessionId = createId()
  let pending = 0
  let lastQueued = -Infinity
  return function report(value) {
    try {
      if (pending >= 2 || now() - lastQueued < 1000) return false
      const safe = sanitizePhoneScanReport({ ...value, id: createId(), sessionId })
      if (!safe) return false
      const body = JSON.stringify(safe)
      lastQueued = now()
      pending++
      const send = async (retry = false) => {
        let timer
        let again = false
        try {
          const controller = new AbortController()
          timer = setTimer(() => controller.abort(), 4000)
          const response = await fetchImpl('/api/scan-reports', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body, credentials: 'same-origin', signal: controller.signal, keepalive: true,
          })
          again = response.status >= 500
        } catch { again = true }
        finally {
          clearTimer(timer)
          if (again && !retry) setTimer(() => { void send(true) }, 2000)
          else pending--
        }
      }
      void send()
      return true
    } catch { return false }
  }
}

let reporter
let locationReporter
export function reportLocationCheck(value) {
  try {
    // Separate queue: a location success must not throttle a face failure report.
    locationReporter ||= createScanFailureReporter()
    const profile = getLocationDeviceProfile()
    return locationReporter({ ...profile, ...value, metrics: { ...profile.metrics, ...value.metrics } })
  } catch { return false }
}

export function reportScanFailure(value) {
  try {
    reporter ||= createScanFailureReporter()
    return reporter(value)
  } catch { return false }
}
