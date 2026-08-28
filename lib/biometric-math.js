import 'server-only'

import { euclideanDistance, normalizeDescriptor } from './biometrics/descriptor-utils'

const BUCKET_DIMENSIONS_A = [0, 64, 128, 256, 384, 512, 576, 640, 704, 768, 832, 896]
const BUCKET_DIMENSIONS_B = [32, 96, 160, 288, 352, 416, 480, 544, 608, 672, 736, 800]
const MULTI_DESCRIPTOR_SUPPORT_WINDOW = 0.05
const MULTI_DESCRIPTOR_REQUIRED_SUPPORT = 2
const MULTI_DESCRIPTOR_STRONG_PARTIAL_DISTANCE = 0.60
const MULTI_DESCRIPTOR_STRONG_PARTIAL_MARGIN = 0.18
const MATCH_DECISIVE_MARGIN = 0.05
const MIN_EFFECTIVE_AMBIGUOUS_MARGIN = 0.04
const UNCERTAIN_DISTANCE_AMBIGUOUS_MARGIN = 0.06
const UNCERTAIN_MATCH_DISTANCE = 0.62

function descriptorBucket(normalizedDescriptor, dimensions) {
  if (!Array.isArray(normalizedDescriptor) || normalizedDescriptor.length === 0) return '0'.repeat(dimensions.length)
  return dimensions
    .map(i => (Number(normalizedDescriptor[i] || 0) >= 0.05 ? '1' : '0'))
    .join('')
}
export function buildDescriptorBuckets(descriptor) {
  const normalized = normalizeDescriptor(descriptor)
  return {
    normalizedDescriptor: normalized,
    bucketA: descriptorBucket(normalized, BUCKET_DIMENSIONS_A),
    bucketB: descriptorBucket(normalized, BUCKET_DIMENSIONS_B),
  }
}

function buildRankedCandidatesByPerson(candidateSamples, descriptor) {
  const queryDescriptor = normalizeDescriptor(descriptor)
  const perPerson = new Map()

  const debugSample = candidateSamples[0]
  let debugInfo = null
  if (debugSample?.normalizedDescriptor) {
    const debugStored = debugSample.normalizedDescriptor.map(Number)
    const debugQuery = queryDescriptor
    const firstDist = euclideanDistance(debugStored, debugQuery)
    const storedMag = Math.sqrt(debugStored.reduce((s, v) => s + v * v, 0))
    const queryMag = Math.sqrt(debugQuery.reduce((s, v) => s + v * v, 0))
    debugInfo = {
      storedDescriptorSample: debugStored.slice(0, 5),
      queryDescriptorSample: queryDescriptor.slice(0, 5),
      storedMagnitude: storedMag,
      queryMagnitude: queryMag,
      firstDistanceBeforeNorm: firstDist,
    }
  }

  for (const sample of candidateSamples) {
    const sampleDescriptor = Array.isArray(sample.normalizedDescriptor)
      ? sample.normalizedDescriptor.map(Number)
      : []
    if (sampleDescriptor.length !== queryDescriptor.length) continue

    const distance = euclideanDistance(sampleDescriptor, queryDescriptor)
    const current = perPerson.get(sample.personId)

    if (!current || distance < current.distance) {
      perPerson.set(sample.personId, {
        personId: sample.personId,
        employeeId: String(sample.employeeId || ''),
        name: String(sample.name || ''),
        officeId: String(sample.officeId || ''),
        officeName: String(sample.officeName || ''),
        distance,
      })
    }
  }

  const ranked = Array.from(perPerson.values()).sort((a, b) => a.distance - b.distance)
  return {
    ranked,
    debugInfo,
  }
}

