export function euclideanDistance(left, right) {
  let total = 0
  const len = Math.min(left.length, right.length)
  for (let i = 0; i < len; i += 1) {
    const diff = left[i] - right[i]
    total += diff * diff
  }
  return Math.sqrt(total)
}

export function normalizeStoredDescriptors(value) {
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

export function findClosestPerson(persons, skipEmployeeId, descriptor, threshold) {
  let bestMatch = null

  if (!Array.isArray(persons) || persons.length === 0) return null
  
  const normalizedDescriptor = normalizeDescriptor(descriptor)

  for (const person of persons) {
    if (skipEmployeeId && person.employeeId === skipEmployeeId) continue

    for (const sample of normalizeStoredDescriptors(person.descriptors)) {
      const normalizedSample = normalizeDescriptor(sample)
      const distance = euclideanDistance(normalizedSample, normalizedDescriptor)
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { person, distance }
      }
    }
  }

  if (!bestMatch || bestMatch.distance > threshold) return null
  return bestMatch
}

export function normalizeDescriptor(vector) {
  const arr = Array.isArray(vector) ? vector.map(Number) : []
  const magnitude = Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0))
  if (magnitude === 0) return arr.map(() => 0)
  return arr.map(v => v / magnitude)
}

export function getStoredVectors(person) {
  return normalizeStoredDescriptors(person.descriptors)
}

const MODERN_CAPTURE_PROFILE = 'guided_4_phase'
const MIN_REENROLLMENT_DESCRIPTOR_COUNT = 4
const REQUIRED_REENROLLMENT_PHASE = 'chin_down'

function normalizeCaptureMetadata(person) {
  return person?.captureMetadata && typeof person.captureMetadata === 'object'
    ? person.captureMetadata
    : {}
}

function normalizePhaseList(phases) {
  return Array.isArray(phases)
    ? phases.map(value => String(value || '').trim().toLowerCase()).filter(Boolean)
    : []
}

function buildReenrollmentDecision(needed, reasonCode = null, message = '') {
  return {
    needed: Boolean(needed),
    reasonCode: needed ? String(reasonCode || 'manual_review') : null,
    message: needed ? String(message || '') : '',
  }
}

export function getBiometricReenrollmentAssessment(person, minDiversity = 0.08) {
  if (person?.needsReenrollment === true) {
    return buildReenrollmentDecision(
      true,
      'manual_review',
      'Biometric refresh is still required for this employee profile.',
    )
  }

  const descriptors = normalizeStoredDescriptors(person?.descriptors)
  if (descriptors.length < MIN_REENROLLMENT_DESCRIPTOR_COUNT) {
    return buildReenrollmentDecision(
      true,
      'insufficient_samples',
      'Stored face data does not have enough strong samples for reliable cross-device matching.',
    )
  }

  const metadata = normalizeCaptureMetadata(person)
  const captureProfile = String(metadata.captureProfile || '').trim().toLowerCase()
  const phasesCompleted = Number.isFinite(metadata.phasesCompleted) ? Number(metadata.phasesCompleted) : 0
  const phasesCaptured = normalizePhaseList(metadata.phasesCaptured)

  if (!captureProfile || phasesCompleted === 0) {
    return buildReenrollmentDecision(
      true,
      'missing_capture_metadata',
      'This profile was enrolled before the current guided capture standard and should be refreshed.',
    )
  }

  if (captureProfile !== MODERN_CAPTURE_PROFILE || phasesCompleted < 4) {
    return buildReenrollmentDecision(
      true,
      'legacy_capture_profile',
      'Stored face data came from an older capture flow and should be refreshed using the current 4-pose capture.',
    )
  }

  if (!phasesCaptured.includes(REQUIRED_REENROLLMENT_PHASE)) {
    return buildReenrollmentDecision(
      true,
      'missing_phone_pose',
      'Stored face data is missing the chin-down phone posture that improves mobile recognition.',
    )
  }

  if (metadata.genuinelyDiverse === false) {
    return buildReenrollmentDecision(
      true,
      'low_pose_diversity',
      'Stored face samples are too similar to each other and should be refreshed with cleaner pose diversity.',
    )
  }

  const normalized = descriptors.map(normalizeDescriptor)
  let totalPairs = 0
  let lowDiversityPairs = 0

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      totalPairs++
      if (euclideanDistance(normalized[i], normalized[j]) < minDiversity) {
        lowDiversityPairs++
      }
    }
  }

  if (totalPairs > 0 && lowDiversityPairs / totalPairs > 0.5) {
    return buildReenrollmentDecision(
      true,
      'low_descriptor_diversity',
      'Stored face descriptors are too similar to each other and should be refreshed.',
    )
  }

  return buildReenrollmentDecision(false, null, '')
}

export function needsBiometricReenrollment(person, minDiversity = 0.08) {
  return getBiometricReenrollmentAssessment(person, minDiversity).needed
}
