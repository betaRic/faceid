export const HR_POLICY_FIELDS = Object.freeze([
  'schedule',
  'workingDays',
  'wfhDays',
  'morningIn',
  'morningOut',
  'afternoonIn',
  'afternoonOut',
  'gracePeriodMinutes',
  'checkInCooldownMinutes',
  'checkOutCooldownMinutes',
])

export function pickHrWorkPolicy(value) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    HR_POLICY_FIELDS
      .filter(field => Object.hasOwn(source, field))
      .map(field => [field, source[field]]),
  )
}

export function toHrOfficeSettings(office = {}) {
  return {
    id: String(office.id || ''),
    name: String(office.name || ''),
    workPolicy: pickHrWorkPolicy(office.workPolicy),
  }
}

export function toHrOfficeSummary(office = {}, employees = 0) {
  return {
    id: String(office.id || ''),
    code: String(office.code || ''),
    officeType: String(office.officeType || ''),
    name: String(office.name || ''),
    shortName: String(office.shortName || ''),
    status: String(office.status || 'active'),
    divisions: Array.isArray(office.divisions)
      ? office.divisions.map(division => ({
          id: String(division?.id || ''),
          name: String(division?.name || ''),
          shortName: String(division?.shortName || ''),
        }))
      : [],
    workPolicy: pickHrWorkPolicy(office.workPolicy),
    employees: Number(employees),
  }
}
