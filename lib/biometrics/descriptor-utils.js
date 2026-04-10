/**
 * lib/biometrics/descriptor-utils.js
 *
 * Single source of truth for biometric descriptor operations.
 * Import from here — do NOT duplicate these functions in route handlers or data stores.
 *
 * All functions work with @vladmandic/human v3 1024-dim unit-normalized FaceNet embeddings.
 * They also work with any other descriptor length for backwards compatibility.
 */

export function euclideanDistance(left, right) {
  let total = 0
  const len = Math.min(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const diff = left[i] - right[i]
    total += diff * diff
  }
  return Math.sqrt(total)
}

/**
 * Normalizes stored descriptor formats to plain number arrays.
 * Handles both legacy flat array format and current { vector: [...] } object format.
 */
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

/**
 * Finds the closest existing person to a given descriptor.
 * Skips the person with skipEmployeeId (the one currently being enrolled/updated).
 * Returns null if no match is closer than the duplicate threshold.
 */
export function findClosestPerson(persons, skipEmployeeId, descriptor, threshold) {
  let bestMatch = null

  for (const person of persons) {
    if (skipEmployeeId && person.employeeId === skipEmployeeId) continue

    for (const sample of normalizeStoredDescriptors(person.descriptors)) {
      const distance = euclideanDistance(sample, descriptor)
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { person, distance }
      }
    }
  }

  if (!bestMatch || bestMatch.distance > threshold) return null
  return bestMatch
}
