import { isRegionalOffice } from './offices.js'

export function normalizeHrScope(value) {
  return String(value || '').trim().toLowerCase() === 'regional' ? 'regional' : 'office'
}

export function hrScopeAllowsOffice(session, targetOfficeId) {
  if (session?.role !== 'hr') return false

  const assignedOfficeId = String(session.officeId || '').trim()
  const requestedOfficeId = String(targetOfficeId || '').trim()
  return Boolean(assignedOfficeId && requestedOfficeId && assignedOfficeId === requestedOfficeId)
}

export function validateHrOfficeAssignment(scopeValue, office) {
  const scope = normalizeHrScope(scopeValue)
  if (!office?.id) return 'An assigned office is required for every HR account.'
  if (scope === 'regional' && !isRegionalOffice(office)) {
    return 'Regional HR must be assigned to a Regional Office.'
  }
  if (scope === 'office' && isRegionalOffice(office)) {
    return 'A Regional Office must be assigned to Regional HR.'
  }
  return null
}
