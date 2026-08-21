export const PERSON_APPROVAL_PENDING = 'pending'
export const PERSON_APPROVAL_APPROVED = 'approved'
export const PERSON_APPROVAL_REJECTED = 'rejected'
export const PERSON_LIFECYCLE_PENDING = 'pending'
export const PERSON_LIFECYCLE_ACTIVE = 'active'
export const PERSON_LIFECYCLE_INACTIVE = 'inactive'
export const PERSON_LIFECYCLE_REJECTED = 'rejected'

const PERSON_LIFECYCLE_TRANSITIONS = Object.freeze({
  [PERSON_LIFECYCLE_PENDING]: new Set([PERSON_LIFECYCLE_ACTIVE, PERSON_LIFECYCLE_REJECTED]),
  [PERSON_LIFECYCLE_ACTIVE]: new Set([PERSON_LIFECYCLE_INACTIVE, PERSON_LIFECYCLE_PENDING]),
  [PERSON_LIFECYCLE_INACTIVE]: new Set([PERSON_LIFECYCLE_ACTIVE, PERSON_LIFECYCLE_PENDING]),
  [PERSON_LIFECYCLE_REJECTED]: new Set([PERSON_LIFECYCLE_PENDING]),
})

function lifecycleError(message, status) {
  return Object.assign(new Error(message), { status })
}

export function normalizePersonLifecycleStatus(value, fallback = PERSON_LIFECYCLE_PENDING) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === PERSON_LIFECYCLE_PENDING) return PERSON_LIFECYCLE_PENDING
  if (normalized === PERSON_LIFECYCLE_ACTIVE) return PERSON_LIFECYCLE_ACTIVE
  if (normalized === PERSON_LIFECYCLE_INACTIVE) return PERSON_LIFECYCLE_INACTIVE
  if (normalized === PERSON_LIFECYCLE_REJECTED) return PERSON_LIFECYCLE_REJECTED
  return fallback
}

export function resolvePersonLifecycleTransition(currentValue, requestedValue) {
  const previousLifecycleStatus = normalizePersonLifecycleStatus(currentValue, '')
  const lifecycleStatus = normalizePersonLifecycleStatus(requestedValue, '')
  if (!previousLifecycleStatus) throw lifecycleError('Current employee lifecycle status is not valid.', 409)
  if (!lifecycleStatus) throw lifecycleError('Lifecycle status is not valid.', 400)
  if (lifecycleStatus === previousLifecycleStatus) {
    throw lifecycleError(`Employee is already ${lifecycleStatus}.`, 409)
  }
  if (!PERSON_LIFECYCLE_TRANSITIONS[previousLifecycleStatus]?.has(lifecycleStatus)) {
    throw lifecycleError(`Cannot change employee lifecycle from ${previousLifecycleStatus} to ${lifecycleStatus}.`, 409)
  }
  return {
    previousLifecycleStatus,
    lifecycleStatus,
    active: lifecycleStatus === PERSON_LIFECYCLE_ACTIVE,
    approvalStatus: lifecycleStatus === PERSON_LIFECYCLE_ACTIVE
      ? PERSON_APPROVAL_APPROVED
      : lifecycleStatus === PERSON_LIFECYCLE_PENDING
        ? PERSON_APPROVAL_PENDING
        : PERSON_APPROVAL_REJECTED,
  }
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

