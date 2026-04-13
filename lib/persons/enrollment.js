import { FieldValue } from 'firebase-admin/firestore'
import { DUPLICATE_FACE_THRESHOLD } from '@/lib/config'
import { normalizeStoredDescriptors, normalizeDescriptor, euclideanDistance } from '@/lib/biometrics/descriptor-utils'
import { writeAuditLog } from '@/lib/audit-log'
import { syncPersonBiometricIndex, buildDescriptorBuckets } from '@/lib/biometric-index'
import { uploadEnrollmentPhoto } from '@/lib/storage'
import { getEffectivePersonApprovalStatus, PERSON_APPROVAL_APPROVED, PERSON_APPROVAL_PENDING } from '@/lib/person-approval'

const BIOMETRIC_INDEX_COLLECTION = 'biometric_index'

export function serializeDescriptorSample(descriptor) {
  const normalized = normalizeDescriptor(descriptor)
  return { vector: normalized }
}

export async function checkDuplicateFaceWithinTransaction(db, transaction, descriptors, officeId, currentEmployeeId = '') {
  for (const descriptor of descriptors) {
    const normalizedDescriptor = normalizeDescriptor(descriptor)
    const { bucketA, bucketB } = buildDescriptorBuckets(descriptor)

    const [snapA, snapB] = await Promise.all([
      transaction.get(
        db.collection(BIOMETRIC_INDEX_COLLECTION)
          .where('active', '==', true)
          .where('officeId', '==', officeId)
          .where('bucketA', '==', bucketA)
          .limit(20)
      ),
      transaction.get(
        db.collection(BIOMETRIC_INDEX_COLLECTION)
          .where('active', '==', true)
          .where('officeId', '==', officeId)
          .where('bucketB', '==', bucketB)
          .limit(20)
      ),
    ])

    if (snapA.docs.length === 20 || snapB.docs.length === 20) {
      console.warn(`[Enrollment] Duplicate check bucket limit reached for office ${officeId} — results may be incomplete`)
    }

    const candidateIds = new Set()
    const candidates = []
    snapA.docs.forEach(doc => {
      if (!candidateIds.has(doc.id)) {
        candidateIds.add(doc.id)
        candidates.push({ id: doc.id, ...doc.data() })
      }
    })
    snapB.docs.forEach(doc => {
      if (!candidateIds.has(doc.id)) {
        candidateIds.add(doc.id)
        candidates.push({ id: doc.id, ...doc.data() })
      }
    })

    for (const candidate of candidates) {
      if (candidate.personId === currentEmployeeId) continue

      const personDoc = await transaction.get(db.collection('persons').doc(candidate.personId))
      if (!personDoc.exists) continue

      const personData = personDoc.data()
      const storedDescriptors = normalizeStoredDescriptors(personData.descriptors)

      for (const stored of storedDescriptors) {
        const distance = euclideanDistance(normalizeDescriptor(stored), normalizedDescriptor)
        if (distance < DUPLICATE_FACE_THRESHOLD) {
          return {
            person: { id: personDoc.id, ...personData },
            distance,
            candidatePersonId: candidate.personId,
          }
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
      throw new Error('Employee ID already exists. Additional biometric samples for approved employees must be handled by an admin.')
    }

    const duplicateFace = await checkDuplicateFaceWithinTransaction(
      db,
      transaction,
      body.descriptors,
      office.id,
      existing?.employeeId || '',
    )

    if (duplicateFace) {
      const dup = duplicateFace.person
      throw Object.assign(
        new Error(`Face is too similar to ${dup.name} (${dup.employeeId || 'no employee ID'}). Duplicate enrollment blocked.`),
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
            ...body.descriptors.map(serializeDescriptorSample),
          ],
          lastSubmittedAt: FieldValue.serverTimestamp(),
        }
      : {
          ...payload,
          active: true,
          approvalStatus: nextApprovalStatus,
          descriptors: body.descriptors.map(serializeDescriptorSample),
          createdAt: FieldValue.serverTimestamp(),
          submittedAt: FieldValue.serverTimestamp(),
          lastSubmittedAt: FieldValue.serverTimestamp(),
        }

    transaction.set(personRef, nextPerson, { merge: true })
    transaction.set(employeeLockRef, {
      updatedAt: FieldValue.serverTimestamp(),
      personId: personRef.id,
    }, { merge: true })

    return { existing, personId: personRef.id, nextPerson }
  })

  let indexSyncWarning = null
  try {
    await syncPersonBiometricIndex(db, transactionResult.personId, transactionResult.nextPerson)
  } catch (err) {
    console.error(`[Enrollment] Biometric index sync failed for ${transactionResult.personId}:`, err?.message)
    indexSyncWarning = 'Enrollment saved but biometric index update failed. Admin may need to rebuild the index.'
  }

  const sampleCount = normalizeStoredDescriptors(transactionResult.nextPerson.descriptors).length

  return {
    transactionResult,
    sampleCount,
    indexSyncWarning,
  }
}

export async function uploadEnrollmentPhotoIfPending(db, personId, photoDataUrl, approvalStatus) {
  if (!photoDataUrl || approvalStatus !== PERSON_APPROVAL_PENDING) return null

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!storageBucket) return null

  try {
    const photoUrl = await uploadEnrollmentPhoto(storageBucket, personId, photoDataUrl)
    if (photoUrl) {
      await db.collection('persons').doc(personId).update({ photoUrl })
    }
    return photoUrl
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
      savedSampleCount: body.descriptors.length,
    },
  }

  if (resolvedSession && transactionResult.existing) {
    await writeAuditLog(db, {
      ...auditBase,
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_sample_add',
      summary: `Added enrollment sample for ${body.name}`,
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
