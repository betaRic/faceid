import { FieldValue } from 'firebase-admin/firestore'
import {
  DISTANCE_THRESHOLD_ENROLLMENT,
  ENROLLMENT_MIN_SAMPLE_DIVERSITY,
} from '@/lib/config'
import {
  normalizeStoredDescriptors,
  normalizeDescriptor,
  euclideanDistance,
} from '@/lib/biometrics/descriptor-utils'
import { writeAuditLog } from '@/lib/audit-log'
import { syncPersonBiometricIndex, queryAllBiometricIndexSamples } from '@/lib/biometric-index'
import { syncPersonBiometricsRecord } from '@/lib/person-biometrics'
import { uploadEnrollmentPhoto } from '@/lib/storage'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from '@/lib/person-approval'
import { validatePublicEnrollmentIdentity } from '@/lib/persons/enrollment-policy'
import {
  collectDuplicateCandidatePersons,
  evaluateDuplicateFaceCandidates,
  DUPLICATE_STATUS_REVIEW_REQUIRED,
} from '@/lib/persons/duplicate-face'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function serializeDescriptorSample(descriptor) {
  const normalized = normalizeDescriptor(descriptor)
  return { vector: normalized }
}

/**
 * Filter out incoming descriptors that are too similar to each other
 * (within the same submission batch) or to already-stored descriptors
 * for the same person.
 */
export function deduplicateDescriptors(incomingDescriptors, existingDescriptors = []) {
  const normalizedExisting = existingDescriptors.map(normalizeDescriptor)
  const accepted = []
  const rejected = []

  for (const raw of incomingDescriptors) {
    const normalized = normalizeDescriptor(raw)

    const tooCloseToExisting = normalizedExisting.some(
      stored => euclideanDistance(stored, normalized) < ENROLLMENT_MIN_SAMPLE_DIVERSITY,
    )
    if (tooCloseToExisting) {
      rejected.push({ reason: 'too_similar_to_stored', descriptor: raw })
      continue
    }

    const tooCloseToBatch = accepted.some(
      acc => euclideanDistance(normalizeDescriptor(acc), normalized) < ENROLLMENT_MIN_SAMPLE_DIVERSITY,
    )
    if (tooCloseToBatch) {
      rejected.push({ reason: 'too_similar_to_batch', descriptor: raw })
      continue
    }

    accepted.push(raw)
    normalizedExisting.push(normalized)
  }

  return { accepted, rejected }
}

/**
 * Check whether any of the supplied descriptors match an already-enrolled face.
 *
 * Uses biometric_index (reads ~N index rows) instead of scanning every persons
 * document. Includes pending enrollments so two concurrent submissions of the
 * same face are caught. The in-transaction check in enrollPerson still reads
 * persons directly for ACID consistency on concurrent writes.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {number[][]} descriptors  Raw (un-normalized) descriptors from client
 * @param {string}     excludePersonId  Skip samples belonging to this person (re-enrollment)
 * @returns {{ person: object, distance: number } | null}
 */
export async function checkDuplicateFace(db, descriptors, excludePersonId = '') {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null

  const candidates = await queryAllBiometricIndexSamples(db, { includePending: true })
  if (candidates.length === 0) return null

  return evaluateDuplicateFaceCandidates(candidates, descriptors, excludePersonId)
}

/**
 * Same as checkDuplicateFace but reads within a Firestore transaction.
 * Used inside enrollPerson to guard against concurrent-enrollment races.
 */
export async function checkDuplicateFaceWithinTransaction(
  db, transaction, descriptors, excludePersonId = '',
) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null

  const snapshot = await transaction.get(db.collection('persons'))
  const candidates = collectDuplicateCandidatePersons(snapshot)
  if (candidates.length === 0) return null

  return evaluateDuplicateFaceCandidates(candidates, descriptors, excludePersonId)
}

