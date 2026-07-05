import 'server-only'

import { writeLocalScanEvent } from '@/lib/postgres/attendance-store'

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

function toPlainObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function sanitizeServerTimings(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(timing => ({
      name: String(timing?.name || '').slice(0, 40),
      durationMs: Number.isFinite(timing?.durationMs) ? Math.max(0, Math.round(Number(timing.durationMs))) : null,
    }))
    .filter(timing => timing.name && Number.isFinite(timing.durationMs))
    .slice(0, 20)
}

function sumTimings(timings, names) {
  const allowed = new Set(names)
  const total = timings
    .filter(timing => allowed.has(timing.name))
    .reduce((sum, timing) => sum + Number(timing.durationMs || 0), 0)
  return Number.isFinite(total) && total > 0 ? total : null
}

function summarizeServerPerformance(serverTimings) {
  const totalMeasuredMs = serverTimings.reduce((sum, timing) => sum + Number(timing.durationMs || 0), 0)
  return {
    totalMeasuredMs: totalMeasuredMs > 0 ? Math.round(totalMeasuredMs) : null,
    rateLimitMs: sumTimings(serverTimings, ['rate_limit']),
    serverEmbeddingMs: sumTimings(serverTimings, ['server_embed_1', 'server_embed_2']),
    matchingMs: sumTimings(serverTimings, ['match_1', 'match_2']),
    databaseReadMs: sumTimings(serverTimings, ['offices', 'office', 'daily_logs']),
    databaseWriteMs: sumTimings(serverTimings, ['write_attendance', 'daily_cache', 'scan_event', 'employee_session']),
    timingCount: serverTimings.length,
    timings: serverTimings,
  }
}

export async function writeScanEvent(db, {
  status = 'blocked',
  decisionCode = 'blocked_unknown',
  reason = '',
  entry = {},
  person = null,
  debug = null,
  requestMeta = null,
}) {
  try {
    const descriptor = Array.isArray(entry?.descriptor) ? entry.descriptor : []
    const descriptorMagnitude = descriptor.length > 0
      ? Math.sqrt(descriptor.reduce((sum, value) => sum + (Number(value) * Number(value)), 0))
      : null
    const captureContext = toPlainObject(entry?.captureContext)
    const scanDiagnostics = toPlainObject(entry?.scanDiagnostics)
    const kioskContext = toPlainObject(entry?.kioskContext)
    const challenge = toPlainObject(entry?.challenge)
    const matchDebug = toPlainObject(debug)
    const serverTimings = sanitizeServerTimings(
      scanDiagnostics.serverTimings
      || matchDebug.serverTimings
      || entry?.serverTimings,
    )
    const performance = summarizeServerPerformance(serverTimings)
    const riskFlags = Array.isArray(entry?.riskFlags) ? entry.riskFlags : []
    const geo = {
      latitude: Number.isFinite(entry?.latitude) ? Number(entry.latitude) : null,
      longitude: Number.isFinite(entry?.longitude) ? Number(entry.longitude) : null,
    }

    await writeLocalScanEvent({
      status,
      decisionCode: String(decisionCode || '').slice(0, 80),
      reason: String(reason || '').slice(0, 500),
      timestamp: Number(entry?.timestamp || Date.now()),
      employeeId: String(person?.employeeId || entry?.employeeId || '').slice(0, 64),
      personId: String(person?.id || requestMeta?.personId || '').slice(0, 128),
      name: String(person?.name || entry?.name || '').slice(0, 160),
      officeId: String(person?.officeId || entry?.officeId || requestMeta?.officeId || '').slice(0, 64),
      officeName: String(person?.officeName || entry?.officeName || '').slice(0, 160),
      attendanceMode: String(entry?.attendanceMode || requestMeta?.attendanceMode || '').slice(0, 40),
      geofenceStatus: String(entry?.geofenceStatus || requestMeta?.geofenceStatus || '').slice(0, 120),
      location: geo,
      riskFlags: Array.from(new Set(
        riskFlags
          .map(flag => String(flag || '').trim().toLowerCase())
          .filter(Boolean),
      )).slice(0, 16),
      captureContext,
      scanDiagnostics,
      performance,
      matchDebug,
      requestMeta: requestMeta || {},
      data: {
        verificationMode: String(entry?.verificationMode || 'legacy').slice(0, 80),
        verificationStage: String(entry?.verificationStage || '').slice(0, 40),
        descriptor: {
          length: descriptor.length,
          magnitude: roundMetric(descriptorMagnitude),
        },
        kioskContext: {
          kioskId: String(kioskContext.kioskId || '').slice(0, 120),
          source: String(kioskContext.source || '').slice(0, 40),
        },
        challenge: {
          challengeId: String(challenge.challengeId || challenge.token || '').slice(0, 200),
          mode: String(challenge.mode || '').slice(0, 40),
          motionType: String(challenge.motionType || '').slice(0, 64),
        },
        challengeUsed: Boolean(entry?.challenge?.token),
      },
    })
  } catch {
    // Scan telemetry is non-blocking by design.
  }
}
