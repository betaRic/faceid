import 'server-only'

import { euclideanDistance, normalizeDescriptor, normalizeStoredDescriptors } from './biometrics/descriptor-utils'
import { getEffectivePersonApprovalStatus, isPersonBiometricActive } from './person-approval'
import { kvGet, kvSet, kvMget, kvKeys, kvDel } from './kv-utils'

const BIOMETRIC_INDEX_COLLECTION = 'biometric_index'
const BUCKET_DIMENSIONS_A = [0, 64, 128, 256, 384, 512, 576, 640, 704, 768, 832, 896]
const BUCKET_DIMENSIONS_B = [32, 96, 160, 288, 352, 416, 480, 544, 608, 672, 736, 800]
const KV_CACHE_TTL_SECONDS = 300
const KV_CACHE_PREFIX = 'bioidx:'
const APPROVED_STATUS = 'approved'
const FIRESTORE_IN_QUERY_CHUNK_SIZE = 30
const FIRESTORE_QUERY_STRATEGY_BUCKETED = 'bucketed'
const FIRESTORE_QUERY_STRATEGY_FULL = 'full'

function isIndexSampleSearchable(sample) {
  if (!sample || typeof sample !== 'object') return false
  if (sample.biometricEnabled === true) return true
  if (sample.biometricEnabled === false) return false

  // Backward-compatibility: older index rows may be missing biometricEnabled.
  // Those rows can still be used if they are active and approved, but an
  // explicitly disabled row must never remain searchable.
  return sample.active !== false && String(sample.approvalStatus || '') === APPROVED_STATUS
}

async function tryGetCachedCandidates(officeIds) {
  if (!officeIds.length) return null

  const keys = officeIds.map(id => `${KV_CACHE_PREFIX}${id}`)
  const cached = await kvMget(...keys)

  // If ANY office has a cache miss, return null to force a full Firestore fetch.
  // Returning partial results would silently exclude uncached offices, causing
  // false-negative matches for employees in those offices.
  const allHit = cached.every(entry => entry !== null)
  if (!allHit) return null

  const candidates = []
  for (const entry of cached) {
    try {
      const samples = typeof entry === 'string' ? JSON.parse(entry) : entry
      if (Array.isArray(samples)) candidates.push(...samples)
    } catch {}
  }

  return candidates.length > 0
    ? candidates.filter(isIndexSampleSearchable)
    : null
}

function filterCandidatesByBuckets(samples, bucketA, bucketB) {
  const filtered = safeArray(samples).filter(sample =>
    sample?.bucketA === bucketA || sample?.bucketB === bucketB,
  )

  return filtered.length > 0 ? filtered : safeArray(samples)
}

async function cacheCandidatesForOffice(officeId, allSamples) {
  const samples = allSamples.map(sample => ({
    personId: sample.personId,
    employeeId: sample.employeeId,
    name: sample.name,
    officeId: sample.officeId,
    officeName: sample.officeName,
    normalizedDescriptor: sample.normalizedDescriptor,
    bucketA: sample.bucketA,
    bucketB: sample.bucketB,
    approvalStatus: sample.approvalStatus,
    active: sample.active,
    biometricEnabled: sample.biometricEnabled,
  }))
  await kvSet(`${KV_CACHE_PREFIX}${officeId}`, samples, { ex: KV_CACHE_TTL_SECONDS })
}

async function invalidateOfficeCandidateCache(officeIds) {
  const uniqueOfficeIds = Array.from(new Set(safeArray(officeIds).filter(Boolean)))
  if (uniqueOfficeIds.length === 0) return { requested: 0, cleared: 0 }

  const results = await Promise.allSettled(
    uniqueOfficeIds.map(officeId => kvDel(`${KV_CACHE_PREFIX}${officeId}`)),
  )

  return {
    requested: uniqueOfficeIds.length,
    cleared: results.filter(result => result.status === 'fulfilled' && result.value === true).length,
  }
}

