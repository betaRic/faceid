import { getActiveThresholds } from '@/lib/thresholds'
import { matchBiometricIndexCandidates, queryBiometricIndexCandidates } from '@/lib/biometric-index'

/**
 * Global biometric match across all provided office IDs.
 * Pass ALL office IDs from the offices collection — location check happens after identification.
 * Thresholds are read from Firestore (system_config/thresholds) with 30s in-process cache.
 */
export async function findGlobalMatch(db, allOfficeIds, descriptor) {
  const debug = { source: 'biometric_index', officeIdsCount: allOfficeIds?.length || 0, officeIds: allOfficeIds }

  const candidates = await queryBiometricIndexCandidates(db, allOfficeIds, descriptor)
  debug.candidatesFound = candidates.length

  if (candidates.length === 0) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.', debug }
  }

  const thresholds = await getActiveThresholds(db)
  const matchResult = matchBiometricIndexCandidates(
    candidates,
    descriptor,
    thresholds.kioskMatchDistance,
    thresholds.ambiguousMargin,
  )
  if (!matchResult.ok) return { ...matchResult, debug: { ...matchResult.debug, ...debug } }

  const resolved = await resolveMatchedPerson(db, matchResult)
  return { ...resolved, debug: { ...resolved.debug, ...debug } }
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
