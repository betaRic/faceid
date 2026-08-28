export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { resolveEmployeeViewSessionRequest } from '@/lib/employee-view-auth'
import { createOriginGuard } from '@/lib/csrf'
import { buildAuthoritativeEnrollmentPayload } from '@/lib/biometrics/server-enrollment'
import { ENROLLMENT_MIN_SAMPLES, ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY } from '@/lib/biometrics/enrollment-burst'
import { getBiometricReenrollmentAssessment } from '@/lib/biometrics/descriptor-utils'
import { normalizeDataImage } from '@/lib/images/safe-data-image'
import { deduplicateDescriptors } from '@/lib/persons/enrollment-descriptors'
import { checkLocalDuplicateFace, getLocalPersonById, refreshLocalPersonBiometrics } from '@/lib/postgres/person-store'

function toHttpStatus(value) {
  const status = Number(value)
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
}

export function createPersonReenrollHandler({
  buildAuthoritativeEnrollmentPayload: buildEnrollmentPayload = buildAuthoritativeEnrollmentPayload,
  checkDuplicateFace = checkLocalDuplicateFace,
  getPerson = getLocalPersonById,
  normalizePhoto = normalizeDataImage,
  refreshBiometrics = refreshLocalPersonBiometrics,
} = {}) {
  // Only an office-authorized admin, or the exact employee person ID from the
  // immediately preceding successful kiosk session, can replace biometrics.
  return async function handlePersonReenroll(request, { params }) {
    const originError = await createOriginGuard()(request)
    if (originError) return originError
    const { personId } = await params
    if (!personId) return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
    try {
      const adminCookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
      const admin = adminCookie ? await resolveAdminSession(null, adminCookie) : null
      const employeeSession = await resolveEmployeeViewSessionRequest(request, null)
      if (!admin && !employeeSession) {
        return NextResponse.json({ ok: false, message: 'A valid admin or recent kiosk session is required.' }, { status: 401 })
      }
      if (!admin && (!employeeSession?.personId || employeeSession.personId !== personId)) {
        return NextResponse.json({
          ok: false,
          code: 'reenrollment_forbidden',
          message: 'This re-enrollment link is not valid for this employee.',
        }, { status: 403 })
      }

      const person = await getPerson(personId)
      if (!person) return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })
      if (admin && !adminSessionAllowsOffice(admin, person.officeId)) {
        return NextResponse.json({ ok: false, message: 'This admin session cannot re-enroll that employee.' }, { status: 403 })
      }
      const body = await request.json().catch(() => null)
      const authoritative = await buildEnrollmentPayload(body?.sampleFrames, body?.captureMetadata)
      const { accepted, rejected } = deduplicateDescriptors(
        authoritative.descriptors,
        [],
        { minSampleDiversity: ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY },
      )
      if (accepted.length < ENROLLMENT_MIN_SAMPLES) {
        return NextResponse.json({
          ok: false,
          message: `Capture needs ${ENROLLMENT_MIN_SAMPLES} distinct support samples. Improve lighting and repeat every guided pose.`,
        }, { status: 400 })
      }
      const duplicate = await checkDuplicateFace(accepted, personId)
      if (duplicate?.duplicate) {
        return NextResponse.json({
          ok: false,
          message: `Captured face is too similar to ${duplicate.person.name} (${duplicate.person.employeeId || 'no employee ID'}). Verify identity first.`,
        }, { status: 409 })
      }

      const normalizedPhoto = body?.photoDataUrl ? await normalizePhoto(body.photoDataUrl) : null
      const reenrollSource = admin ? 'admin' : 'employee-kiosk'
      const result = await refreshBiometrics(personId, {
        descriptors: accepted,
        normalizedPhoto,
        captureMetadata: authoritative.captureMetadata || {},
        biometricModelVersion: String(authoritative.biometricModelVersion || person.biometricModelVersion || 'human-faceres-browser-v1'),
        biometricQualityScore: Number.isFinite(authoritative.captureMetadata?.qualityScore)
          ? Number(authoritative.captureMetadata.qualityScore)
          : person.biometricQualityScore,
        reenrollSource,
        auditEntry: {
          actorRole: admin?.role || 'employee-view',
          actorScope: admin?.scope || 'employee-view',
          actorOfficeId: admin?.officeId || person.officeId || '',
          actorId: admin?.adminId || admin?.uid || employeeSession?.personId || '',
          actorName: admin?.displayName || person.name || '',
          actorEmail: admin?.email || '',
          action: admin ? 'person_admin_reenroll' : 'person_self_reenroll',
          summary: `Re-enrolled face for ${person.name}.`,
          metadata: {
            employeeId: person.employeeId || '',
            officeName: person.officeName || '',
            droppedSamples: rejected.length,
            reenrollSource,
            lifecycleStatus: person.lifecycleStatus,
          },
        },
      })
      if (!result) return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })

      const assessment = getBiometricReenrollmentAssessment(result.person)
      const statusMessage = result.person.lifecycleStatus === 'active'
        ? 'remains active on the kiosk.'
        : `remains ${result.person.lifecycleStatus || 'pending'} and cannot use the kiosk until activated.`
      return NextResponse.json({
        ok: true,
        sampleCount: accepted.length,
        lifecycleStatus: result.person.lifecycleStatus,
        needsReenrollment: assessment.needed,
        reenrollmentReason: assessment.reasonCode,
        reenrollmentMessage: assessment.message,
        message: assessment.needed
          ? `Face data updated, but another refresh is recommended. ${assessment.message}`
          : `Face data updated. ${person.name} ${statusMessage}`,
      })
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
}

export const POST = createPersonReenrollHandler()
