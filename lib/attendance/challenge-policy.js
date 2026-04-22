import {
  MIN_ACTIVE_TRACE_SAMPLES,
  PAD_GRAY_ZONE_THRESHOLD,
  MIN_SCAN_DESCRIPTOR_SPREAD,
  MIN_SCAN_STRICT_FRAMES,
} from '@/lib/attendance/capture-policy'
import { calculateDistanceMeters } from '@/lib/offices'

export const ACTIVE_CHALLENGE_MOTION_TYPES = [
  'turn_left_center',
  'turn_right_center',
  'chin_down_center',
]

const ACTIVE_CHALLENGE_YAW_TARGET = 0.16
const ACTIVE_CHALLENGE_PITCH_TARGET = 0.18
const ACTIVE_CHALLENGE_CENTER_MAX = 0.1

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function clampTraceSamples(samples) {
  if (!Array.isArray(samples)) return []
  return samples
    .slice(0, 60)
    .map(sample => ({
      timestamp: toFiniteNumber(sample?.timestamp),
      yaw: toFiniteNumber(sample?.yaw),
      pitch: toFiniteNumber(sample?.pitch),
      roll: toFiniteNumber(sample?.roll),
      faceAreaRatio: toFiniteNumber(sample?.faceAreaRatio),
      centeredness: toFiniteNumber(sample?.centeredness),
    }))
    .filter(sample => Number.isFinite(sample.timestamp))
}

export function getMotionInstruction(motionType) {
  switch (motionType) {
    case 'turn_left_center':
      return {
        title: 'Active liveness check',
        label: 'Turn left, then look back at the camera.',
      }
    case 'turn_right_center':
      return {
        title: 'Active liveness check',
        label: 'Turn right, then look back at the camera.',
      }
    case 'chin_down_center':
      return {
        title: 'Active liveness check',
        label: 'Tilt your chin down, then look back at the camera.',
      }
    default:
      return {
        title: 'Active liveness check',
        label: 'Move as instructed, then look back at the camera.',
      }
  }
}

export function pickMotionType(seed = Date.now()) {
  const index = Math.abs(Number(seed || 0)) % ACTIVE_CHALLENGE_MOTION_TYPES.length
  return ACTIVE_CHALLENGE_MOTION_TYPES[index]
}

export function getGeofenceContext(offices, entry) {
  const latitude = toFiniteNumber(entry?.latitude)
  const longitude = toFiniteNumber(entry?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      insideOfficeIds: [],
      likelyWfh: false,
      riskFlags: ['missing_location'],
    }
  }

  const coords = { latitude, longitude }
  const insideOffices = (Array.isArray(offices) ? offices : [])
    .filter(office => (
      Number.isFinite(office?.gps?.latitude)
      && Number.isFinite(office?.gps?.longitude)
      && Number.isFinite(office?.gps?.radiusMeters)
    ))
    .map(office => ({
      id: office.id,
      name: office.name,
      distanceMeters: calculateDistanceMeters(coords, office.gps),
      radiusMeters: Number(office.gps.radiusMeters),
    }))
    .filter(office => office.distanceMeters <= office.radiusMeters)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)

  return {
    ok: true,
    insideOfficeIds: insideOffices.map(office => office.id),
    likelyWfh: insideOffices.length === 0,
    riskFlags: insideOffices.length === 0 ? ['outside_office_geofence'] : [],
  }
}

export function getPreMatchRiskFlags(entry, geofenceContext, recentFailureCount = 0) {
  const captureContext = entry?.captureContext && typeof entry.captureContext === 'object'
    ? entry.captureContext
    : {}
  const scanDiagnostics = entry?.scanDiagnostics && typeof entry.scanDiagnostics === 'object'
    ? entry.scanDiagnostics
    : {}
  const riskFlags = [...(Array.isArray(geofenceContext?.riskFlags) ? geofenceContext.riskFlags : [])]

  if (Number(entry?.antispoof) < PAD_GRAY_ZONE_THRESHOLD || Number(entry?.liveness) < PAD_GRAY_ZONE_THRESHOLD) {
    riskFlags.push('pad_gray_zone')
  }

  if (!Number.isFinite(scanDiagnostics.strictFrames) || Number(scanDiagnostics.strictFrames) < MIN_SCAN_STRICT_FRAMES) {
    riskFlags.push('low_strict_frames')
  }

  if (!Number.isFinite(scanDiagnostics.descriptorSpread) || Number(scanDiagnostics.descriptorSpread) < MIN_SCAN_DESCRIPTOR_SPREAD) {
    riskFlags.push('low_descriptor_spread')
  }

  if (recentFailureCount >= 2) {
    riskFlags.push('recent_failures')
  }

  if (
    captureContext.mobile
    && String(captureContext.screenOrientation || '').toLowerCase().includes('landscape')
  ) {
    riskFlags.push('landscape_mobile_capture')
  }

  return Array.from(new Set(riskFlags))
}

