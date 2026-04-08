export const REGION12_OFFICES = [
  {
    id: 'r12-regional-office',
    officeType: 'Regional Office',
    name: 'DILG Region XII',
    shortName: 'Region 12',
    location: 'Koronadal City',
    gps: { latitude: 6.4971, longitude: 124.8466, radiusMeters: 180 },
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 15,
    },
    employees: 52,
  },
  {
    id: 'south-cotabato-provincial-office',
    officeType: 'Provincial Office',
    name: 'South Cotabato Provincial Office',
    shortName: 'South Cotabato',
    location: 'Koronadal City',
    gps: { latitude: 6.5003, longitude: 124.8469, radiusMeters: 140 },
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [3],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 15,
    },
    employees: 21,
  },
  {
    id: 'cotabato-provincial-office',
    officeType: 'Provincial Office',
    name: 'Cotabato Provincial Office',
    shortName: 'Cotabato',
    location: 'Kidapawan City',
    gps: { latitude: 7.0083, longitude: 125.0894, radiusMeters: 150 },
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 10,
    },
    employees: 19,
  },
  {
    id: 'sarangani-provincial-office',
    officeType: 'Provincial Office',
    name: 'Sarangani Provincial Office',
    shortName: 'Sarangani',
    location: 'Alabel',
    gps: { latitude: 6.1018, longitude: 125.2917, radiusMeters: 150 },
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [5],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 15,
    },
    employees: 16,
  },
  {
    id: 'gensan-city-office',
    officeType: 'HUC Office',
    name: 'General Santos City Office',
    shortName: 'General Santos City',
    location: 'General Santos City',
    gps: { latitude: 6.1164, longitude: 125.1716, radiusMeters: 120 },
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [2],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 10,
    },
    employees: 24,
  },
]

export function getOfficeOptions() {
  return REGION12_OFFICES.map(office => ({
    id: office.id,
    label: office.name,
  }))
}

export function getOfficeById(officeId) {
  return REGION12_OFFICES.find(office => office.id === officeId) || null
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
