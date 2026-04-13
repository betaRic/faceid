import 'server-only'

import { euclideanDistance, normalizeDescriptor, normalizeStoredDescriptors } from './biometrics/descriptor-utils'
import { getEffectivePersonApprovalStatus, isPersonBiometricActive } from './person-approval'
import { kvGet, kvSet, kvMget, kvKeys } from './kv-utils'

const BIOMETRIC_INDEX_COLLECTION = 'biometric_index'
const BUCKET_DIMENSIONS_A = [0, 64, 128, 256, 384, 512, 576, 640, 704, 768, 832, 896]
const BUCKET_DIMENSIONS_B = [32, 96, 160, 288, 352, 416, 480, 544, 608, 672, 736, 800]
const KV_CACHE_TTL_SECONDS = 300
const KV_CACHE_PREFIX = 'bioidx:'

async function tryGetCachedCandidates(officeIds, bucketA, bucketB) {
  if (!officeIds.length) return null

  const keys = officeIds.map(id => `${KV_CACHE_PREFIX}${id}`)
  const cached = await kvMget(...keys)

  const candidates = []
  for (const entry of cached) {
    if (!entry) continue
    try {
      const officeData = typeof entry === 'string' ? JSON.parse(entry) : entry
      if (officeData[bucketA]) candidates.push(...officeData[bucketA])
      if (officeData[bucketB]) candidates.push(...officeData[bucketB])
    } catch {}
  }

  return candidates.length > 0
    ? candidates.filter(c => c.approvalStatus === 'approved' && c.active !== false)
    : null
}