export async function clearBiometricIndexCache() {
  const keys = await kvKeys(`${KV_CACHE_PREFIX}*`)
  if (!Array.isArray(keys) || keys.length === 0) {
    return { requested: 0, cleared: 0 }
  }

  const results = await Promise.allSettled(keys.map(key => kvDel(String(key || ''))))
  return {
    requested: keys.length,
    cleared: results.filter(result => result.status === 'fulfilled' && result.value === true).length,
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function collectSearchableSamplesFromSnapshots(snapshots) {
  const deduped = new Map()

  safeArray(snapshots).forEach(snapshot => {
    snapshot?.docs?.forEach(record => {
      if (deduped.has(record.id)) return

      const data = record.data()
      if (!isIndexSampleSearchable(data)) return
      deduped.set(record.id, { id: record.id, ...data })
    })
  })

  return Array.from(deduped.values())
}

function warmOfficeCacheFromSamples(samples) {
  const byOffice = {}

  safeArray(samples).forEach(sample => {
    const officeId = String(sample?.officeId || '')
    if (!officeId) return
    if (!byOffice[officeId]) byOffice[officeId] = []
    byOffice[officeId].push(sample)
  })

  for (const [officeId, officeSamples] of Object.entries(byOffice)) {
    cacheCandidatesForOffice(officeId, officeSamples).catch(err => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[BiometricIndex] Cache warming failed for office ${officeId}:`, err?.message)
      }
    })
  }
}

function descriptorBucket(normalizedDescriptor, dimensions) {
  if (!Array.isArray(normalizedDescriptor) || normalizedDescriptor.length === 0) return '0'.repeat(dimensions.length)
  return dimensions
    .map(i => (Number(normalizedDescriptor[i] || 0) >= 0.05 ? '1' : '0'))
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
    const biometricEnabled = isPersonBiometricActive(personData)

    batch.set(db.collection(BIOMETRIC_INDEX_COLLECTION).doc(docId), {
      personId,
      sampleIndex,
      employeeId: String(personData.employeeId || ''),
      name: String(personData.name || ''),
      officeId: String(personData.officeId || ''),
      officeName: String(personData.officeName || ''),
      active: personData.active !== false,
      biometricEnabled,
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

  // Invalidate KV cache for this person's office so the next kiosk scan
  // fetches fresh data from Firestore. Without this, a newly enrolled person
  // can't be recognized until the cache expires (up to 5 minutes).
  const officeId = String(personData.officeId || '')
  if (officeId) {
    await invalidateOfficeCandidateCache([officeId])
  }
}

export async function deletePersonBiometricIndex(db, personId, options = {}) {
  const snapshot = await db
    .collection(BIOMETRIC_INDEX_COLLECTION)
    .where('personId', '==', personId)
    .get()

  const fallbackOfficeIds = safeArray(options.officeIds).map(id => String(id || '')).filter(Boolean)
  if (snapshot.empty) {
    await invalidateOfficeCandidateCache(fallbackOfficeIds)
    return
  }

  const officeIds = [
    ...snapshot.docs.map(record => String(record.data()?.officeId || '')),
    ...fallbackOfficeIds,
  ]
  const batch = db.batch()
  snapshot.docs.forEach(record => batch.delete(record.ref))
  await batch.commit()
  await invalidateOfficeCandidateCache(officeIds)
}

export async function queryBiometricIndexCandidates(db, officeIds, descriptor) {
  return queryBiometricIndexCandidatesWithStrategy(db, officeIds, descriptor, {
    strategy: FIRESTORE_QUERY_STRATEGY_BUCKETED,
  })
}

async function queryBiometricIndexCandidatesWithStrategy(db, officeIds, descriptor, options = {}) {
  const uniqueOfficeIds = Array.from(new Set(safeArray(officeIds).filter(Boolean)))
  if (uniqueOfficeIds.length === 0) return []
  const strategy = options.strategy === FIRESTORE_QUERY_STRATEGY_FULL
    ? FIRESTORE_QUERY_STRATEGY_FULL
    : FIRESTORE_QUERY_STRATEGY_BUCKETED
  const { bucketA, bucketB } = buildDescriptorBuckets(descriptor)

  const cached = await tryGetCachedCandidates(uniqueOfficeIds)
  if (cached && cached.length > 0) {
    return strategy === FIRESTORE_QUERY_STRATEGY_FULL
      ? cached
      : filterCandidatesByBuckets(cached, bucketA, bucketB)
  }

  const snapshots = []
  for (let index = 0; index < uniqueOfficeIds.length; index += FIRESTORE_IN_QUERY_CHUNK_SIZE) {
    const chunk = uniqueOfficeIds.slice(index, index + FIRESTORE_IN_QUERY_CHUNK_SIZE)
    if (strategy === FIRESTORE_QUERY_STRATEGY_FULL) {
      snapshots.push(
        db.collection(BIOMETRIC_INDEX_COLLECTION)
          .where('active', '==', true)
          .where('approvalStatus', '==', APPROVED_STATUS)
          .where('officeId', 'in', chunk)
          .get(),
      )
      continue
    }

    snapshots.push(
      db.collection(BIOMETRIC_INDEX_COLLECTION)
        .where('active', '==', true)
        .where('approvalStatus', '==', APPROVED_STATUS)
        .where('officeId', 'in', chunk)
        .where('bucketA', '==', bucketA)
        .get(),
    )

    snapshots.push(
      db.collection(BIOMETRIC_INDEX_COLLECTION)
        .where('active', '==', true)
        .where('approvalStatus', '==', APPROVED_STATUS)
        .where('officeId', 'in', chunk)
        .where('bucketB', '==', bucketB)
        .get(),
    )
  }

  const resolved = await Promise.all(snapshots)
  const samples = collectSearchableSamplesFromSnapshots(resolved)

  if (strategy === FIRESTORE_QUERY_STRATEGY_FULL && samples.length > 0) {
    warmOfficeCacheFromSamples(samples)
  }

  return strategy === FIRESTORE_QUERY_STRATEGY_FULL
    ? samples
    : filterCandidatesByBuckets(samples, bucketA, bucketB)
}

export async function queryBiometricIndexCandidatesFull(db, officeIds, descriptor) {
  return queryBiometricIndexCandidatesWithStrategy(db, officeIds, descriptor, {
    strategy: FIRESTORE_QUERY_STRATEGY_FULL,
  })
}

export function matchBiometricIndexCandidates(candidateSamples, descriptor, distanceThreshold, ambiguousMargin) {
  const queryDescriptor = normalizeDescriptor(descriptor)
  const perPerson = new Map()

  const debugSample = candidateSamples[0]
  let debugInfo = null
  if (debugSample?.normalizedDescriptor) {
    const debugStored = debugSample.normalizedDescriptor.map(Number)
    const debugQuery = queryDescriptor
    const firstDist = euclideanDistance(debugStored, debugQuery)
    const storedMag = Math.sqrt(debugStored.reduce((s, v) => s + v * v, 0))
    const queryMag = Math.sqrt(debugQuery.reduce((s, v) => s + v * v, 0))
    debugInfo = {
      storedDescriptorSample: debugStored.slice(0, 5),
      queryDescriptorSample: queryDescriptor.slice(0, 5),
      storedMagnitude: storedMag,
      queryMagnitude: queryMag,
      firstDistanceBeforeNorm: firstDist,
    }
  }

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
    ...debugInfo,
  }

  if (!best || best.distance > distanceThreshold) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.', debug }
  }

  const margin = second ? second.distance - best.distance : 1
  // Only flag ambiguous when the primary match is already in the uncertain zone (>= 0.60).
  // A strong match (< 0.60) takes priority even if another person scores close —
  // this prevents false blocks caused by clustered low-quality descriptors (e.g. old
  // center-only captures from the skipFrames bug compressing inter-person distances).
  if (second && margin < ambiguousMargin && best.distance >= 0.60) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
      message: 'Face match is ambiguous between multiple employees.',
      debug,
    }
  }

  // Map distance to a 0–1 confidence where 0 = threshold, 1 = perfect match.
  // L2 on unit vectors: 0 = identical, ~1.41 = opposite. Typical same-person: 0.3–0.7.
  const confidence = Math.max(0, Math.min(1, 1 - (best.distance / distanceThreshold)))

  return {
    ok: true,
    personId: best.personId,
    distance: best.distance,
    confidence,
    matchedSample: best,
    debug,
  }
}

export async function warmBiometricIndexCache(db, officeIds) {
  let warmedCount = 0
  for (let i = 0; i < officeIds.length; i += FIRESTORE_IN_QUERY_CHUNK_SIZE) {
    const chunk = officeIds.slice(i, i + FIRESTORE_IN_QUERY_CHUNK_SIZE)
    try {
      const snapshot = await db
        .collection(BIOMETRIC_INDEX_COLLECTION)
        .where('officeId', 'in', chunk)
        .get()

      const byOffice = {}
      for (const doc of snapshot.docs) {
        const data = doc.data()
        if (!isIndexSampleSearchable(data)) continue
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
