/**
 * lib/persons/enrollment.js
 *
 * Key fixes in this version:
 * 1. Duplicate sample rejection — if a new sample is within
 *    ENROLLMENT_MIN_SAMPLE_DIVERSITY of any existing sample for the same
 *    person, it is rejected. Prevents the identical-descriptor problem
 *    (A2qdbHgmLyb6MnbO1wlJ had 3 identical samples stored).
 *
 * 2. No per-frame yaw enforcement here (that's client-side); server-side
 *    the diversity requirement catches near-duplicate descriptors even if
 *    the client bypassed pose detection.
 */

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
import { syncPersonBiometricIndex, buildDescriptorBuckets } from '@/lib/biometric-index'
import { uploadEnrollmentPhoto } from '@/lib/storage'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from '@/lib/person-approval'

const BIOMETRIC_INDEX_COLLECTION = 'biometric_index'
const DUPLICATE_BLOCK_APPROVALS = [PERSON_APPROVAL_APPROVED, PERSON_APPROVAL_PENDING]

async function getDuplicateIndexCandidatesWithinTransaction(db, transaction, bucketField, bucketValue) {
  const snapshots = await Promise.all(
    DUPLICATE_BLOCK_APPROVALS.map(approvalStatus => (
      transaction.get(
        db.collection(BIOMETRIC_INDEX_COLLECTION)
          .where('active', '==', true)
          .where('approvalStatus', '==', approvalStatus)
          .where(bucketField, '==', bucketValue)
          .limit(20),
      )
    )),
  )

  return snapshots.flatMap(snapshot => snapshot.docs)
}

async function getDuplicateIndexCandidates(db, bucketField, bucketValue) {
  const snapshots = await Promise.all(
    DUPLICATE_BLOCK_APPROVALS.map(approvalStatus => (
      db.collection(BIOMETRIC_INDEX_COLLECTION)
        .where('active', '==', true)
        .where('approvalStatus', '==', approvalStatus)
        .where(bucketField, '==', bucketValue)
        .limit(20)
        .get()
    )),
  )

  return snapshots.flatMap(snapshot => snapshot.docs)
}

export function serializeDescriptorSample(descriptor) {
  const normalized = normalizeDescriptor(descriptor)
  return { vector: normalized }
}

/**
 * Filter out incoming descriptors that are too similar to each other
 * (within the same submission batch) or to already-stored descriptors
 * for the same person.
 *
 * Returns { accepted, rejected } arrays with reasons.
 */
export function deduplicateDescriptors(incomingDescriptors, existingDescriptors = []) {
  const normalizedExisting = existingDescriptors.map(normalizeDescriptor)
  const accepted = []
  const rejected = []

  for (const raw of incomingDescriptors) {
    const normalized = normalizeDescriptor(raw)

    // Check against already-stored samples
    const tooCloseToExisting = normalizedExisting.some(
      stored => euclideanDistance(stored, normalized) < ENROLLMENT_MIN_SAMPLE_DIVERSITY,
    )
    if (tooCloseToExisting) {
      rejected.push({ reason: 'too_similar_to_stored', descriptor: raw })
      continue
    }

    // Check against already-accepted in this batch
    const tooCloseToBatch = accepted.some(
      acc => euclideanDistance(normalizeDescriptor(acc), normalized) < ENROLLMENT_MIN_SAMPLE_DIVERSITY,
    )
    if (tooCloseToBatch) {
      rejected.push({ reason: 'too_similar_to_batch', descriptor: raw })
      continue
    }

    accepted.push(raw)
    normalizedExisting.push(normalized) // prevent future dupes in this batch
  }

  return { accepted, rejected }
}

