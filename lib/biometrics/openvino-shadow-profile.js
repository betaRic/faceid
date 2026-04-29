import 'server-only'

export const PERSON_BIOMETRICS_COLLECTION = 'person_biometrics'
const DEFAULT_MAX_SAMPLES = 6
const DEFAULT_FRAMES_PER_SCAN = 2
const DEFAULT_MAX_HUMAN_DISTANCE = 0.68
const DEFAULT_MIN_HUMAN_MARGIN = 0.08
const DEFAULT_MIN_SUPPORT = 2
const DEFAULT_MIN_COSINE_DIVERSITY = 0.015

let activeProfileJobs = 0

function boolEnv(name, fallback = false) {
  const value = process.env[name]
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function numberEnv(name, fallback) {
  const numeric = Number(process.env[name])
  return Number.isFinite(numeric) ? numeric : fallback
}

function positiveIntegerEnv(name, fallback) {
  const numeric = Math.floor(Number(process.env[name]))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

function defaultShadowEnabled() {
  return Boolean(
    process.env.RAILWAY_SERVICE_ID
    || process.env.INCLUDE_OPENVINO_RUNTIME === 'true'
  )
}

function finiteNumber(...values) {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function sanitizeVector(vector) {
  return safeArray(vector)
    .map(Number)
    .filter(Number.isFinite)
}

function sanitizeEmbeddingSample(sample) {
  const source = sample && typeof sample === 'object' ? sample : {}
  const vector = sanitizeVector(source.vector || source.descriptor)
  if (vector.length !== 256) return null

  return {
    vector,
    modelVersion: String(source.modelVersion || '').slice(0, 80),
    distanceMetric: String(source.distanceMetric || 'cosine').slice(0, 20),
    source: String(source.source || 'accepted_human_scan_shadow').slice(0, 80),
    capturedAt: finiteNumber(source.capturedAt) ?? null,
    frameIndex: Number.isFinite(source.frameIndex) ? Number(source.frameIndex) : null,
    faceScore: finiteNumber(source.faceScore),
    performanceMs: finiteNumber(source.performanceMs),
    humanBestDistance: finiteNumber(source.humanBestDistance),
    humanSecondDistance: finiteNumber(source.humanSecondDistance),
    humanMargin: finiteNumber(source.humanMargin),
    humanMatchStrategy: String(source.humanMatchStrategy || '').slice(0, 80),
    serverMatchMode: String(source.serverMatchMode || '').slice(0, 40),
    deviceClass: String(source.deviceClass || '').slice(0, 40),
    browser: String(source.browser || '').slice(0, 80),
    bestFaceAreaRatio: finiteNumber(source.bestFaceAreaRatio),
  }
}

export function normalizeOpenVinoProfileSamples(value) {
  return safeArray(value)
    .map(sanitizeEmbeddingSample)
    .filter(Boolean)
}

export function getOpenVinoShadowProfileConfig() {
  return {
    enabled: boolEnv('OPENVINO_SHADOW_ENABLED', defaultShadowEnabled()),
    maxSamples: positiveIntegerEnv('OPENVINO_PROFILE_MAX_SAMPLES', DEFAULT_MAX_SAMPLES),
    framesPerScan: positiveIntegerEnv('OPENVINO_SHADOW_FRAMES_PER_SCAN', DEFAULT_FRAMES_PER_SCAN),
    maxConcurrentJobs: positiveIntegerEnv('OPENVINO_SHADOW_MAX_CONCURRENT_JOBS', 1),
    maxHumanDistance: numberEnv('OPENVINO_SHADOW_MAX_HUMAN_DISTANCE', DEFAULT_MAX_HUMAN_DISTANCE),
    minHumanMargin: numberEnv('OPENVINO_SHADOW_MIN_HUMAN_MARGIN', DEFAULT_MIN_HUMAN_MARGIN),
    minSupport: positiveIntegerEnv('OPENVINO_SHADOW_MIN_SUPPORT', DEFAULT_MIN_SUPPORT),
    minCosineDiversity: numberEnv('OPENVINO_SHADOW_MIN_COSINE_DIVERSITY', DEFAULT_MIN_COSINE_DIVERSITY),
  }
}

export function getHumanMatchProfileStats(personMatch = {}) {
  const debug = personMatch?.debug || {}
  const bestDistance = finiteNumber(debug.bestDistance, personMatch.distance)
  const secondDistance = finiteNumber(debug.secondDistance)
  const supportCount = finiteNumber(debug.supportCount)
  const supportDescriptorCount = finiteNumber(debug.supportDescriptorCount)
  const margin = Number.isFinite(bestDistance) && Number.isFinite(secondDistance)
    ? secondDistance - bestDistance
    : null

  return {
    bestDistance,
    secondDistance,
    margin,
    supportCount,
    supportDescriptorCount,
    matchStrategy: String(debug.matchStrategy || debug.searchPhase || ''),
  }
}

export function shouldCollectOpenVinoProfileSample({ person = {}, personMatch = {}, entry = {} } = {}, config = getOpenVinoShadowProfileConfig()) {
  if (!config.enabled) return { ok: false, reason: 'shadow_disabled' }
  if (!personMatch?.ok) return { ok: false, reason: 'human_match_not_accepted' }

  const existingCount = finiteNumber(
    person.openvinoProfileSampleCount,
    person.openvinoSampleCount,
  )
  if (Number.isFinite(existingCount) && existingCount >= config.maxSamples) {
    return { ok: false, reason: 'profile_already_full' }
  }

  if (!Array.isArray(entry.scanFrames) || entry.scanFrames.length === 0) {
    return { ok: false, reason: 'missing_scan_frames' }
  }

  const stats = getHumanMatchProfileStats(personMatch)
  if (!Number.isFinite(stats.bestDistance) || stats.bestDistance > config.maxHumanDistance) {
    return { ok: false, reason: 'human_match_distance_too_weak', stats }
  }
  if (!Number.isFinite(stats.margin) || stats.margin < config.minHumanMargin) {
    return { ok: false, reason: 'human_match_margin_too_small', stats }
  }
  if (!Number.isFinite(stats.supportCount) || stats.supportCount < config.minSupport) {
    return { ok: false, reason: 'human_match_support_too_low', stats }
  }
  if (!Number.isFinite(stats.supportDescriptorCount) || stats.supportDescriptorCount < config.minSupport) {
    return { ok: false, reason: 'human_match_descriptor_support_too_low', stats }
  }

  return { ok: true, reason: 'eligible', stats }
}

function getFrameDataUrl(frame) {
  if (typeof frame === 'string') return frame
  return String(frame?.frameDataUrl || frame?.previewUrl || '').trim()
}

function isTooCloseToExisting(candidate, samples, cosineDistance, minCosineDiversity) {
  return samples.some(sample => (
    cosineDistance(sample.vector, candidate.vector) < minCosineDiversity
  ))
}

function buildProfileStatus(sampleCount, maxSamples) {
  return sampleCount >= maxSamples ? 'ready' : 'collecting'
}

async function buildOpenVinoSamplesFromScan({ entry, personMatch, config }) {
  const {
    generateOpenVinoRetailEmbedding,
    OPENVINO_RETAIL_MODEL_VERSION,
  } = await import('@/lib/biometrics/openvino-retail-embedding')

  const stats = getHumanMatchProfileStats(personMatch)
  const frames = safeArray(entry.scanFrames)
    .slice(0, Math.max(1, config.framesPerScan))
    .map(getFrameDataUrl)
    .filter(Boolean)

  const samples = []
  for (let index = 0; index < frames.length; index += 1) {
    const result = await generateOpenVinoRetailEmbedding(frames[index])
    if (!result?.ok) continue

    samples.push({
      vector: result.descriptor,
      modelVersion: result.modelVersion || OPENVINO_RETAIL_MODEL_VERSION,
      distanceMetric: result.distanceMetric || 'cosine',
      source: 'accepted_human_scan_shadow',
      capturedAt: finiteNumber(entry.timestamp) ?? Date.now(),
      frameIndex: index,
      faceScore: finiteNumber(result.face?.score),
      performanceMs: finiteNumber(result.performanceMs),
      humanBestDistance: stats.bestDistance,
      humanSecondDistance: stats.secondDistance,
      humanMargin: stats.margin,
      humanMatchStrategy: stats.matchStrategy,
      serverMatchMode: String(entry.scanDiagnostics?.serverMatchMode || ''),
      deviceClass: String(entry.scanDiagnostics?.deviceClass || ''),
      browser: String(entry.scanDiagnostics?.browser || ''),
      bestFaceAreaRatio: finiteNumber(entry.scanDiagnostics?.bestFaceAreaRatio),
    })
  }

  return samples
}

async function getExistingOpenVinoProfileSampleCount(db, personId) {
  const snapshot = await db.collection(PERSON_BIOMETRICS_COLLECTION).doc(personId).get()
  if (!snapshot.exists) return 0
  const data = snapshot.data() || {}
  const declared = finiteNumber(data.openvinoProfile?.sampleCount)
  const samples = normalizeOpenVinoProfileSamples(data.openvinoEmbeddings)
  return Math.max(samples.length, Number.isFinite(declared) ? declared : 0)
}

export async function writeOpenVinoProfileSamples(db, {
  person = {},
  personId = '',
  samples = [],
  config,
}) {
  const [
    { FieldValue },
    { cosineDistance, OPENVINO_RETAIL_MODEL_VERSION },
  ] = await Promise.all([
    import('firebase-admin/firestore'),
    import('@/lib/biometrics/openvino-retail-embedding'),
  ])
  const normalizedIncoming = normalizeOpenVinoProfileSamples(samples)
  if (normalizedIncoming.length === 0) return { ok: false, reason: 'no_valid_openvino_samples' }

  const biometricsRef = db.collection(PERSON_BIOMETRICS_COLLECTION).doc(personId)
  const personRef = db.collection('persons').doc(personId)

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(biometricsRef)
    const data = snapshot.exists ? snapshot.data() : {}
    const existing = normalizeOpenVinoProfileSamples(data?.openvinoEmbeddings)
    const accepted = [...existing]

    for (const sample of normalizedIncoming) {
      if (accepted.length >= config.maxSamples) break
      if (isTooCloseToExisting(sample, accepted, cosineDistance, config.minCosineDiversity)) continue
      accepted.push(sample)
    }

    if (accepted.length === existing.length) {
      return { ok: false, reason: 'samples_not_diverse_enough', sampleCount: existing.length }
    }

    const trimmed = accepted.slice(0, config.maxSamples)
    const status = buildProfileStatus(trimmed.length, config.maxSamples)
    const profile = {
      status,
      modelVersion: OPENVINO_RETAIL_MODEL_VERSION,
      distanceMetric: 'cosine',
      source: 'accepted_human_scan_shadow',
      sampleCount: trimmed.length,
      targetSampleCount: config.maxSamples,
      updatedAt: FieldValue.serverTimestamp(),
    }

    transaction.set(biometricsRef, {
      personId,
      employeeId: String(person.employeeId || ''),
      name: String(person.name || ''),
      officeId: String(person.officeId || ''),
      officeName: String(person.officeName || ''),
      active: person.active !== false,
      approvalStatus: String(person.approvalStatus || ''),
      openvinoProfile: profile,
      openvinoEmbeddings: trimmed,
      openvinoUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    transaction.set(personRef, {
      openvinoProfileStatus: status,
      openvinoProfileSampleCount: trimmed.length,
      openvinoProfileModelVersion: OPENVINO_RETAIL_MODEL_VERSION,
      openvinoProfileUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return { ok: true, status, sampleCount: trimmed.length }
  })
}

async function updateOpenVinoProfileFromAcceptedScan(db, options, config) {
  const eligibility = shouldCollectOpenVinoProfileSample(options, config)
  if (!eligibility.ok) return eligibility

  const personId = String(options.personId || options.person?.id || options.personMatch?.personId || '').trim()
  if (!personId) return { ok: false, reason: 'missing_person_id' }

  const existingCount = await getExistingOpenVinoProfileSampleCount(db, personId)
  if (existingCount >= config.maxSamples) {
    return { ok: false, reason: 'profile_already_full', sampleCount: existingCount }
  }

  const samples = await buildOpenVinoSamplesFromScan({
    entry: options.entry,
    personMatch: options.personMatch,
    config,
  })

  return writeOpenVinoProfileSamples(db, {
    person: options.person,
    personId,
    samples,
    config,
  })
}

export function queueOpenVinoProfileUpdate(db, options = {}) {
  const config = getOpenVinoShadowProfileConfig()
  const eligibility = shouldCollectOpenVinoProfileSample(options, config)
  if (!eligibility.ok) return eligibility
  if (activeProfileJobs >= config.maxConcurrentJobs) {
    return { ok: false, reason: 'shadow_worker_busy' }
  }

  activeProfileJobs += 1
  updateOpenVinoProfileFromAcceptedScan(db, options, config)
    .catch(error => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[OpenVINO shadow] profile update failed:', error?.message || error)
      }
    })
    .finally(() => {
      activeProfileJobs = Math.max(0, activeProfileJobs - 1)
    })

  return { ok: true, reason: 'queued' }
}
