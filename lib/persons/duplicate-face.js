import {
  euclideanDistance,
  normalizeDescriptor,
  normalizeStoredDescriptors,
} from '@/lib/biometrics/descriptor-utils'
import { DISTANCE_THRESHOLD_ENROLLMENT } from '@/lib/config'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from '@/lib/person-approval'

export const DUPLICATE_STATUS_CLEAR = 'clear'
export const DUPLICATE_STATUS_REVIEW_REQUIRED = 'review_required'
export const DUPLICATE_STATUS_HARD_DUPLICATE = 'hard_duplicate'

export const DUPLICATE_BLOCK_APPROVALS = [PERSON_APPROVAL_APPROVED, PERSON_APPROVAL_PENDING]
export const DUPLICATE_HARD_DISTANCE = DISTANCE_THRESHOLD_ENROLLMENT
export const DUPLICATE_REVIEW_DISTANCE = 0.72
export const DUPLICATE_SUPPORT_WINDOW = 0.04
export const DUPLICATE_REQUIRED_QUERY_MATCHES = 2
export const DUPLICATE_MIN_HARD_STORED_SAMPLES = 3
export const DUPLICATE_HARD_MARGIN = 0.05

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getCandidateTrust(person) {
  const approvalStatus = getEffectivePersonApprovalStatus(person)
  const storedDescriptorCount = normalizeStoredDescriptors(person?.descriptors).length
  const qualityScore = toFiniteNumber(person?.biometricQualityScore)

  return {
    approvalStatus,
    storedDescriptorCount,
    qualityScore,
    hardBlockEligible: approvalStatus === PERSON_APPROVAL_APPROVED
      && storedDescriptorCount >= DUPLICATE_MIN_HARD_STORED_SAMPLES,
  }
}

export function collectDuplicateCandidatePersons(snapshot) {
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(person => person?.active !== false)
    .filter(person => DUPLICATE_BLOCK_APPROVALS.includes(getEffectivePersonApprovalStatus(person)))
    .filter(person => normalizeStoredDescriptors(person?.descriptors).length > 0)
}

function buildDuplicateDistanceSnapshot(person, descriptors) {
  const storedDescriptors = normalizeStoredDescriptors(person?.descriptors).map(normalizeDescriptor)
  const queryDescriptors = Array.isArray(descriptors)
    ? descriptors.map(normalizeDescriptor).filter(descriptor => descriptor.length > 0)
    : []

  if (storedDescriptors.length === 0 || queryDescriptors.length === 0) {
    return null
  }

  let bestDistance = Infinity
  let bestSupportCount = 0
  let hardMatchedQueries = 0
  let reviewMatchedQueries = 0
  const hardMatchedStoredIndexes = new Set()
  const reviewMatchedStoredIndexes = new Set()
  const reviewDistances = []

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

    if (queryBestDistance <= DUPLICATE_HARD_DISTANCE) {
      hardMatchedQueries += 1
      hardMatchedStoredIndexes.add(queryBestMatch.index)
    }

    if (queryBestDistance <= DUPLICATE_REVIEW_DISTANCE) {
      reviewMatchedQueries += 1
      reviewMatchedStoredIndexes.add(queryBestMatch.index)
      reviewDistances.push(queryBestDistance)
    }
  }

  if (!Number.isFinite(bestDistance)) {
    return null
  }

  const averageReviewDistance = reviewDistances.length > 0
    ? reviewDistances.reduce((sum, value) => sum + value, 0) / reviewDistances.length
    : null

  return {
    bestDistance,
    supportCount: bestSupportCount,
    hardMatchedQueries,
    hardMatchedStoredCount: hardMatchedStoredIndexes.size,
    reviewMatchedQueries,
    reviewMatchedStoredCount: reviewMatchedStoredIndexes.size,
    averageReviewDistance,
  }
}

