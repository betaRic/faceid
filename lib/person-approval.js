export const PERSON_APPROVAL_PENDING = 'pending'
export const PERSON_APPROVAL_APPROVED = 'approved'
export const PERSON_APPROVAL_REJECTED = 'rejected'

export function normalizePersonApprovalStatus(value, fallback = PERSON_APPROVAL_APPROVED) {
  const normalized = String(value || '').trim().toLowerCase()

  if (normalized === PERSON_APPROVAL_PENDING) return PERSON_APPROVAL_PENDING
  if (normalized === PERSON_APPROVAL_APPROVED) return PERSON_APPROVAL_APPROVED
  if (normalized === PERSON_APPROVAL_REJECTED) return PERSON_APPROVAL_REJECTED
  return fallback
}

export function getEffectivePersonApprovalStatus(person, fallback = PERSON_APPROVAL_APPROVED) {
  return normalizePersonApprovalStatus(person?.approvalStatus, fallback)
}

export function isPersonApproved(person) {
  return getEffectivePersonApprovalStatus(person) === PERSON_APPROVAL_APPROVED
}

export function isPersonBiometricActive(person) {
  return person?.active !== false && isPersonApproved(person)
}

