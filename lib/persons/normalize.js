import {
  normalizeEnrollmentDescriptorBatch,
  validateEnrollmentCaptureMetadata,
  normalizeEnrollmentSampleFrames,
  validateEnrollmentSampleFrames,
} from '@/lib/biometrics/enrollment-burst'

export function normalizeBody(body) {
  const captureMetadata = body?.profile?.captureMetadata && typeof body.profile.captureMetadata === 'object'
    ? body.profile.captureMetadata
    : {}
  return {
    name: String(body?.profile?.name || '').trim(),
    employeeId: String(body?.profile?.employeeId || '').trim(),
    position: String(body?.profile?.position || '').trim(),
    officeId: String(body?.profile?.officeId || '').trim(),
    officeName: String(body?.profile?.officeName || '').trim(),
    divisionId: String(body?.profile?.divisionId || '').trim(),
    photoDataUrl: typeof body?.profile?.photoDataUrl === 'string' ? body.profile.photoDataUrl : null,
    captureMetadata,
    descriptors: normalizeEnrollmentDescriptorBatch(body?.descriptors ?? body?.descriptor),
    sampleFrames: normalizeEnrollmentSampleFrames(body?.sampleFrames ?? body?.profile?.sampleFrames),
  }
}

export function validateBody(body) {
  if (!body.name) return 'Employee name is required.'
  if (!body.employeeId) return 'Employee ID is required.'
  if (body.employeeId.length < 3) return 'Employee ID must be at least 3 characters.'
  if (body.employeeId.length > 20) return 'Employee ID must be 20 characters or fewer.'
  if (!/^[A-Za-z0-9-]+$/.test(body.employeeId)) return 'Employee ID must contain only letters, numbers, and dashes (-).'
  if (!body.position) return 'Position is required.'
  if (body.position.length < 2) return 'Position must be at least 2 characters.'
  if (body.position.length > 80) return 'Position must be 80 characters or fewer.'
  if (!body.officeId) return 'Assigned office is required.'
  return validateEnrollmentSampleFrames(body.sampleFrames)
    || validateEnrollmentCaptureMetadata(body.captureMetadata, body.sampleFrames)
}

export function validateDivisionAgainstOffice(body, office) {
  const officeType = String(office?.officeType || '').trim()
  const divisions = Array.isArray(office?.divisions) ? office.divisions : []
  if (officeType === 'Regional Office') {
    if (!body.divisionId) return 'Division or unit is required for Regional Office staff.'
    const valid = divisions.some(d => d?.id === body.divisionId)
    if (!valid) return 'Selected division or unit is not configured for this office.'
    return null
  }
  return null
}

export function normalizeDirectoryStatus(value) {
  const normalized = String(value || 'all').trim().toLowerCase()
  if (normalized === 'active' || normalized === 'inactive') return normalized
  return 'all'
}

export function normalizeDirectoryApprovalFilter(value) {
  const normalized = String(value || 'all').trim().toLowerCase()
  if (normalized === 'pending' || normalized === 'approved' || normalized === 'rejected') return normalized
  return 'all'
}
