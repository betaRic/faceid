import 'server-only'

const BIOMETRIC_INDEX_COLLECTION = 'biometric_index'
const BUCKET_DIMENSIONS_A = [0, 7, 15, 23, 31, 39, 47, 55, 63, 71, 79, 87]
const BUCKET_DIMENSIONS_B = [3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91]

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeStoredDescriptors(value) {
  return safeArray(value)
    .map(sample => {
      if (Array.isArray(sample)) return sample.map(Number)
      if (sample && typeof sample === 'object' && Array.isArray(sample.vector)) {
        return sample.vector.map(Number)
      }
      return null
    })
    .filter(sample => Array.isArray(sample) && sample.length > 0)
}

export function euclideanDistance(left, right) {
  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index] - right[index]
    total += diff * diff
  }

  return Math.sqrt(total)
}

export function normalizeDescriptor(descriptor) {
  const vector = safeArray(descriptor).map(Number)
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + (value * value), 0))
  if (!magnitude) return vector.map(() => 0)
  return vector.map(value => value / magnitude)
}

function descriptorBucket(normalizedDescriptor, dimensions) {
  return dimensions
    .map(index => (Number(normalizedDescriptor[index] || 0) >= 0 ? '1' : '0'))
    .join('')
}

export function buildDescriptorBuckets(descriptor) {
  const normalized = normalizeDescriptor(descriptor)
  return {
    normalizedDescriptor: normalized,
    bucketA: descriptorBucket(normalized, BUCKET_DIMENSIONS_A),
    bucketB: descriptorBucket(normalized, BUCKET_DIMENSIONS_B),
  }
}

function buildIndexDocId(personId, sampleIndex) {
  return `${personId}_${sampleIndex}`
}

export async function syncPersonBiometricIndex(db, personId, personData) {
  const descriptors = normalizeStoredDescriptors(personData.descriptors)
  const existingSnapshot = await db
    .collection(BIOMETRIC_INDEX_COLLECTION)
    .where('personId', '==', personId)
    .get()

  const desiredIds = new Set()
  const batch = db.batch()

  descriptors.forEach((descriptor, sampleIndex) => {
    const { normalizedDescriptor, bucketA, bucketB } = buildDescriptorBuckets(descriptor)
    const docId = buildIndexDocId(personId, sampleIndex)
    desiredIds.add(docId)

    batch.set(db.collection(BIOMETRIC_INDEX_COLLECTION).doc(docId), {
      personId,
      sampleIndex,
      employeeId: String(personData.employeeId || ''),
      name: String(personData.name || ''),
      officeId: String(personData.officeId || ''),
      officeName: String(personData.officeName || ''),
      active: personData.active !== false,
      descriptor: safeArray(descriptor).map(Number),
      normalizedDescriptor,
      bucketA,
      bucketB,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
  })

  existingSnapshot.docs.forEach(record => {
    if (!desiredIds.has(record.id)) {
      batch.delete(record.ref)
    }
  })

  await batch.commit()
}

export async function deletePersonBiometricIndex(db, personId) {
  const snapshot = await db
    .collection(BIOMETRIC_INDEX_COLLECTION)
    .where('personId', '==', personId)
    .get()

  if (snapshot.empty) return

  const batch = db.batch()
  snapshot.docs.forEach(record => batch.delete(record.ref))
  await batch.commit()
}

export async function queryBiometricIndexCandidates(db, officeIds, descriptor) {
  const uniqueOfficeIds = Array.from(new Set(safeArray(officeIds).filter(Boolean)))
  if (uniqueOfficeIds.length === 0) return []

  const { bucketA, bucketB } = buildDescriptorBuckets(descriptor)
  const snapshots = []

  for (let index = 0; index < uniqueOfficeIds.length; index += 10) {
    const officeChunk = uniqueOfficeIds.slice(index, index + 10)
    snapshots.push(
      db.collection(BIOMETRIC_INDEX_COLLECTION)
        .where('active', '==', true)
        .where('officeId', 'in', officeChunk)
        .where('bucketA', '==', bucketA)
        .get(),
    )
    snapshots.push(
      db.collection(BIOMETRIC_INDEX_COLLECTION)
        .where('active', '==', true)
        .where('officeId', 'in', officeChunk)
        .where('bucketB', '==', bucketB)
        .get(),
    )
  }

  const resolved = await Promise.all(snapshots)
  const deduped = new Map()
  resolved.forEach(snapshot => {
    snapshot.docs.forEach(record => {
      deduped.set(record.id, { id: record.id, ...record.data() })
    })
  })

  return Array.from(deduped.values())
}

export function matchBiometricIndexCandidates(candidateSamples, descriptor, distanceThreshold, ambiguousMargin) {
  const perPerson = new Map()

  candidateSamples.forEach(sample => {
    const sampleDescriptor = safeArray(sample.descriptor).map(Number)
    if (sampleDescriptor.length !== descriptor.length || sampleDescriptor.length === 0) return

    const distance = euclideanDistance(sampleDescriptor, descriptor)
    const current = perPerson.get(sample.personId)

    if (!current || distance < current.distance) {
      perPerson.set(sample.personId, {
        personId: sample.personId,
        employeeId: String(sample.employeeId || ''),
        name: String(sample.name || ''),
        officeId: String(sample.officeId || ''),
        officeName: String(sample.officeName || ''),
        distance,
      })
    }
  })

  const ranked = Array.from(perPerson.values()).sort((left, right) => left.distance - right.distance)
  const best = ranked[0]
  const second = ranked[1] || null

  if (!best || best.distance > distanceThreshold) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.' }
  }

  const margin = second ? second.distance - best.distance : 1
  if (second && margin < ambiguousMargin) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
      message: `Face match is too close between ${best.name} and ${second.name}.`,
    }
  }

  return {
    ok: true,
    personId: best.personId,
    distance: best.distance,
    confidence: 1 - best.distance,
    matchedSample: best,
  }
}
