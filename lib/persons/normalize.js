import { normalizeEnrollmentDescriptorBatch, validateEnrollmentDescriptorBatch } from '@/lib/biometrics/enrollment-burst'

export function normalizeBody(body) {
  const captureMetadata = body?.profile?.captureMetadata && typeof body.profile.captureMetadata === 'object'
    ? body.profile.captureMetadata
    : {}
  return {
    name: String(body?.profile?.name || '').trim(),
    employeeId: String(body?.profile?.employeeId || '').trim(),
    officeId: String(body?.profile?.officeId || '').trim(),
    officeName: String(body?.profile?.officeName || '').trim(),
    photoDataUrl: typeof body?.profile?.photoDataUrl === 'string' ? body.profile.photoDataUrl : null,
    captureMetadata,
    descriptors: normalizeEnrollmentDescriptorBatch(body?.descriptors ?? body?.descriptor),
  }
}

export function validateBody(body) {
  if (!body.name) return 'Employee name is required.'
  if (!body.employeeId) return 'Employee ID is required.'
  if (body.employeeId.length < 3) return 'Employee ID must be at least 3 characters.'
  if (body.employeeId.length > 20) return 'Employee ID must be 20 characters or fewer.'
  if (!/^[A-Za-z0-9-]+$/.test(body.employeeId)) return 'Employee ID must contain only letters, numbers, and dashes (-).'
  if (!body.officeId) return 'Assigned office is required.'
  return validateEnrollmentDescriptorBatch(body.descriptors)
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