function buildDuplicateReviewFields(evaluation) {
  if (!evaluation || evaluation.status !== DUPLICATE_STATUS_REVIEW_REQUIRED) {
    return {
      duplicateReviewRequired: false,
      duplicateReviewStatus: 'clear',
      duplicateReviewReasonCode: '',
      duplicateReviewDistance: null,
      duplicateReviewSecondDistance: null,
      duplicateReviewMargin: null,
      duplicateReviewMatchedQueries: 0,
      duplicateReviewMatchedStoredCount: 0,
      duplicateReviewCandidatePersonId: '',
      duplicateReviewCandidateEmployeeId: '',
      duplicateReviewCandidateName: '',
      duplicateReviewCandidateApprovalStatus: '',
      duplicateReviewCandidateSampleCount: 0,
      duplicateReviewDetectedAt: null,
      duplicateReviewResolvedAt: null,
      duplicateReviewResolvedByEmail: '',
    }
  }

  const candidate = evaluation.person || {}
  return {
    duplicateReviewRequired: true,
    duplicateReviewStatus: DUPLICATE_STATUS_REVIEW_REQUIRED,
    duplicateReviewReasonCode: String(evaluation.reasonCode || 'duplicate_review_match'),
    duplicateReviewDistance: Number(evaluation.distance || 0),
    duplicateReviewSecondDistance: Number.isFinite(evaluation.secondDistance)
      ? Number(evaluation.secondDistance)
      : null,
    duplicateReviewMargin: Number.isFinite(evaluation.marginToNext)
      ? Number(evaluation.marginToNext)
      : null,
    duplicateReviewMatchedQueries: Number(evaluation.matchedQueries || 0),
    duplicateReviewMatchedStoredCount: Number(evaluation.matchedStoredCount || 0),
    duplicateReviewCandidatePersonId: String(candidate.id || ''),
    duplicateReviewCandidateEmployeeId: String(candidate.employeeId || ''),
    duplicateReviewCandidateName: String(candidate.name || ''),
    duplicateReviewCandidateApprovalStatus: String(evaluation.approvalStatus || ''),
    duplicateReviewCandidateSampleCount: Number(evaluation.storedDescriptorCount || 0),
    duplicateReviewDetectedAt: FieldValue.serverTimestamp(),
    duplicateReviewResolvedAt: FieldValue.delete(),
    duplicateReviewResolvedByEmail: FieldValue.delete(),
  }
}

// ---------------------------------------------------------------------------
// enrollPerson — unchanged except that we now do a pre-transaction full-scan
// duplicate check so errors surface before the transaction starts
// ---------------------------------------------------------------------------

