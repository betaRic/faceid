const DEFAULT_WORK_POLICY = {
  schedule: '',
  workingDays: [],
  wfhDays: [],
  morningIn: '08:00',
  morningOut: '12:00',
  afternoonIn: '13:00',
  afternoonOut: '17:00',
  gracePeriodMinutes: 0,
  checkInCooldownMinutes: 30,
  checkOutCooldownMinutes: 5,
}

export function normalizeOfficeRecord(office) {
  return {
    ...office,
    gps: {
      latitude: Number(office?.gps?.latitude),
      longitude: Number(office?.gps?.longitude),
      radiusMeters: Number(office?.gps?.radiusMeters),
    },
    workPolicy: {
      ...DEFAULT_WORK_POLICY,
      ...(office?.workPolicy || {}),
      workingDays: Array.isArray(office?.workPolicy?.workingDays) ? office.workPolicy.workingDays.map(Number) : [],
      wfhDays: Array.isArray(office?.workPolicy?.wfhDays) ? office.workPolicy.wfhDays.map(Number) : [],
      gracePeriodMinutes: Number(office?.workPolicy?.gracePeriodMinutes ?? DEFAULT_WORK_POLICY.gracePeriodMinutes),
      checkInCooldownMinutes: Number(office?.workPolicy?.checkInCooldownMinutes ?? DEFAULT_WORK_POLICY.checkInCooldownMinutes),
      checkOutCooldownMinutes: Number(office?.workPolicy?.checkOutCooldownMinutes ?? DEFAULT_WORK_POLICY.checkOutCooldownMinutes),
      morningIn: String(office?.workPolicy?.morningIn || DEFAULT_WORK_POLICY.morningIn),
      morningOut: String(office?.workPolicy?.morningOut || DEFAULT_WORK_POLICY.morningOut),
      afternoonIn: String(office?.workPolicy?.afternoonIn || DEFAULT_WORK_POLICY.afternoonIn),
      afternoonOut: String(office?.workPolicy?.afternoonOut || DEFAULT_WORK_POLICY.afternoonOut),
      schedule: String(office?.workPolicy?.schedule || DEFAULT_WORK_POLICY.schedule),
    },
  }
}

export function isOfficeWfhDay(office, date = new Date()) {
  if (!office) return false
  return office.workPolicy.wfhDays.includes(date.getDay())
}

export function getOfficeModeLabel(office, date = new Date()) {
  return isOfficeWfhDay(office, date) ? 'WFH' : 'On-site'
}

export function calculateDistanceMeters(from, to) {
  const earthRadius = 6371000
  const dLat = toRadians(to.latitude - from.latitude)
  const dLon = toRadians(to.longitude - from.longitude)
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadius * c
}

function toRadians(value) {
  return (value * Math.PI) / 180
}
