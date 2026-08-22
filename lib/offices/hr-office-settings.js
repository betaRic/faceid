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
