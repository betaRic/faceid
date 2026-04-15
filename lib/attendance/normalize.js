import { DESCRIPTOR_LENGTH } from '@/lib/config'

export function normalizeEntry(body) {
  const captureContext = body?.captureContext && typeof body.captureContext === 'object'
    ? body.captureContext
    : {}
  return {
    name: String(body?.name || '').trim(),
    employeeId: String(body?.employeeId || '').trim(),
    officeId: String(body?.officeId || '').trim(),
    officeName: String(body?.officeName || '').trim(),
    attendanceMode: String(body?.attendanceMode || '').trim(),
    geofenceStatus: String(body?.geofenceStatus || '').trim(),
    confidence: Number(body?.confidence ?? 0),
    timestamp: Number(body?.timestamp),
    date: String(body?.date || '').trim(),
    dateKey: String(body?.dateKey || '').trim(),
    dateLabel: String(body?.dateLabel || '').trim(),
    time: String(body?.time || '').trim(),
    latitude: body?.latitude == null ? null : Number(body.latitude),
    longitude: body?.longitude == null ? null : Number(body.longitude),
    wifiSsid: Array.isArray(body?.wifiSsid) ? body.wifiSsid[0] : (String(body?.wifiSsid || '').trim() || null),
    descriptor: Array.isArray(body?.descriptor) ? body.descriptor.map(Number) : [],
    landmarks: Array.isArray(body?.landmarks) ? body.landmarks : [],
    antispoof: body?.antispoof == null ? null : Number(body.antispoof),
    liveness: body?.liveness == null ? null : Number(body.liveness),
    captureContext: {
      userAgent: String(captureContext.userAgent || '').slice(0, 512),
      platform: String(captureContext.platform || '').slice(0, 120),
      mobile: Boolean(captureContext.mobile),
      deviceMemoryGb: Number.isFinite(captureContext.deviceMemoryGb) ? Number(captureContext.deviceMemoryGb) : null,
      hardwareConcurrency: Number.isFinite(captureContext.hardwareConcurrency) ? Number(captureContext.hardwareConcurrency) : null,
      captureResolution: String(captureContext.captureResolution || '').slice(0, 24),
      verificationFrames: Number.isFinite(captureContext.verificationFrames) ? Number(captureContext.verificationFrames) : null,
      descriptorSpread: Number.isFinite(captureContext.descriptorSpread) ? Number(captureContext.descriptorSpread) : null,
    },
  }
}

export function validateEntry(entry) {
  if (
    entry.descriptor.length !== DESCRIPTOR_LENGTH ||
    entry.descriptor.some(value => !Number.isFinite(value))
  ) {
    return `Face descriptor is invalid. Expected ${DESCRIPTOR_LENGTH} finite values.`
  }

  if ((entry.latitude == null) !== (entry.longitude == null)) {
    return 'GPS coordinates must include both latitude and longitude.'
  }

  if (entry.latitude != null && !Number.isFinite(entry.latitude)) {
    return 'Latitude is not valid.'
  }

  if (entry.longitude != null && !Number.isFinite(entry.longitude)) {
    return 'Longitude is not valid.'
  }

  if (entry.latitude != null && (entry.latitude < -90 || entry.latitude > 90)) {
    return 'Latitude must be between -90 and 90 degrees.'
  }

  if (entry.longitude != null && (entry.longitude < -180 || entry.longitude > 180)) {
    return 'Longitude must be between -180 and 180 degrees.'
  }

  const now = Date.now()
  const MAX_FUTURE_MS = 60000
  const MAX_PAST_MS = 3600000

  if (entry.timestamp != null && !Number.isFinite(entry.timestamp)) {
    return 'Timestamp is not valid.'
  }

  if (entry.timestamp != null && (entry.timestamp > now + MAX_FUTURE_MS || entry.timestamp < now - MAX_PAST_MS)) {
    return 'Timestamp is out of acceptable range.'
  }

  return null
}
