import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
} from '@/lib/person-approval'

function normalizeIdentityText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export function validatePublicEnrollmentIdentity(existing, body) {
  if (!existing) return null

  const existingApprovalStatus = getEffectivePersonApprovalStatus(existing)
  if (existingApprovalStatus === PERSON_APPROVAL_APPROVED) {
    return 'Employee ID already exists. Additional biometric samples for approved employees must be handled by an admin.'
  }

  const submittedName = normalizeIdentityText(body?.name)
  const existingName = normalizeIdentityText(existing?.name)
  if (submittedName && existingName && submittedName !== existingName) {
    return 'An enrollment for this employee ID is already under review. Name changes must be handled by an admin.'
  }

  const submittedOfficeId = String(body?.officeId || '').trim()
  const existingOfficeId = String(existing?.officeId || '').trim()
  if (submittedOfficeId && existingOfficeId && submittedOfficeId !== existingOfficeId) {
    return 'An enrollment for this employee ID already exists for a different office. Ask an admin to correct the record instead of resubmitting it.'
  }

  return null
}