export async function checkDuplicateFaceWithinTransaction(
  db, transaction, descriptors, excludePersonId = '',
) {
  for (const descriptor of descriptors) {
    const normalizedDescriptor = normalizeDescriptor(descriptor)
    const { bucketA, bucketB } = buildDescriptorBuckets(descriptor)

    const [docsA, docsB] = await Promise.all([
      getDuplicateIndexCandidatesWithinTransaction(db, transaction, 'bucketA', bucketA),
      getDuplicateIndexCandidatesWithinTransaction(db, transaction, 'bucketB', bucketB),
    ])

    if (docsA.length >= 40 || docsB.length >= 40) {
      console.warn('[Enrollment] Duplicate check bucket limit reached during transaction')
    }

    const candidateIds = new Set()
    const candidates = []
    for (const doc of [...docsA, ...docsB]) {
      if (!candidateIds.has(doc.id)) {
        candidateIds.add(doc.id)
        candidates.push({ id: doc.id, ...doc.data() })
      }
    }

    for (const candidate of candidates) {
      if (candidate.personId === excludePersonId) continue

      const personDoc = await transaction.get(
        db.collection('persons').doc(candidate.personId),
      )
      if (!personDoc.exists) continue

      const storedDescriptors = normalizeStoredDescriptors(personDoc.data().descriptors)
      for (const stored of storedDescriptors) {
        const distance = euclideanDistance(normalizeDescriptor(stored), normalizedDescriptor)
        if (distance < DISTANCE_THRESHOLD_ENROLLMENT) {
          return { person: { id: personDoc.id, ...personDoc.data() }, distance }
        }
      }
    }
  }
  return null
}

export async function checkDuplicateFace(db, descriptors, excludePersonId = '') {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null

  for (const descriptor of descriptors) {
    const normalizedDescriptor = normalizeDescriptor(descriptor)
    const { bucketA, bucketB } = buildDescriptorBuckets(descriptor)

    const [docsA, docsB] = await Promise.all([
      getDuplicateIndexCandidates(db, 'bucketA', bucketA),
      getDuplicateIndexCandidates(db, 'bucketB', bucketB),
    ])

    const candidateIds = new Set()
    const candidates = []
    for (const doc of [...docsA, ...docsB]) {
      if (!candidateIds.has(doc.id)) {
        candidateIds.add(doc.id)
        candidates.push({ id: doc.id, ...doc.data() })
      }
    }

    for (const candidate of candidates) {
      if (candidate.personId === excludePersonId) continue

      const personDoc = await db.collection('persons').doc(candidate.personId).get()
      if (!personDoc.exists) continue

      const storedDescriptors = normalizeStoredDescriptors(personDoc.data().descriptors)
      for (const stored of storedDescriptors) {
        const distance = euclideanDistance(normalizeDescriptor(stored), normalizedDescriptor)
        if (distance < DISTANCE_THRESHOLD_ENROLLMENT) {
          return { person: { id: personDoc.id, ...personDoc.data() }, distance }
        }
      }
    }
  }

  return null
}

export async function enrollPerson(db, body, office, resolvedSession) {
  const payload = {
    name: body.name.toUpperCase(),
    employeeId: body.employeeId,
    nameLower: body.name.toUpperCase().toLowerCase(),
    officeId: office.id,
    officeName: office.name,
    updatedAt: FieldValue.serverTimestamp(),
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

    if (!resolvedSession && existing && existingApprovalStatus === PERSON_APPROVAL_APPROVED) {
      throw new Error(
        'Employee ID already exists. Additional biometric samples for approved employees must be handled by an admin.',
      )
    }

    // ----- Deduplicate incoming descriptors against existing stored samples -----
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
    // --------------------------------------------------------------------------

    const duplicateFace = await checkDuplicateFaceWithinTransaction(db, transaction, uniqueDescriptors, existing?.id || '')

    if (duplicateFace) {
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

    const nextPerson = existing
      ? {
          ...existing,
          ...payload,
          active: existing.active !== false,
          approvalStatus: nextApprovalStatus,
          descriptors: [
            ...(existing.descriptors || []),
            ...uniqueDescriptors.map(serializeDescriptorSample),
          ],
          lastSubmittedAt: FieldValue.serverTimestamp(),
        }
      : {
          ...payload,
          active: true,
          approvalStatus: nextApprovalStatus,
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
    }
  })

  let indexSyncWarning = null
  try {
    await syncPersonBiometricIndex(db, transactionResult.personId, transactionResult.nextPerson)
  } catch (err) {
    console.error(`[Enrollment] Biometric index sync failed for ${transactionResult.personId}:`, err?.message)
    indexSyncWarning = 'Enrollment saved but biometric index update failed. Admin may need to rebuild the index.'
  }

  const sampleCount = normalizeStoredDescriptors(transactionResult.nextPerson.descriptors).length

  return { transactionResult, sampleCount, indexSyncWarning }
}

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