export async function enrollPerson(db, body, office, resolvedSession) {
  const division = body.divisionId
    ? (Array.isArray(office?.divisions) ? office.divisions : []).find(d => d?.id === body.divisionId) || null
    : null
  const payload = {
    name: body.name.toUpperCase(),
    employeeId: body.employeeId,
    position: String(body.position || '').trim(),
    nameLower: body.name.toUpperCase().toLowerCase(),
    officeId: office.id,
    officeName: office.name,
    divisionId: division?.id || '',
    divisionName: division?.name || '',
    captureMetadata: body.captureMetadata || {},
    biometricModelVersion: String(
      body.biometricModelVersion
      || body.captureMetadata?.modelVersion
      || 'human-faceres-browser-v1',
    ),
    biometricQualityScore: Number.isFinite(body.captureMetadata?.qualityScore)
      ? Number(body.captureMetadata.qualityScore)
      : null,
    updatedAt: FieldValue.serverTimestamp(),
  }

  const existingSnapshotForEarlyDuplicate = await db
    .collection('persons')
    .where('employeeId', '==', body.employeeId)
    .limit(1)
    .get()
  const existingRecordForEarlyDuplicate = existingSnapshotForEarlyDuplicate.docs[0] || null
  const earlyDuplicateExcludePersonId = existingRecordForEarlyDuplicate?.id || ''

  // Pre-transaction duplicate face check using biometric_index (much cheaper than
  // scanning all persons). The biometric_index stores normalized descriptors already
  // grouped by person, so this reads ~N index rows instead of ~N person documents.
  // The in-transaction check below still uses the full persons collection for
  // concurrent-enrollment safety.
  const indexCandidates = await queryAllBiometricIndexSamples(db)
  const earlyDuplicate = evaluateDuplicateFaceCandidates(
    indexCandidates, body.descriptors, earlyDuplicateExcludePersonId,
  )
  if (earlyDuplicate?.duplicate) {
    const dup = earlyDuplicate.person
    throw Object.assign(
      new Error(
        `Face is too similar to ${dup.name} (${dup.employeeId || 'no employee ID'}). Duplicate enrollment blocked.`,
      ),
      { duplicateFace: earlyDuplicate },
    )
  }

  const transactionResult = await db.runTransaction(async transaction => {
    const employeeLockRef = db.collection('person_enrollment_locks').doc(body.employeeId)
    await transaction.get(employeeLockRef)

    const existingSnapshot = await transaction.get(
      db.collection('persons').where('employeeId', '==', body.employeeId).limit(1),
    )
    const existingRecord = existingSnapshot.docs[0] || null
    const existing = existingRecord ? { id: existingRecord.id, ...existingRecord.data() } : null
    const existingApprovalStatus = getEffectivePersonApprovalStatus(existing)

    if (!resolvedSession && existing) {
      const publicIdentityError = validatePublicEnrollmentIdentity(existing, body)
      if (publicIdentityError) {
        throw new Error(publicIdentityError)
      }
    }

    const existingStoredDescriptors = existing
      ? normalizeStoredDescriptors(existing.descriptors || [])
      : []

    const { accepted: uniqueDescriptors, rejected: duplicateDescriptors } =
      deduplicateDescriptors(body.descriptors, existingStoredDescriptors)

    if (uniqueDescriptors.length === 0) {
      throw Object.assign(
        new Error(
          'All submitted face samples are too similar to already-stored samples. ' +
          'Re-enroll with fresh captures in different lighting or angles.',
        ),
        { code: 'all_samples_duplicate' },
      )
    }

    if (duplicateDescriptors.length > 0) {
      console.info(
        `[Enrollment] Dropped ${duplicateDescriptors.length}/${body.descriptors.length} near-duplicate samples for ${body.employeeId}`,
      )
    }

    // In-transaction duplicate check guards against concurrent enrollments
    const duplicateFace = await checkDuplicateFaceWithinTransaction(
      db, transaction, uniqueDescriptors, existing?.id || '',
    )

    if (duplicateFace?.duplicate) {
      const dup = duplicateFace.person
      throw Object.assign(
        new Error(
          `Face is too similar to ${dup.name} (${dup.employeeId || 'no employee ID'}). Duplicate enrollment blocked.`,
        ),
        { duplicateFace },
      )
    }

    const personRef = existingRecord ? existingRecord.ref : db.collection('persons').doc()
    const nextApprovalStatus = existing
      ? (resolvedSession ? existingApprovalStatus : PERSON_APPROVAL_PENDING)
      : (resolvedSession ? PERSON_APPROVAL_APPROVED : PERSON_APPROVAL_PENDING)

    const effectivePayload = existing && !resolvedSession
      ? {
          ...payload,
          name: existing.name,
          nameLower: existing.nameLower || String(existing.name || '').toLowerCase(),
          officeId: existing.officeId || office.id,
          officeName: existing.officeName || office.name,
          position: existing.position || payload.position,
          divisionId: existing.divisionId || payload.divisionId,
          divisionName: existing.divisionName || payload.divisionName,
        }
      : payload

    const duplicateReviewFields = buildDuplicateReviewFields(duplicateFace)
    const nextSampleCount = existingStoredDescriptors.length + uniqueDescriptors.length

    const nextPerson = existing
      ? {
          ...existing,
          ...effectivePayload,
          active: existing.active !== false,
          approvalStatus: nextApprovalStatus,
          ...duplicateReviewFields,
          sampleCount: nextSampleCount,
          descriptors: [
            ...(existing.descriptors || []),
            ...uniqueDescriptors.map(serializeDescriptorSample),
          ],
          lastSubmittedAt: FieldValue.serverTimestamp(),
        }
      : {
          ...effectivePayload,
          active: true,
          approvalStatus: nextApprovalStatus,
          ...duplicateReviewFields,
          sampleCount: nextSampleCount,
          descriptors: uniqueDescriptors.map(serializeDescriptorSample),
          createdAt: FieldValue.serverTimestamp(),
          submittedAt: FieldValue.serverTimestamp(),
          lastSubmittedAt: FieldValue.serverTimestamp(),
        }

    transaction.set(personRef, nextPerson, { merge: true })
    transaction.set(employeeLockRef, {
      updatedAt: FieldValue.serverTimestamp(),
      personId: personRef.id,
    }, { merge: true })

    return {
      existing,
      personId: personRef.id,
      nextPerson,
      uniqueCount: uniqueDescriptors.length,
      duplicateCount: duplicateDescriptors.length,
      duplicateReview: duplicateFace?.reviewRequired ? duplicateFace : null,
    }
  })

  let indexSyncWarning = null
  try {
    await syncPersonBiometricIndex(db, transactionResult.personId, transactionResult.nextPerson)
  } catch (err) {
    console.error(`[Enrollment] Biometric index sync failed for ${transactionResult.personId}:`, err?.message)
    indexSyncWarning = 'Enrollment saved but biometric index update failed. Admin may need to rebuild the index.'
  }

  try {
    await syncPersonBiometricsRecord(db, transactionResult.personId, transactionResult.nextPerson)
  } catch (err) {
    console.error(`[Enrollment] person_biometrics sync failed for ${transactionResult.personId}:`, err?.message)
    if (!indexSyncWarning) {
      indexSyncWarning = 'Enrollment saved but biometric mirror sync failed.'
    }
  }

  const sampleCount = normalizeStoredDescriptors(transactionResult.nextPerson.descriptors).length

  return {
    transactionResult,
    sampleCount,
    indexSyncWarning,
    duplicateReviewRequired: Boolean(transactionResult.duplicateReview),
  }
}

