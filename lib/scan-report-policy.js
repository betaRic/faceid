const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = value => typeof value === 'string' && UUID.test(value)
const reasons = new Set(['no_usable_face', 'insufficient_ready_frames', 'missing_descriptor',
  'multiple_faces', 'invalid_descriptor', 'capture_processing_failed', 'challenge_failed',
  'submission_failed', 'missing_result', 'preview_processing_failed'])
const stages = new Set(['preview', 'capture', 'challenge', 'submission'])
const browsers = new Set(['Chrome', 'Chrome iOS', 'Safari', 'Firefox', 'Edge', 'Opera', 'Facebook/Messenger', 'Unknown'])
const metricLimits = { trackWidth: 16384, trackHeight: 16384, width: 16384, height: 16384,
  attempts: 30, capturedFrames: 30, strictFrames: 30, multiFaceFrames: 30,
  bestFaceAreaRatio: 1, bestCenteredness: 1, bestQualityScore: 100 }

// Used on both sides. Never copy arbitrary client fields into storage/export.
export function sanitizePhoneScanReport(value) {
  if (!value || !isUuid(value.id) || !isUuid(value.sessionId)
    || !reasons.has(value.reason) || !stages.has(value.stage)) return null
  const metrics = {}
  for (const [key, maximum] of Object.entries(metricLimits)) {
    const number = value.metrics?.[key]
    if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= maximum) {
      metrics[key] = Math.round(number * 10000) / 10000
    }
  }
  return {
    id: value.id.toLowerCase(), sessionId: value.sessionId.toLowerCase(),
    reason: value.reason, stage: value.stage,
    elapsedMs: typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs)
      ? Math.round(Math.max(0, Math.min(300000, value.elapsedMs))) : null,
    device: ['mobile', 'desktop'].includes(value.device) ? value.device : 'unknown',
    browser: browsers.has(value.browser) ? value.browser : 'Unknown',
    errorId: isUuid(value.errorId) ? value.errorId.toLowerCase() : null,
    metrics,
  }
}
