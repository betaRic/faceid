import {
  euclideanDistance,
  normalizeDescriptor,
  normalizeStoredDescriptors,
} from '@/lib/biometrics/descriptor-utils'

// Require corroboration ("support") from at least one other stored descriptor
// for almost any match. Strong sub-0.55 matches are rare enough that we trust
// them on a single sample, but anything above is gated on multi-sample agreement.
export const MATCH_SUPPORT_MIN_DESCRIPTOR_COUNT = 2
export const MATCH_SUPPORT_UNCERTAIN_DISTANCE = 0.55
export const MATCH_SUPPORT_WINDOW = 0.10
export const MATCH_SUPPORT_SECONDARY_GAP = 0.06

export function buildMatchSupportSnapshot(person, queryDescriptor, distanceThreshold) {
  const descriptors = normalizeStoredDescriptors(person?.descriptors)
  const normalizedQuery = normalizeDescriptor(queryDescriptor)
  const distances = descriptors
    .map(sample => euclideanDistance(normalizeDescriptor(sample), normalizedQuery))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)

  const bestDistance = distances[0] ?? null
  const secondBestDistance = distances[1] ?? null
  const supportDistance = Number.isFinite(bestDistance)
    ? Math.min(Number(distanceThreshold || 0), Number(bestDistance) + MATCH_SUPPORT_WINDOW)
    : null
  const supportCount = Number.isFinite(supportDistance)
    ? distances.filter(distance => distance <= supportDistance).length
    : 0
  const requiresStrongSupport = descriptors.length >= MATCH_SUPPORT_MIN_DESCRIPTOR_COUNT
    && Number.isFinite(bestDistance)
    && Number(bestDistance) >= MATCH_SUPPORT_UNCERTAIN_DISTANCE
  const weakSingleSample = requiresStrongSupport
    && supportCount < 2
    && (
      !Number.isFinite(secondBestDistance)
      || (Number(secondBestDistance) - Number(bestDistance)) > MATCH_SUPPORT_SECONDARY_GAP
    )

  return {
    descriptorCount: descriptors.length,
    bestDistance,
    secondBestDistance,
    supportDistance,
    supportCount,
    requiresStrongSupport,
    weakSingleSample,
  }
}