async function cacheCandidatesForOffice(officeId, allSamples) {
  const byBucket = {}
  for (const sample of allSamples) {
    if (!byBucket[sample.bucketA]) byBucket[sample.bucketA] = []
    if (!byBucket[sample.bucketB]) byBucket[sample.bucketB] = []
    const slim = {
      personId: sample.personId,
      employeeId: sample.employeeId,
      name: sample.name,
      officeId: sample.officeId,
      officeName: sample.officeName,
      normalizedDescriptor: sample.normalizedDescriptor,
      approvalStatus: sample.approvalStatus,
      active: sample.active,
    }
    byBucket[sample.bucketA].push(slim)
    byBucket[sample.bucketB].push(slim)
  }
  await kvSet(`${KV_CACHE_PREFIX}${officeId}`, JSON.stringify(byBucket), { ex: KV_CACHE_TTL_SECONDS })
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function descriptorBucket(normalizedDescriptor, dimensions) {
  if (!Array.isArray(normalizedDescriptor) || normalizedDescriptor.length === 0) return '0'.repeat(dimensions.length)
  return dimensions
    .map(i => (Number(normalizedDescriptor[i] || 0) >= 0.05 ? '1' : '0'))
    .join('')
}

function debugBuckets() {
  const testDescriptor = Array(1024).fill(0).map((_, i) => (Math.random() - 0.5) * 2)
  const bucketA = descriptorBucket(testDescriptor, BUCKET_DIMENSIONS_A)
  const bucketB = descriptorBucket(testDescriptor, BUCKET_DIMENSIONS_B)
  return { bucketA, bucketB, uniqueBuckets: new Set([bucketA, bucketB]).size }
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
      active: isPersonBiometricActive(personData),
      approvalStatus: getEffectivePersonApprovalStatus(personData),
      descriptor: safeArray(descriptor).map(Number),
      normalizedDescriptor,
      bucketA,
      bucketB,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
  })

  existingSnapshot.docs.forEach(record => {
    if (!desiredIds.has(record.id)) batch.delete(record.ref)
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

  const cached = await tryGetCachedCandidates(uniqueOfficeIds, bucketA, bucketB)
  if (cached && cached.length > 0) return cached

  const snapshots = []
  for (let i = 0; i < uniqueOfficeIds.length; i += 10) {
    const chunk = uniqueOfficeIds.slice(i, i + 10)
    snapshots.push(
      db.collection(BIOMETRIC_INDEX_COLLECTION)
        .where('active', '==', true)
        .where('approvalStatus', '==', 'approved')
        .where('officeId', 'in', chunk)
        .get(),
    )
  }

  const resolved = await Promise.all(snapshots)
  const deduped = new Map()
  const allSamples = []

  resolved.forEach(snapshot => {
    snapshot.docs.forEach(record => {
      if (!deduped.has(record.id)) {
        const data = record.data()
        const sampleBucketA = data.bucketA || ''
        const sampleBucketB = data.bucketB || ''
        if (sampleBucketA === bucketA || sampleBucketB === bucketB) {
          deduped.set(record.id, { id: record.id, ...data })
          allSamples.push(data)
        }
      }
    })
  })

  if (allSamples.length === 0) {
    resolved.forEach(snapshot => {
      snapshot.docs.forEach(record => {
        if (!deduped.has(record.id)) {
          const data = record.data()
          deduped.set(record.id, { id: record.id, ...data })
          allSamples.push(data)
        }
      })
    })
  }

  // Warm cache per office (fire-and-forget)
  const byOffice = {}
  for (const sample of allSamples) {
    if (!byOffice[sample.officeId]) byOffice[sample.officeId] = []
    byOffice[sample.officeId].push(sample)
  }
  for (const [officeId, samples] of Object.entries(byOffice)) {
    cacheCandidatesForOffice(officeId, samples).catch(err => {
      if (process.env.NODE_ENV !== 'production') console.warn(`[BiometricIndex] Cache warming failed for office ${officeId}:`, err?.message)
    })
  }

  return Array.from(deduped.values())
}

export function matchBiometricIndexCandidates(candidateSamples, descriptor, distanceThreshold, ambiguousMargin) {
  const queryDescriptor = normalizeDescriptor(descriptor)
  const perPerson = new Map()

  for (const sample of candidateSamples) {
    const sampleDescriptor = Array.isArray(sample.normalizedDescriptor)
      ? sample.normalizedDescriptor.map(Number)
      : []
    if (sampleDescriptor.length !== queryDescriptor.length) continue

    const distance = euclideanDistance(sampleDescriptor, queryDescriptor)
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
  }

  const ranked = Array.from(perPerson.values()).sort((a, b) => a.distance - b.distance)
  const best = ranked[0]
  const second = ranked[1] || null

  const debug = {
    source: 'biometric_index',
    candidateCount: ranked.length,
    bestDistance: best?.distance ?? null,
    secondDistance: second?.distance ?? null,
    threshold: distanceThreshold,
    ambiguousMargin,
  }

  if (!best || best.distance > distanceThreshold) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.', debug }
  }

  const margin = second ? second.distance - best.distance : 1
  if (second && margin < ambiguousMargin) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
      message: 'Face match is ambiguous between multiple employees.',
      debug,
    }
  }

  return {
    ok: true,
    personId: best.personId,
    distance: best.distance,
    confidence: 1 - best.distance,
    matchedSample: best,
    debug,
  }
}

export async function warmBiometricIndexCache(db, officeIds) {
  let warmedCount = 0
  for (let i = 0; i < officeIds.length; i += 10) {
    const chunk = officeIds.slice(i, i + 10)
    try {
      const snapshot = await db
        .collection(BIOMETRIC_INDEX_COLLECTION)
        .where('active', '==', true)
        .where('approvalStatus', '==', 'approved')
        .where('officeId', 'in', chunk)
        .get()

      const byOffice = {}
      for (const doc of snapshot.docs) {
        const data = doc.data()
        if (!byOffice[data.officeId]) byOffice[data.officeId] = []
        byOffice[data.officeId].push(data)
      }
      for (const [officeId, samples] of Object.entries(byOffice)) {
        await cacheCandidatesForOffice(officeId, samples)
        warmedCount++
      }
    } catch (err) {
      console.error('Biometric cache warm failed for chunk:', err)
    }
  }
  return warmedCount
}
