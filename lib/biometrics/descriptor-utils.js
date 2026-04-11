export function euclideanDistance(left, right) {
  let total = 0
  const len = Math.min(left.length, right.length)
  for (let i = 0; i < len; i++) {
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

export function normalizeDescriptor(vector) {
  const arr = Array.isArray(vector) ? vector.map(Number) : [];
  const magnitude = Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return arr.map(() => 0);
  return arr.map(v => v / magnitude);
}

export function getNormalizedDescriptors(person) {
  const rawSamples = normalizeStoredDescriptors(person.descriptors);
  return rawSamples.map(sample => normalizeDescriptor(sample));
}