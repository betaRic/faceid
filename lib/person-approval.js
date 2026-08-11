export const PERSON_APPROVAL_PENDING = 'pending'
export const PERSON_APPROVAL_APPROVED = 'approved'
export const PERSON_APPROVAL_REJECTED = 'rejected'
export const PERSON_LIFECYCLE_PENDING = 'pending'
export const PERSON_LIFECYCLE_ACTIVE = 'active'
export const PERSON_LIFECYCLE_INACTIVE = 'inactive'

export function normalizePersonLifecycleStatus(value, fallback = PERSON_LIFECYCLE_PENDING) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === PERSON_LIFECYCLE_PENDING) return PERSON_LIFECYCLE_PENDING
  if (normalized === PERSON_LIFECYCLE_ACTIVE) return PERSON_LIFECYCLE_ACTIVE
  if (normalized === PERSON_LIFECYCLE_INACTIVE) return PERSON_LIFECYCLE_INACTIVE
  return fallback
}

export function getPersonLifecycleStatus(person, fallback = PERSON_LIFECYCLE_PENDING) {
  if (person?.lifecycleStatus) return normalizePersonLifecycleStatus(person.lifecycleStatus, fallback)
  if (getEffectivePersonApprovalStatus(person) === PERSON_APPROVAL_PENDING) return PERSON_LIFECYCLE_PENDING
  return person?.active !== false && getEffectivePersonApprovalStatus(person) === PERSON_APPROVAL_APPROVED
    ? PERSON_LIFECYCLE_ACTIVE
    : PERSON_LIFECYCLE_INACTIVE
}

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
  return getPersonLifecycleStatus(person) === PERSON_LIFECYCLE_ACTIVE
}

export function isPersonBiometricActive(person) {
  return getPersonLifecycleStatus(person) === PERSON_LIFECYCLE_ACTIVE
}

