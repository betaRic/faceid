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

/**
 * Check if a person's stored descriptors have sufficient inter-sample diversity.
 * Returns true if biometrics are poor quality and should be re-enrolled.
 *
 * Poor quality indicators:
 * - Too few samples (< 3)
 * - All samples too similar to each other (likely from skipFrames caching bug)
 */
export function needsBiometricReenrollment(person, minDiversity = 0.08) {
  const descriptors = normalizeStoredDescriptors(person.descriptors)
  if (descriptors.length < 2) return true
  if (descriptors.length < 3) return true

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

  // If more than half of pairs are near-identical, quality is poor
  return totalPairs > 0 && lowDiversityPairs / totalPairs > 0.5
}