function buildMultiDescriptorRankedCandidates(candidateSamples, descriptors, distanceThreshold) {
  const normalizedDescriptors = Array.isArray(descriptors)
    ? descriptors
      .map(normalizeDescriptor)
      .filter(descriptor => Array.isArray(descriptor) && descriptor.length > 0)
    : []
  const aggregates = new Map()

  for (const descriptor of normalizedDescriptors) {
    const { ranked } = buildRankedCandidatesByPerson(candidateSamples, descriptor)
    const queryWinner = ranked[0] || null
    const queryRunnerUp = ranked[1] || null
    const queryMargin = queryWinner && queryRunnerUp
      ? queryRunnerUp.distance - queryWinner.distance
      : 1

    for (const person of ranked) {
      let aggregate = aggregates.get(person.personId)
      if (!aggregate) {
        aggregate = {
          personId: person.personId,
          employeeId: person.employeeId,
          name: person.name,
          officeId: person.officeId,
          officeName: person.officeName,
          queryDistances: [],
          queryWinCount: 0,
          decisiveQueryWinCount: 0,
        }
        aggregates.set(person.personId, aggregate)
      }

      aggregate.queryDistances.push(person.distance)
      if (queryWinner?.personId === person.personId) {
        aggregate.queryWinCount += 1
        if (queryMargin >= MULTI_DESCRIPTOR_SUPPORT_WINDOW) {
          aggregate.decisiveQueryWinCount += 1
        }
      }
    }
  }

  return Array.from(aggregates.values())
    .map(person => {
      const queryDistances = person.queryDistances
        .filter(Number.isFinite)
        .sort((left, right) => left - right)
      const bestDistance = queryDistances[0] ?? null
      const supportDistance = Number.isFinite(bestDistance)
        ? Math.min(Number(distanceThreshold || 0), Number(bestDistance) + MULTI_DESCRIPTOR_SUPPORT_WINDOW)
        : null
      const supportCount = Number.isFinite(supportDistance)
        ? queryDistances.filter(distance => distance <= supportDistance).length
        : 0

      return {
        ...person,
        distance: bestDistance,
        supportCount,
        supportDistance,
        queryDescriptorCount: queryDistances.length,
        requiresSupport: true,
      }
    })
    .filter(person => Number.isFinite(person.distance))
    .sort((left, right) => left.distance - right.distance)
}

function getEffectiveAmbiguousMargin(bestDistance, ambiguousMargin) {
  const configured = Number(ambiguousMargin)
  const configuredMargin = Number.isFinite(configured) ? configured : 0
  const distanceFloor = Number(bestDistance) >= UNCERTAIN_MATCH_DISTANCE
    ? UNCERTAIN_DISTANCE_AMBIGUOUS_MARGIN
    : MIN_EFFECTIVE_AMBIGUOUS_MARGIN
  return Math.max(configuredMargin, distanceFloor)
}

