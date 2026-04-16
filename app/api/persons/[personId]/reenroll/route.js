export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import {
  resolveEmployeeViewSessionRequest,
} from '@/lib/employee-view-auth'
import { deletePersonBiometricIndex, syncPersonBiometricIndex } from '@/lib/biometric-index'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { DESCRIPTOR_LENGTH } from '@/lib/config'
import { syncPersonBiometricsRecord } from '@/lib/person-biometrics'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from '@/lib/person-approval'
import { getBiometricReenrollmentAssessment } from '@/lib/biometrics/descriptor-utils'
import { checkDuplicateFace, deduplicateDescriptors, serializeDescriptorSample } from '@/lib/persons/enrollment'
import { uploadEnrollmentPhoto } from '@/lib/storage'

/**
 * Admin-initiated biometric re-enrollment.
 * Replaces all stored face descriptors with fresh captures.
 * Admin sessions can re-enroll within their office.
 * Employee kiosk sessions can only refresh their own profile immediately after a successful attendance scan.
 *
 * POST /api/persons/[personId]/reenroll
 * Body: { descriptors: number[][], captureMetadata?: object, photoDataUrl?: string }
 */
export async function POST(request, { params }) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const { personId } = await params
  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  }

  const adminSession = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )

  try {
    const db = getAdminDb()
    const employeeSession = await resolveEmployeeViewSessionRequest(request, db)

    if (!adminSession && !employeeSession) {
      return NextResponse.json({ ok: false, message: 'A valid admin or recent kiosk session is required.' }, { status: 401 })
    }

    let resolvedSession = null
    if (adminSession) {
      resolvedSession = await resolveAdminSession(db, adminSession)
      if (!resolvedSession) {
        return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
      }
    }

    const personRef = db.collection('persons').doc(personId)
    const personDoc = await personRef.get()
    if (!personDoc.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })
    }

    const person = personDoc.data()
    const employeeOwnsSession = Boolean(
      employeeSession
      && (
        (employeeSession.personId && employeeSession.personId === personId)
        || (employeeSession.employeeId && employeeSession.employeeId === String(person.employeeId || '').trim())
      ),
    )

    if (resolvedSession) {
      if (!adminSessionAllowsOffice(resolvedSession, person.officeId)) {
        return NextResponse.json({ ok: false, message: 'This admin session cannot re-enroll that employee.' }, { status: 403 })
      }
    } else if (!employeeOwnsSession) {
      return NextResponse.json({ ok: false, message: 'This kiosk session cannot refresh that employee.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const rawDescriptors = body?.descriptors
    if (!Array.isArray(rawDescriptors) || rawDescriptors.length === 0) {
      return NextResponse.json({ ok: false, message: 'Missing descriptors array.' }, { status: 400 })
    }

    const validDescriptors = rawDescriptors.filter(
      d => Array.isArray(d) && d.length === DESCRIPTOR_LENGTH && d.every(v => Number.isFinite(Number(v))),
    )
    if (validDescriptors.length < 4) {
      return NextResponse.json(
        { ok: false, message: `Need at least 4 valid descriptors, got ${validDescriptors.length}.` },
        { status: 400 },
      )
    }

    // Deduplicate within the new batch (no comparison to old — we're replacing everything)
    const { accepted, rejected } = deduplicateDescriptors(validDescriptors, [])
    if (accepted.length < 4) {
      return NextResponse.json(
        { ok: false, message: 'Captured samples are too similar to each other. Try again with better head angle diversity.' },
        { status: 400 },
      )
    }

    const previousSampleCount = Array.isArray(person.descriptors) ? person.descriptors.length : 0
    const previousApprovalStatus = getEffectivePersonApprovalStatus(person)
    const nextApprovalStatus = resolvedSession
      ? (previousApprovalStatus === PERSON_APPROVAL_APPROVED ? PERSON_APPROVAL_APPROVED : PERSON_APPROVAL_PENDING)
      : PERSON_APPROVAL_APPROVED
    const approvalChanged = previousApprovalStatus !== nextApprovalStatus
    const newDescriptors = accepted.map(serializeDescriptorSample)
    const captureMetadata = body?.captureMetadata && typeof body.captureMetadata === 'object'
      ? body.captureMetadata
      : {}
    const biometricModelVersion = String(
      captureMetadata?.modelVersion
      || person.biometricModelVersion
      || 'human-faceres-browser-v1',
    )
    const biometricQualityScore = Number.isFinite(captureMetadata?.qualityScore)
      ? Number(captureMetadata.qualityScore)
      : (Number.isFinite(person.biometricQualityScore) ? Number(person.biometricQualityScore) : null)

    const duplicateFace = await checkDuplicateFace(db, accepted, personId)
    if (duplicateFace) {
      return NextResponse.json(
        {
          ok: false,
          message: `Captured face is too similar to ${duplicateFace.person.name} (${duplicateFace.person.employeeId || 'no employee ID'}). Stop and verify identity before overwriting biometrics.`,
        },
        { status: 409 },
      )
    }

    const updatePayload = {
      descriptors: newDescriptors,
      sampleCount: newDescriptors.length,
      approvalStatus: nextApprovalStatus,
      captureMetadata,
      biometricModelVersion,
      biometricQualityScore,
      reenrolledAt: FieldValue.serverTimestamp(),
      reenrollSource: resolvedSession ? 'admin' : 'employee-kiosk',
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (resolvedSession) {
      updatePayload.reenrolledByEmail = resolvedSession.email || ''
      if (approvalChanged) {
        updatePayload.approvalUpdatedAt = FieldValue.serverTimestamp()
        updatePayload.approvalUpdatedByEmail = resolvedSession.email || ''
      }
      if (nextApprovalStatus === PERSON_APPROVAL_APPROVED) {
        updatePayload.approvedAt = approvalChanged
          ? FieldValue.serverTimestamp()
          : (person.approvedAt || FieldValue.serverTimestamp())
      } else if (approvalChanged) {
        updatePayload.approvedAt = FieldValue.delete()
      }
    } else {
      updatePayload.reenrolledByEmployeeId = employeeSession?.employeeId || String(person.employeeId || '')
      updatePayload.approvedAt = person.approvedAt || FieldValue.serverTimestamp()
    }

    const updatedPerson = {
      ...person,
      ...updatePayload,
      descriptors: newDescriptors,
      approvalStatus: nextApprovalStatus,
    }
    const reenrollmentAssessment = getBiometricReenrollmentAssessment(updatedPerson)
    updatePayload.needsReenrollment = reenrollmentAssessment.needed
    updatedPerson.needsReenrollment = reenrollmentAssessment.needed

    await personRef.update(updatePayload)

    // Rebuild biometric index (clear old entries, write new ones)
    await deletePersonBiometricIndex(db, personId)
    await syncPersonBiometricIndex(db, personId, updatedPerson)
    try {
      await syncPersonBiometricsRecord(db, personId, updatedPerson)
    } catch (err) {
      console.warn(`[Reenroll] person_biometrics sync failed for ${personId}:`, err?.message)
    }

    // Upload new photo if provided
    if (body.photoDataUrl && process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
      try {
        const photo = await uploadEnrollmentPhoto(
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          personId,
          body.photoDataUrl,
        )
        if (photo?.path) {
          await personRef.update({
            photoPath: photo.path,
            photoContentType: photo.contentType || 'image/jpeg',
            photoUpdatedAt: FieldValue.serverTimestamp(),
            photoUrl: FieldValue.delete(),
          })
        }
      } catch (err) {
        console.warn('[Reenroll] Photo upload failed (non-fatal):', err?.message)
      }
    }

    await writeAuditLog(db, {
      actorRole: resolvedSession?.role || 'employee-view',
      actorScope: resolvedSession?.scope || 'employee-view',
      actorOfficeId: resolvedSession?.officeId || person.officeId || '',
      action: resolvedSession ? 'person_admin_reenroll' : 'person_self_reenroll',
      targetType: 'person',
      targetId: personId,
      officeId: person.officeId || '',
      summary: resolvedSession
        ? `Admin re-enrolled face for ${person.name} — ${previousSampleCount} old sample(s) replaced with ${newDescriptors.length} new`
        : `Employee refreshed their face data after kiosk attendance — ${previousSampleCount} old sample(s) replaced with ${newDescriptors.length} new`,
      metadata: {
        employeeId: person.employeeId || '',
        officeName: person.officeName || '',
        previousSampleCount,
        newSampleCount: newDescriptors.length,
        droppedSamples: rejected.length,
        reenrollSource: resolvedSession ? 'admin' : 'employee-kiosk',
        approvalStatus: nextApprovalStatus,
      },
    })

    const baseMessage = resolvedSession
      ? nextApprovalStatus === PERSON_APPROVAL_APPROVED
        ? `Face data updated. ${person.name} remains approved and active on the kiosk.`
        : `Face data updated. ${person.name} still requires explicit admin approval before kiosk activation.`
      : `Face data refreshed. Future scans for ${person.name} should be more reliable.`

    return NextResponse.json({
      ok: true,
      sampleCount: newDescriptors.length,
      needsReenrollment: reenrollmentAssessment.needed,
      reenrollmentReason: reenrollmentAssessment.reasonCode,
      reenrollmentMessage: reenrollmentAssessment.message,
      message: reenrollmentAssessment.needed
        ? `Face data updated, but another refresh is still recommended. ${reenrollmentAssessment.message}`
        : baseMessage,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Re-enrollment failed.' },
      { status: 500 },
    )
  }
}