function classifyDuplicateCandidate(person, snapshot) {
  if (!snapshot) return null

  const trust = getCandidateTrust(person)
  const hardDuplicate = trust.hardBlockEligible
    && snapshot.bestDistance <= DUPLICATE_HARD_DISTANCE
    && snapshot.hardMatchedQueries >= DUPLICATE_REQUIRED_QUERY_MATCHES
    && (
      snapshot.hardMatchedStoredCount >= 2
      || snapshot.hardMatchedQueries >= 3
    )

  const reviewRequired = snapshot.bestDistance <= DUPLICATE_REVIEW_DISTANCE
    && snapshot.reviewMatchedQueries >= DUPLICATE_REQUIRED_QUERY_MATCHES
    && (
      snapshot.reviewMatchedStoredCount >= 2
      || snapshot.reviewMatchedQueries >= 3
      || snapshot.bestDistance <= DUPLICATE_HARD_DISTANCE
    )

  const status = hardDuplicate
    ? DUPLICATE_STATUS_HARD_DUPLICATE
    : reviewRequired
      ? DUPLICATE_STATUS_REVIEW_REQUIRED
      : DUPLICATE_STATUS_CLEAR

  return {
    person,
    approvalStatus: trust.approvalStatus,
    storedDescriptorCount: trust.storedDescriptorCount,
    qualityScore: trust.qualityScore,
    hardBlockEligible: trust.hardBlockEligible,
    ...snapshot,
    status,
    duplicate: status === DUPLICATE_STATUS_HARD_DUPLICATE,
    reviewRequired: status === DUPLICATE_STATUS_REVIEW_REQUIRED,
    matchedQueries: snapshot.reviewMatchedQueries,
    matchedStoredCount: snapshot.reviewMatchedStoredCount,
  }
}

export function buildDuplicateFaceSnapshot(person, descriptors) {
  return classifyDuplicateCandidate(person, buildDuplicateDistanceSnapshot(person, descriptors))
}

export function evaluateDuplicateFaceCandidates(candidates, descriptors, excludePersonId = '') {
  const rankedCandidates = []

  for (const person of candidates) {
    if (!person?.id || person.id === excludePersonId) continue

    const snapshot = buildDuplicateFaceSnapshot(person, descriptors)
    if (!snapshot || snapshot.status === DUPLICATE_STATUS_CLEAR) continue
    rankedCandidates.push(snapshot)
  }

  rankedCandidates.sort((left, right) => left.bestDistance - right.bestDistance)

  const bestMatch = rankedCandidates[0] || null
  if (!bestMatch) return null

  const secondMatch = rankedCandidates[1] || null
  const marginToNext = secondMatch ? secondMatch.bestDistance - bestMatch.bestDistance : null

  let status = bestMatch.status
  let reasonCode = status === DUPLICATE_STATUS_HARD_DUPLICATE
    ? 'duplicate_hard_match'
    : 'duplicate_review_match'

  if (
    status === DUPLICATE_STATUS_HARD_DUPLICATE
    && secondMatch
    && Number.isFinite(marginToNext)
    && marginToNext < DUPLICATE_HARD_MARGIN
  ) {
    status = DUPLICATE_STATUS_REVIEW_REQUIRED
    reasonCode = 'duplicate_review_ambiguous_nearest_neighbor'
  }

  return {
    status,
    reasonCode,
    duplicate: status === DUPLICATE_STATUS_HARD_DUPLICATE,
    reviewRequired: status === DUPLICATE_STATUS_REVIEW_REQUIRED,
    person: bestMatch.person,
    candidate: bestMatch.person,
    distance: bestMatch.bestDistance,
    matchedQueries: bestMatch.matchedQueries,
    matchedStoredCount: bestMatch.matchedStoredCount,
    supportCount: bestMatch.supportCount,
    approvalStatus: bestMatch.approvalStatus,
    storedDescriptorCount: bestMatch.storedDescriptorCount,
    qualityScore: bestMatch.qualityScore,
    secondPerson: secondMatch?.person || null,
    secondDistance: secondMatch?.bestDistance ?? null,
    marginToNext,
    candidates: rankedCandidates.slice(0, 5),
  }
}

export function findDuplicateFaceMatch(candidates, descriptors, excludePersonId = '') {
  return evaluateDuplicateFaceCandidates(candidates, descriptors, excludePersonId)
}
