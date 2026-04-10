/**
 * lib/biometrics/descriptor-utils.js
 * Canonical biometric utility functions.
 * Single source of truth — import from here everywhere.
 * Do not duplicate these in route handlers or scripts.
 */

/**
 * Euclidean distance between two 128-float descriptor vectors.
 * Lower = more similar. Threshold 0.6 = same person (standard face-api.js value).
 */
export function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/**
 * L2-normalize a descriptor vector.
 * Required before bucketing and LSH comparisons.
 */
export function normalizeDescriptor(descriptor) {
  const vector = Array.isArray(descriptor) ? descriptor.map(Number) : []
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  if (!magnitude) return vector.map(() => 0)
  return vector.map(v => v / magnitude)
}

/**
 * Normalize stored descriptors from Firestore.
 * Handles both flat arrays and { vector } objects from older schema.
 */
export function normalizeStoredDescriptors(value) {
  const arr = Array.isArray(value) ? value : []
  return arr
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
 * LSH bucket string for candidate narrowing in biometric_index.
 */
export function descriptorBucket(normalizedDescriptor, dimensions) {
  return dimensions
    .map(i => (Number(normalizedDescriptor[i] || 0) >= 0 ? '1' : '0'))
    .join('')
}

// Stable bucket dimensions — do not change without re-running backfill:biometric-index
export const BUCKET_DIMENSIONS_A = [0, 7, 15, 23, 31, 39, 47, 55, 63, 71, 79, 87]
export const BUCKET_DIMENSIONS_B = [3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91]
