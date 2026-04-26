import {
  PAD_GRAY_ZONE_THRESHOLD,
  MIN_SCAN_DESCRIPTOR_SPREAD,
  MIN_SCAN_STRICT_FRAMES,
} from '@/lib/attendance/capture-policy'
import { calculateDistanceMeters } from '@/lib/offices'

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
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
  void riskFlags
  return 'passive'
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