// ---------------------------------------------------------------------------
// Photo upload and audit log — unchanged
// ---------------------------------------------------------------------------

export async function uploadEnrollmentPhotoIfPending(db, personId, photoDataUrl, approvalStatus) {
  if (!photoDataUrl || approvalStatus !== PERSON_APPROVAL_PENDING) return null
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!storageBucket) return null
  try {
    const photo = await uploadEnrollmentPhoto(storageBucket, personId, photoDataUrl)
    if (photo?.path) {
      await db.collection('persons').doc(personId).update({
        photoPath: photo.path,
        photoContentType: photo.contentType || 'image/jpeg',
        photoUpdatedAt: FieldValue.serverTimestamp(),
        photoUrl: FieldValue.delete(),
      })
    }
    return photo?.path || null
  } catch (err) {
    console.error('Enrollment photo upload failed (non-fatal):', err?.message)
    return null
  }
}

export async function writeEnrollmentAuditLog(db, transactionResult, body, office, resolvedSession) {
  const auditBase = {
    targetType: 'person',
    targetId: transactionResult.personId,
    officeId: office.id,
    metadata: {
      employeeId: body.employeeId,
      officeName: office.name,
      approvalStatus: transactionResult.nextPerson.approvalStatus,
      savedSampleCount: transactionResult.uniqueCount,
      duplicatesDropped: transactionResult.duplicateCount,
      duplicateReviewRequired: transactionResult.nextPerson.duplicateReviewRequired === true,
      duplicateReviewStatus: transactionResult.nextPerson.duplicateReviewStatus || 'clear',
      duplicateReviewReasonCode: transactionResult.nextPerson.duplicateReviewReasonCode || '',
      duplicateReviewCandidateEmployeeId: transactionResult.nextPerson.duplicateReviewCandidateEmployeeId || '',
      duplicateReviewDistance: Number.isFinite(transactionResult.nextPerson.duplicateReviewDistance)
        ? transactionResult.nextPerson.duplicateReviewDistance
        : null,
    },
  }

  if (resolvedSession && transactionResult.existing) {
    await writeAuditLog(db, {
      ...auditBase,
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_sample_add',
      summary: `Added ${transactionResult.uniqueCount} unique enrollment sample(s) for ${body.name}`,
    })
  } else if (resolvedSession) {
    await writeAuditLog(db, {
      ...auditBase,
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_create',
      summary: `Created employee record for ${body.name}`,
    })
  } else {
    await writeAuditLog(db, {
      ...auditBase,
      actorRole: 'public',
      actorScope: 'public',
      action: transactionResult.existing ? 'person_submission_update' : 'person_submission_create',
      summary: transactionResult.existing
        ? `Public enrollment resubmitted for ${body.name}`
        : `Public enrollment submitted for ${body.name}`,
    })
  }
}
