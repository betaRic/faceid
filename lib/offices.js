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

export const REGIONAL_OFFICE_TYPE = 'Regional Office'

export function slugifyDivisionId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeDivisionRecord(division) {
  const shortName = String(division?.shortName || '').trim()
  const name = String(division?.name || '').trim()
  const id = String(division?.id || '').trim() || slugifyDivisionId(shortName || name)
  return {
    id,
    shortName,
    name,
    headName: String(division?.headName || '').trim(),
    headPosition: String(division?.headPosition || '').trim(),
  }
}

export function normalizeDivisionList(divisions) {
  if (!Array.isArray(divisions)) return []
  const seen = new Set()
  const result = []
  for (const raw of divisions) {
    const division = normalizeDivisionRecord(raw)
    if (!division.id || !division.name) continue
    if (seen.has(division.id)) continue
    seen.add(division.id)
    result.push(division)
  }
  return result
}

export function normalizeOfficeRecord(office) {
  return {
    ...office,
    headName: String(office?.headName || '').trim(),
    headPosition: String(office?.headPosition || '').trim(),
    divisions: normalizeDivisionList(office?.divisions),
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

export function isRegionalOffice(office) {
  return String(office?.officeType || '').trim() === REGIONAL_OFFICE_TYPE
}

export function findOfficeDivision(office, divisionId) {
  if (!office || !divisionId) return null
  const target = String(divisionId).trim()
  if (!target) return null
  return (office.divisions || []).find(d => d?.id === target) || null
}

export function resolveOfficeSignatory(office, divisionId) {
  if (isRegionalOffice(office)) {
    const division = findOfficeDivision(office, divisionId)
    if (division) {
      return {
        name: division.headName || '',
        position: division.headPosition || '',
      }
    }
  }
  return {
    name: String(office?.headName || ''),
    position: String(office?.headPosition || ''),
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
