import {
  euclideanDistance,
  normalizeDescriptor,
  normalizeStoredDescriptors,
} from '@/lib/biometrics/descriptor-utils'
import {
  DISTANCE_THRESHOLD_ENROLLMENT,
  DISTANCE_THRESHOLD_KIOSK,
} from '@/lib/config'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from '@/lib/person-approval'

export const DUPLICATE_BLOCK_APPROVALS = [PERSON_APPROVAL_APPROVED, PERSON_APPROVAL_PENDING]
export const DUPLICATE_REVIEW_DISTANCE = Math.min(DISTANCE_THRESHOLD_KIOSK, 0.84)
export const DUPLICATE_SUPPORT_WINDOW = 0.08
export const DUPLICATE_REQUIRED_QUERY_MATCHES = 2

export function collectDuplicateCandidatePersons(snapshot) {
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(person => person?.active !== false)
    .filter(person => DUPLICATE_BLOCK_APPROVALS.includes(getEffectivePersonApprovalStatus(person)))
    .filter(person => normalizeStoredDescriptors(person?.descriptors).length > 0)
}

export function buildDuplicateFaceSnapshot(person, descriptors) {
  const storedDescriptors = normalizeStoredDescriptors(person?.descriptors).map(normalizeDescriptor)
  const queryDescriptors = Array.isArray(descriptors)
    ? descriptors.map(normalizeDescriptor).filter(descriptor => descriptor.length > 0)
    : []

  if (storedDescriptors.length === 0 || queryDescriptors.length === 0) {
    return null
  }

  let bestDistance = Infinity
  let matchedQueries = 0
  let bestSupportCount = 0
  let matchedStoredIndexes = new Set()

  for (const queryDescriptor of queryDescriptors) {
    const rankedDistances = storedDescriptors
      .map((sample, index) => ({
        index,
        distance: euclideanDistance(sample, queryDescriptor),
      }))
      .filter(item => Number.isFinite(item.distance))
      .sort((left, right) => left.distance - right.distance)

    const queryBestMatch = rankedDistances[0]
    const queryBestDistance = queryBestMatch?.distance
    if (!Number.isFinite(queryBestDistance)) continue

    if (queryBestDistance < bestDistance) {
      bestDistance = queryBestDistance
    }

    const supportDistance = Math.min(DUPLICATE_REVIEW_DISTANCE, queryBestDistance + DUPLICATE_SUPPORT_WINDOW)
    const supportCount = rankedDistances.filter(item => item.distance <= supportDistance).length
    bestSupportCount = Math.max(bestSupportCount, supportCount)

    if (
      queryBestDistance <= DISTANCE_THRESHOLD_ENROLLMENT
      || queryBestDistance <= DUPLICATE_REVIEW_DISTANCE
    ) {
      matchedQueries += 1
      matchedStoredIndexes.add(queryBestMatch.index)
    }
  }

  if (!Number.isFinite(bestDistance)) {
    return null
  }

  const duplicate = bestDistance <= DISTANCE_THRESHOLD_ENROLLMENT
    || (
      matchedQueries >= DUPLICATE_REQUIRED_QUERY_MATCHES
      && (
        matchedStoredIndexes.size >= 2
        || matchedQueries >= 3
      )
    )

  return {
    bestDistance,
    matchedQueries,
    supportCount: bestSupportCount,
    matchedStoredCount: matchedStoredIndexes.size,
    duplicate,
  }
}

export function findDuplicateFaceMatch(candidates, descriptors, excludePersonId = '') {
  let bestMatch = null

  for (const person of candidates) {
    if (!person?.id || person.id === excludePersonId) continue

    const snapshot = buildDuplicateFaceSnapshot(person, descriptors)
    if (!snapshot?.duplicate) continue

    if (!bestMatch || snapshot.bestDistance < bestMatch.distance) {
      bestMatch = {
        person,
        distance: snapshot.bestDistance,
        matchedQueries: snapshot.matchedQueries,
        supportCount: snapshot.supportCount,
        matchedStoredCount: snapshot.matchedStoredCount,
      }
    }
  }

  return bestMatch
}
