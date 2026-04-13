import { AMBIGUOUS_MATCH_MARGIN, DISTANCE_THRESHOLD_KIOSK, DISTANCE_THRESHOLD_ENROLLMENT } from '@/lib/config'
import {
  matchBiometricIndexCandidates,
  queryBiometricIndexCandidates,
} from '@/lib/biometric-index'
import { euclideanDistance, getStoredVectors, normalizeDescriptor } from '@/lib/biometrics/descriptor-utils'

/**
 * Global biometric match across all provided office IDs.
 * Pass ALL office IDs from the offices collection — location check happens after identification.
 */
export async function findGlobalMatch(db, allOfficeIds, descriptor) {
  const candidates = await queryBiometricIndexCandidates(db, allOfficeIds, descriptor)

  if (candidates.length === 0) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.' }
  }

  const matchResult = matchBiometricIndexCandidates(candidates, descriptor, DISTANCE_THRESHOLD_KIOSK, AMBIGUOUS_MATCH_MARGIN)
  if (!matchResult.ok) return matchResult

  return resolveMatchedPerson(db, matchResult)
}

export function matchPersonFromDescriptor(persons, descriptor, isKioskVerification = true) {
  const threshold = isKioskVerification ? DISTANCE_THRESHOLD_KIOSK : DISTANCE_THRESHOLD_ENROLLMENT
  const normalizedDescriptor = normalizeDescriptor(descriptor)
  const scored = persons
    .map(personRecord => ({
      person: personRecord,
      storedVectors: getStoredVectors(personRecord),
    }))
    .filter(candidate => candidate.storedVectors.length > 0)
    .map(candidate => ({
      person: candidate.person,
      distance: Math.min(...candidate.storedVectors.map(sample =>
        euclideanDistance(normalizeDescriptor(sample), normalizedDescriptor),
      )),
    }))
    .sort((left, right) => left.distance - right.distance)

  const best = scored[0]
  const second = scored[1] || null
  const debug = {
    source: 'office_fallback',
    candidateCount: scored.length,
    bestDistance: best?.distance ?? null,
    secondDistance: second?.distance ?? null,
    threshold: threshold,
    ambiguousMargin: AMBIGUOUS_MATCH_MARGIN,
    bestName: best?.person?.name ?? '',
    secondName: second?.person?.name ?? '',
  }

  if (!best || best.distance > threshold) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.', debug }
  }

  const margin = second ? second.distance - best.distance : 1
  if (second && margin < AMBIGUOUS_MATCH_MARGIN) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
      message: `Face match is too close between ${best.person?.name} and ${second.person?.name}.`,
      debug,
    }
  }

  return {
    ok: true,
    person: best.person,
    distance: best.distance,
    confidence: 1 - best.distance,
    debug,
  }
}

export async function resolveMatchedPerson(db, matchResult) {
  if (!matchResult.ok) return matchResult
  if (matchResult.person) return matchResult

  const record = await db.collection('persons').doc(matchResult.personId).get()
  if (!record.exists) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'Matched employee record no longer exists.' }
  }

  return {
    ok: true,
    person: { id: record.id, ...record.data() },
    distance: matchResult.distance,
    confidence: matchResult.confidence,
    debug: matchResult.debug || null,
  }
}