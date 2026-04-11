import { AMBIGUOUS_MATCH_MARGIN, DISTANCE_THRESHOLD } from '@/lib/config'
import {
  matchBiometricIndexCandidates,
  queryBiometricIndexCandidates,
} from '@/lib/biometric-index'
import { euclideanDistance, getStoredVectors } from '@/lib/biometrics/descriptor-utils'

export async function findMatchFromCandidates(db, candidateOfficeIds, descriptor) {
  const indexedCandidates = await queryBiometricIndexCandidates(db, candidateOfficeIds, descriptor)

  if (indexedCandidates.length > 0) {
    const indexedMatch = await resolveMatchedPerson(
      db,
      matchBiometricIndexCandidates(indexedCandidates, descriptor, DISTANCE_THRESHOLD, AMBIGUOUS_MATCH_MARGIN),
    )
    if (indexedMatch.ok) {
      return indexedMatch
    }
  }

  return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.' }
}

export function matchPersonFromDescriptor(persons, descriptor) {
  const scored = persons
    .map(personRecord => ({
      person: personRecord,
      storedVectors: getStoredVectors(personRecord),
    }))
    .filter(candidate => candidate.storedVectors.length > 0)
    .map(candidate => ({
      person: candidate.person,
      distance: Math.min(...candidate.storedVectors.map(sample =>
        euclideanDistance(sample, descriptor),
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
    threshold: DISTANCE_THRESHOLD,
    ambiguousMargin: AMBIGUOUS_MATCH_MARGIN,
    bestName: best?.person?.name ?? '',
    secondName: second?.person?.name ?? '',
  }

  if (!best || best.distance > DISTANCE_THRESHOLD) {
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