export function matchBiometricIndexMultiDescriptor(candidateSamples, descriptors, distanceThreshold, ambiguousMargin) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No descriptors provided.' }
  }

  const ranked = buildMultiDescriptorRankedCandidates(candidateSamples, descriptors, distanceThreshold)
  const bestRaw = ranked[0] || null
  const viableRanked = ranked.filter(candidate => (
    candidate.supportCount >= MULTI_DESCRIPTOR_REQUIRED_SUPPORT
    && candidate.queryWinCount >= MULTI_DESCRIPTOR_REQUIRED_SUPPORT
  ))
  const bestViable = viableRanked[0] || null
  const rawChallenger = bestRaw
    ? ranked.find(candidate => candidate.personId !== bestRaw.personId) || null
    : null
  const rawMargin = bestRaw && rawChallenger
    ? rawChallenger.distance - bestRaw.distance
    : 1
  const strongPartial = !bestViable
    && bestRaw
    && bestRaw.queryDescriptorCount >= 2
    && bestRaw.supportCount >= 1
    && bestRaw.queryWinCount >= 1
    && bestRaw.decisiveQueryWinCount >= 1
    && bestRaw.distance <= MULTI_DESCRIPTOR_STRONG_PARTIAL_DISTANCE
    && rawMargin >= MULTI_DESCRIPTOR_STRONG_PARTIAL_MARGIN
  const best = bestViable || (strongPartial ? bestRaw : null)
  const secondViable = viableRanked.find(candidate => candidate.personId !== best?.personId) || null
  const closestChallenger = best
    ? ranked.find(candidate => candidate.personId !== best.personId) || null
    : (ranked[1] || null)
  const requiredAmbiguousMargin = getEffectiveAmbiguousMargin(best?.distance ?? bestRaw?.distance, ambiguousMargin)

  const debug = {
    source: 'biometric_index',
    candidateCount: ranked.length,
    bestDistance: best?.distance ?? bestRaw?.distance ?? null,
    secondDistance: closestChallenger?.distance ?? null,
    secondViableDistance: secondViable?.distance ?? null,
    threshold: distanceThreshold,
    ambiguousMargin: requiredAmbiguousMargin,
    configuredAmbiguousMargin: Number.isFinite(Number(ambiguousMargin)) ? Number(ambiguousMargin) : null,
    supportDescriptorCount: best?.queryDescriptorCount ?? bestRaw?.queryDescriptorCount ?? 0,
    supportCount: best?.supportCount ?? bestRaw?.supportCount ?? 0,
    supportDistance: best?.supportDistance ?? bestRaw?.supportDistance ?? null,
    queryWinCount: best?.queryWinCount ?? bestRaw?.queryWinCount ?? 0,
    decisiveQueryWinCount: best?.decisiveQueryWinCount ?? bestRaw?.decisiveQueryWinCount ?? 0,
    supportGate: best
      ? (strongPartial ? 'strong_partial_query_support' : '')
      : bestRaw?.supportCount < MULTI_DESCRIPTOR_REQUIRED_SUPPORT
        ? 'weak_query_descriptor_support'
        : bestRaw?.queryWinCount < MULTI_DESCRIPTOR_REQUIRED_SUPPORT
          ? 'weak_query_identity_consensus'
        : '',
  }

  if (!best || best.distance > distanceThreshold - MATCH_DECISIVE_MARGIN) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.', debug }
  }

  // Ambiguity check runs unconditionally — see the note in matchBiometricIndexCandidates
  // for the rationale behind removing the prior `best.distance >= 0.60` carve-out.
  const margin = closestChallenger ? closestChallenger.distance - best.distance : 1
  if (closestChallenger && margin < requiredAmbiguousMargin) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
      message: 'Face match is ambiguous between multiple employees.',
      debug: {
        ...debug,
        supportGate: 'raw_competitor_too_close',
      },
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - (best.distance / distanceThreshold)))
  return {
    ok: true,
    personId: best.personId,
    distance: best.distance,
    confidence,
    matchedSample: best,
    debug,
  }
}

export function matchBiometricIndexCandidates(candidateSamples, descriptor, distanceThreshold, ambiguousMargin) {
  const { ranked, debugInfo } = buildRankedCandidatesByPerson(candidateSamples, descriptor)
  const best = ranked[0]
  const second = ranked[1] || null
  const requiredAmbiguousMargin = getEffectiveAmbiguousMargin(best?.distance, ambiguousMargin)

  const debug = {
    source: 'biometric_index',
    candidateCount: ranked.length,
    bestDistance: best?.distance ?? null,
    secondDistance: second?.distance ?? null,
    threshold: distanceThreshold,
    ambiguousMargin: requiredAmbiguousMargin,
    configuredAmbiguousMargin: Number.isFinite(Number(ambiguousMargin)) ? Number(ambiguousMargin) : null,
    ...debugInfo,
  }

  if (!best || best.distance > distanceThreshold - MATCH_DECISIVE_MARGIN) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.', debug }
  }

  // Ambiguity check runs unconditionally. If two people score close to the query,
  // we reject — "fail closed" is the right default for a biometric identity decision.
  // The old code skipped this when best.distance < 0.60 to work around corrupted
  // enrollments from an earlier capture bug; that carve-out caused false accepts in
  // exactly the zone where ambiguity is most dangerous. Affected enrollments should
  // be re-enrolled, not accommodated.
  const margin = second ? second.distance - best.distance : 1
  if (second && margin < requiredAmbiguousMargin) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
      message: 'Face match is ambiguous between multiple employees.',
      debug,
    }
  }

  // Map distance to a 0–1 confidence where 0 = threshold, 1 = perfect match.
  // L2 on unit vectors: 0 = identical, ~1.41 = opposite. Typical same-person: 0.3–0.7.
  const confidence = Math.max(0, Math.min(1, 1 - (best.distance / distanceThreshold)))

  return {
    ok: true,
    personId: best.personId,
    distance: best.distance,
    confidence,
    matchedSample: best,
    debug,
  }
}
