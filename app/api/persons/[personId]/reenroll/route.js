export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { resolveEmployeeViewSessionRequest } from '@/lib/employee-view-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { buildAuthoritativeEnrollmentPayload } from '@/lib/biometrics/server-enrollment'
import { ENROLLMENT_MIN_SAMPLES, ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY } from '@/lib/biometrics/enrollment-burst'
import { getBiometricReenrollmentAssessment } from '@/lib/biometrics/descriptor-utils'
import { deduplicateDescriptors } from '@/lib/persons/enrollment'
import { getEffectivePersonApprovalStatus, PERSON_APPROVAL_APPROVED, PERSON_APPROVAL_PENDING } from '@/lib/person-approval'
import { checkLocalDuplicateFace, getLocalPersonById, replaceLocalPersonDescriptors } from '@/lib/postgres/person-store'

function toHttpStatus(value) { const status = Number(value); return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500 }

// Only an office-authorized admin, or the employee's immediately preceding
// successful kiosk session, can replace biometric samples.
export async function POST(request, { params }) {
  const originError = await createOriginGuard()(request)
  if (originError) return originError
  const { personId } = await params
  if (!personId) return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  try {
    const adminCookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const admin = adminCookie ? await resolveAdminSession(null, adminCookie) : null
    const employeeSession = await resolveEmployeeViewSessionRequest(request, null)
    if (!admin && !employeeSession) return NextResponse.json({ ok: false, message: 'A valid admin or recent kiosk session is required.' }, { status: 401 })

    const person = await getLocalPersonById(personId)
    if (!person) return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })
    const employeeOwnsSession = Boolean(employeeSession && ((employeeSession.personId && employeeSession.personId === personId) || (employeeSession.employeeId && employeeSession.employeeId === String(person.employeeId || '').trim())))
    if (admin && !adminSessionAllowsOffice(admin, person.officeId)) return NextResponse.json({ ok: false, message: 'This admin session cannot re-enroll that employee.' }, { status: 403 })
    if (!admin && !employeeOwnsSession) return NextResponse.json({ ok: false, message: 'This kiosk session cannot refresh that employee.' }, { status: 403 })

    const body = await request.json().catch(() => null)
    const authoritative = await buildAuthoritativeEnrollmentPayload(body?.sampleFrames, body?.captureMetadata)
    const { accepted, rejected } = deduplicateDescriptors(authoritative.descriptors, [], { minSampleDiversity: ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY })
    if (accepted.length < ENROLLMENT_MIN_SAMPLES) return NextResponse.json({ ok: false, message: `Capture needs ${ENROLLMENT_MIN_SAMPLES} distinct support samples. Improve lighting and repeat every guided pose.` }, { status: 400 })
    const duplicate = await checkLocalDuplicateFace(accepted, personId)
    if (duplicate?.duplicate) return NextResponse.json({ ok: false, message: `Captured face is too similar to ${duplicate.person.name} (${duplicate.person.employeeId || 'no employee ID'}). Verify identity first.` }, { status: 409 })

    const previousSampleCount = Array.isArray(person.descriptors) ? person.descriptors.length : 0
    const previousApproval = getEffectivePersonApprovalStatus(person)
    const nextApproval = admin ? (previousApproval === PERSON_APPROVAL_APPROVED ? PERSON_APPROVAL_APPROVED : PERSON_APPROVAL_PENDING) : PERSON_APPROVAL_APPROVED
    const result = await replaceLocalPersonDescriptors(personId, accepted, {
      approvalStatus: nextApproval, captureMetadata: authoritative.captureMetadata || {},
      biometricModelVersion: String(authoritative.biometricModelVersion || person.biometricModelVersion || 'human-faceres-browser-v1'),
      biometricQualityScore: Number.isFinite(authoritative.captureMetadata?.qualityScore) ? Number(authoritative.captureMetadata.qualityScore) : person.biometricQualityScore,
      reenrollSource: admin ? 'admin' : 'employee-kiosk',
    })
    if (body?.photoDataUrl) {
      const { saveLocalEnrollmentPhoto } = await import('@/lib/postgres/photo-store')
      await saveLocalEnrollmentPhoto(personId, body.photoDataUrl)
    }
    await writeAuditLog(null, {
      actorRole: admin?.role || 'employee-view', actorScope: admin?.scope || 'employee-view', actorOfficeId: admin?.officeId || person.officeId || '',
      action: admin ? 'person_admin_reenroll' : 'person_self_reenroll', targetType: 'person', targetId: personId, officeId: person.officeId || '',
      summary: `Re-enrolled face for ${person.name} — ${previousSampleCount} old sample(s) replaced with ${accepted.length} new`,
      metadata: { employeeId: person.employeeId || '', officeName: person.officeName || '', previousSampleCount, newSampleCount: accepted.length, droppedSamples: rejected.length, reenrollSource: admin ? 'admin' : 'employee-kiosk', approvalStatus: nextApproval },
    })
    const assessment = getBiometricReenrollmentAssessment(result.person)
    return NextResponse.json({ ok: true, sampleCount: accepted.length, needsReenrollment: assessment.needed, reenrollmentReason: assessment.reasonCode, reenrollmentMessage: assessment.message, message: assessment.needed ? `Face data updated, but another refresh is recommended. ${assessment.message}` : `Face data updated. ${person.name} ${nextApproval === PERSON_APPROVAL_APPROVED ? 'is active on the kiosk.' : 'still needs admin approval.'}` })
  } catch (error) {
    const status = toHttpStatus(error?.status)
    console.error('[PersonReenrollAPI] Re-enrollment failed', { code: error?.code, message: error?.message })
    return NextResponse.json({
      ok: false,
      code: error?.code || 'reenrollment_failed',
      message: status === 400
        ? 'Re-enrollment data is invalid. Retake the guided capture and try again.'
        : 'Re-enrollment could not be completed. Please try again or contact HR.',
    }, { status })
  }
}