export function resolveChallengeMode(riskFlags = []) {
  const flags = Array.isArray(riskFlags) ? riskFlags : []
  const activeTriggers = [
    'pad_gray_zone',
    'uncertain_match_distance',
    'close_second_match',
    'weak_match_support',
    'weak_temporal_liveness',
  ]
  const hasActiveTrigger = flags.some(flag => activeTriggers.includes(flag))
  return hasActiveTrigger ? 'active' : 'passive'
}

export function getPostMatchRiskFlags(entry, personMatch) {
  const debug = personMatch?.debug && typeof personMatch.debug === 'object'
    ? personMatch.debug
    : {}
  const riskFlags = []

  if (Number.isFinite(debug.bestDistance) && Number(debug.bestDistance) >= 0.72) {
    riskFlags.push('uncertain_match_distance')
  }

  if (
    Number.isFinite(debug.bestDistance)
    && Number.isFinite(debug.secondDistance)
    && (Number(debug.secondDistance) - Number(debug.bestDistance)) < 0.04
  ) {
    riskFlags.push('close_second_match')
  }

  if (String(debug.supportGate || '') === 'weak_single_sample_match') {
    riskFlags.push('weak_match_support')
  }

  if (String(personMatch?.decisionCode || '') === 'blocked_ambiguous_match') {
    riskFlags.push('ambiguous_match')
  }

  return Array.from(new Set(riskFlags))
}

export function normalizeActiveChallengeTrace(trace, fallbackMotionType = '') {
  const value = trace && typeof trace === 'object' ? trace : {}
  return {
    motionType: String(value.motionType || fallbackMotionType || '').trim(),
    startedAt: toFiniteNumber(value.startedAt),
    completedAt: toFiniteNumber(value.completedAt),
    samples: clampTraceSamples(value.samples),
  }
}

function traceHasReturnToCenter(trace) {
  const tail = trace.samples.slice(-3)
  return tail.length > 0 && tail.every(sample => (
    Math.abs(Number(sample.yaw || 0)) <= ACTIVE_CHALLENGE_CENTER_MAX
    && Math.abs(Number(sample.pitch || 0)) <= ACTIVE_CHALLENGE_CENTER_MAX
  ))
}

export function validateActiveChallengeTrace(traceInput, motionType) {
  const trace = normalizeActiveChallengeTrace(traceInput, motionType)
  if (trace.motionType !== motionType) {
    return {
      ok: false,
      message: 'Active challenge motion type does not match the issued challenge.',
      decisionCode: 'blocked_active_challenge',
    }
  }

  if (
    !Number.isFinite(trace.startedAt)
    || !Number.isFinite(trace.completedAt)
    || trace.completedAt < trace.startedAt
    || trace.samples.length < MIN_ACTIVE_TRACE_SAMPLES
  ) {
    return {
      ok: false,
      message: 'Active challenge trace is incomplete.',
      decisionCode: 'blocked_active_challenge',
    }
  }

  const yawValues = trace.samples.map(sample => Number(sample.yaw || 0))
  const pitchValues = trace.samples.map(sample => Number(sample.pitch || 0))

  let motionSatisfied = false
  if (motionType === 'turn_left_center') {
    motionSatisfied = yawValues.some(value => value >= ACTIVE_CHALLENGE_YAW_TARGET)
  } else if (motionType === 'turn_right_center') {
    motionSatisfied = yawValues.some(value => value <= -ACTIVE_CHALLENGE_YAW_TARGET)
  } else if (motionType === 'chin_down_center') {
    motionSatisfied = pitchValues.some(value => value >= ACTIVE_CHALLENGE_PITCH_TARGET)
  }

  if (!motionSatisfied || !traceHasReturnToCenter(trace)) {
    return {
      ok: false,
      message: 'Active motion challenge was not completed correctly.',
      decisionCode: 'blocked_active_challenge',
    }
  }

  return { ok: true, trace }
}
