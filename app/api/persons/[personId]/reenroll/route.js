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
import { deletePersonBiometricIndex, syncPersonBiometricIndex } from '@/lib/biometric-index'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { DESCRIPTOR_LENGTH } from '@/lib/config'
import { PERSON_APPROVAL_APPROVED } from '@/lib/person-approval'
import { checkDuplicateFace, deduplicateDescriptors, serializeDescriptorSample } from '@/lib/persons/enrollment'
import { uploadEnrollmentPhoto } from '@/lib/storage'

/**
 * Admin-initiated biometric re-enrollment.
 * Replaces all stored face descriptors with fresh captures from the admin panel.
 * Auto-approves — admin performed and witnessed the capture directly.
 *
 * POST /api/persons/[personId]/reenroll
 * Body: { descriptors: number[][], photoDataUrl?: string }
 * Requires valid admin session cookie.
 */
export async function POST(request, { params }) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const { personId } = await params
  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const personRef = db.collection('persons').doc(personId)
    const personDoc = await personRef.get()
    if (!personDoc.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })
    }

    const person = personDoc.data()
    if (!adminSessionAllowsOffice(resolvedSession, person.officeId)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot re-enroll that employee.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const rawDescriptors = body?.descriptors
    if (!Array.isArray(rawDescriptors) || rawDescriptors.length === 0) {
      return NextResponse.json({ ok: false, message: 'Missing descriptors array.' }, { status: 400 })
    }

    const validDescriptors = rawDescriptors.filter(
      d => Array.isArray(d) && d.length === DESCRIPTOR_LENGTH && d.every(v => Number.isFinite(Number(v))),
    )
    if (validDescriptors.length < 3) {
      return NextResponse.json(
        { ok: false, message: `Need at least 3 valid descriptors, got ${validDescriptors.length}.` },
        { status: 400 },
      )
    }

    // Deduplicate within the new batch (no comparison to old — we're replacing everything)
    const { accepted, rejected } = deduplicateDescriptors(validDescriptors, [])
    if (accepted.length < 3) {
      return NextResponse.json(
        { ok: false, message: 'Captured samples are too similar to each other. Try again with better head angle diversity.' },
        { status: 400 },
      )
    }

    const previousSampleCount = Array.isArray(person.descriptors) ? person.descriptors.length : 0
    const newDescriptors = accepted.map(serializeDescriptorSample)

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

    await personRef.update({
      descriptors: newDescriptors,
      sampleCount: newDescriptors.length,
      approvalStatus: PERSON_APPROVAL_APPROVED,
      approvalUpdatedAt: FieldValue.serverTimestamp(),
      approvalUpdatedByEmail: resolvedSession.email || '',
      approvedAt: FieldValue.serverTimestamp(),
      reenrolledAt: FieldValue.serverTimestamp(),
      reenrolledByEmail: resolvedSession.email || '',
    })

    // Rebuild biometric index (clear old entries, write new ones)
    await deletePersonBiometricIndex(db, personId)
    const updatedPerson = { ...person, descriptors: newDescriptors, approvalStatus: PERSON_APPROVAL_APPROVED }
    await syncPersonBiometricIndex(db, personId, updatedPerson)

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
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_admin_reenroll',
      targetType: 'person',
      targetId: personId,
      officeId: person.officeId || '',
      summary: `Admin re-enrolled face for ${person.name} — ${previousSampleCount} old sample(s) replaced with ${newDescriptors.length} new`,
      metadata: {
        employeeId: person.employeeId || '',
        officeName: person.officeName || '',
        previousSampleCount,
        newSampleCount: newDescriptors.length,
        droppedSamples: rejected.length,
      },
    })

    return NextResponse.json({
      ok: true,
      sampleCount: newDescriptors.length,
      message: `Face data updated. ${person.name} is approved and active on the kiosk.`,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Re-enrollment failed.' },
      { status: 500 },
    )
  }
}
