import { createClient } from 'redis'

export const BIOMETRIC_INDEX_COLLECTION = 'biometric_index'

const APPROVED_STATUS = 'approved'
const BUCKET_DIMENSIONS_A = [0, 64, 128, 256, 384, 512, 576, 640, 704, 768, 832, 896]
const BUCKET_DIMENSIONS_B = [32, 96, 160, 288, 352, 416, 480, 544, 608, 672, 736, 800]
const FIRESTORE_IN_QUERY_CHUNK_SIZE = 30
const KV_CACHE_PREFIX = 'bioidx:'
const KV_CACHE_TTL_SECONDS = 300

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeStoredDescriptors(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(sample => {
      if (Array.isArray(sample)) return sample.map(Number)
      if (sample && typeof sample === 'object' && Array.isArray(sample.vector)) {
        return sample.vector.map(Number)
      }
      return null
    })
    .filter(sample => Array.isArray(sample) && sample.length > 0)
}

function normalizeDescriptor(vector) {
  const arr = Array.isArray(vector) ? vector.map(Number) : []
  const magnitude = Math.sqrt(arr.reduce((sum, value) => sum + (value * value), 0))
  if (magnitude === 0) return arr.map(() => 0)
  return arr.map(value => value / magnitude)
}

function normalizePersonApprovalStatus(value, fallback = APPROVED_STATUS) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'pending') return 'pending'
  if (normalized === APPROVED_STATUS) return APPROVED_STATUS
  if (normalized === 'rejected') return 'rejected'
  return fallback
}

function getEffectivePersonApprovalStatus(person, fallback = APPROVED_STATUS) {
  return normalizePersonApprovalStatus(person?.approvalStatus, fallback)
}

function isPersonBiometricActive(person) {
  return person?.active !== false && getEffectivePersonApprovalStatus(person) === APPROVED_STATUS
}

function descriptorBucket(normalizedDescriptor, dimensions) {
  if (!Array.isArray(normalizedDescriptor) || normalizedDescriptor.length === 0) {
    return '0'.repeat(dimensions.length)
  }

  return dimensions
    .map(index => (Number(normalizedDescriptor[index] || 0) >= 0.05 ? '1' : '0'))
    .join('')
}

export function buildDescriptorBuckets(descriptor) {
  const normalizedDescriptor = normalizeDescriptor(descriptor)
  return {
    normalizedDescriptor,
    bucketA: descriptorBucket(normalizedDescriptor, BUCKET_DIMENSIONS_A),
    bucketB: descriptorBucket(normalizedDescriptor, BUCKET_DIMENSIONS_B),
  }
}

function buildIndexDocId(personId, sampleIndex) {
  return `${personId}_${sampleIndex}`
}

function isIndexSampleSearchable(sample) {
  if (!sample || typeof sample !== 'object') return false
  if (sample.biometricEnabled === true) return true
  if (sample.biometricEnabled === false) return false
  return sample.active !== false && String(sample.approvalStatus || '') === APPROVED_STATUS
}

function serializeIndexSample(sample) {
  return {
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
  }
}

export async function createRedisClientFromEnv(options = {}) {
  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    if (options.required) {
      throw new Error('REDIS_URL is not configured')
    }
    return null
  }

  const client = createClient({
    url,
    socket: {
      connectTimeout: 10_000,
    },
  })

  await client.connect()
  return client
}

export async function closeRedisClient(client) {
  if (!client) return
  try {
    if (client.isOpen) await client.quit()
  } catch {}
}

export async function countBiometricCacheKeys(redis) {
  if (!redis) return 0
  const keys = await redis.keys(`${KV_CACHE_PREFIX}*`)
  return Array.isArray(keys) ? keys.length : 0
}

async function setOfficeCache(redis, officeId, samples) {
  if (!redis || !officeId) return false
  await redis.setEx(
    `${KV_CACHE_PREFIX}${officeId}`,
    KV_CACHE_TTL_SECONDS,
    JSON.stringify(samples.map(serializeIndexSample)),
  )
  return true
}

export async function invalidateOfficeCandidateCache(redis, officeIds) {
  if (!redis) return { requested: 0, cleared: 0 }

  const uniqueOfficeIds = Array.from(new Set(safeArray(officeIds).filter(Boolean)))
  if (uniqueOfficeIds.length === 0) {
    return { requested: 0, cleared: 0 }
  }

  let cleared = 0
  for (const officeId of uniqueOfficeIds) {
    cleared += await redis.del(`${KV_CACHE_PREFIX}${officeId}`)
  }

  return {
    requested: uniqueOfficeIds.length,
    cleared,
  }
}

export async function syncPersonBiometricIndex(db, redis, personId, personData) {
  const descriptors = normalizeStoredDescriptors(personData?.descriptors)
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
      employeeId: String(personData?.employeeId || ''),
      name: String(personData?.name || ''),
      officeId: String(personData?.officeId || ''),
      officeName: String(personData?.officeName || ''),
      active: personData?.active !== false,
      biometricEnabled: isPersonBiometricActive(personData),
      approvalStatus: getEffectivePersonApprovalStatus(personData),
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
  await invalidateOfficeCandidateCache(redis, [String(personData?.officeId || '')])
}

export async function warmBiometricIndexCache(db, redis, officeIds) {
  let warmed = 0
  const uniqueOfficeIds = Array.from(new Set(safeArray(officeIds).filter(Boolean)))

  for (let index = 0; index < uniqueOfficeIds.length; index += FIRESTORE_IN_QUERY_CHUNK_SIZE) {
    const chunk = uniqueOfficeIds.slice(index, index + FIRESTORE_IN_QUERY_CHUNK_SIZE)
    const snapshot = await db
      .collection(BIOMETRIC_INDEX_COLLECTION)
      .where('officeId', 'in', chunk)
      .get()

    const byOffice = {}
    for (const record of snapshot.docs) {
      const sample = record.data() || {}
      if (!isIndexSampleSearchable(sample)) continue
      const officeId = String(sample.officeId || '')
      if (!officeId) continue
      if (!byOffice[officeId]) byOffice[officeId] = []
      byOffice[officeId].push(sample)
    }

    for (const [officeId, samples] of Object.entries(byOffice)) {
      await setOfficeCache(redis, officeId, samples)
      warmed += 1
    }
  }

  return warmed
}
