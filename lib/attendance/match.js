import { getActiveThresholds } from '@/lib/thresholds'
import {
  matchBiometricIndexCandidates,
  matchBiometricIndexMultiDescriptor,
  queryBiometricIndexCandidates,
  queryBiometricIndexCandidatesFull,
} from '@/lib/biometric-index'
import { isOfficeWfhDay } from '@/lib/offices'
import { buildMatchSupportSnapshot } from './match-policy'

function uniqueOfficeIds(officeIds) {
  return Array.from(new Set((Array.isArray(officeIds) ? officeIds : []).filter(Boolean)))
}

function buildOfficeSearchPhases(allOffices, entry, options = {}) {
  const offices = Array.isArray(allOffices) ? allOffices : []
  const allOfficeIds = uniqueOfficeIds(offices.map(office => office?.id))
  const geofenceContext = options?.geofenceContext && typeof options.geofenceContext === 'object'
    ? options.geofenceContext
    : {}
  const now = new Date(Number(entry?.timestamp || Date.now()))
  const insideOfficeIds = uniqueOfficeIds(geofenceContext.insideOfficeIds)
  const wfhOfficeIds = geofenceContext.likelyWfh
    ? uniqueOfficeIds(
        offices
          .filter(office => isOfficeWfhDay(office, now))
          .map(office => office?.id),
      )
    : []

  const phases = []
  const used = new Set()

  if (insideOfficeIds.length > 0) {
    insideOfficeIds.forEach(id => used.add(id))
    phases.push({ key: 'inside_geofence', officeIds: insideOfficeIds })
  }

  if (wfhOfficeIds.length > 0) {
    const officeIds = wfhOfficeIds.filter(id => !used.has(id))
    if (officeIds.length > 0) {
      officeIds.forEach(id => used.add(id))
      phases.push({ key: 'wfh_priority', officeIds })
    }
  }

  if (allOfficeIds.length > 0) {
    phases.push({
      key: phases.length > 0 ? 'global_fallback' : 'global',
      officeIds: allOfficeIds,
    })
  }

  return phases.length > 0 ? phases : [{ key: 'global', officeIds: allOfficeIds }]
}

function runMatch(candidates, descriptor, descriptors, thresholds) {
  if (Array.isArray(descriptors) && descriptors.length > 0) {
    return matchBiometricIndexMultiDescriptor(
      candidates,
      descriptors,
      thresholds.kioskMatchDistance,
      thresholds.ambiguousMargin,
    )
  }
  return matchBiometricIndexCandidates(
    candidates,
    descriptor,
    thresholds.kioskMatchDistance,
    thresholds.ambiguousMargin,
  )
}

function shouldVerifyBucketedMatch(matchResult) {
  if (!matchResult?.ok) return false
  const debug = matchResult.debug || {}
  const bestDistance = Number(debug.bestDistance)
  const secondDistance = Number(debug.secondDistance)
  const candidateCount = Number(debug.candidateCount)
  const supportCount = Number(debug.supportCount)
  const queryWinCount = Number(debug.queryWinCount)
  const margin = Number.isFinite(bestDistance) && Number.isFinite(secondDistance)
    ? secondDistance - bestDistance
    : null

  if (!Number.isFinite(candidateCount) || candidateCount < 3) return true
  if (!Number.isFinite(secondDistance)) return true
  if (Number.isFinite(bestDistance) && bestDistance >= 0.60) return true
  if (Number.isFinite(margin) && margin < Math.max(0.06, Number(debug.ambiguousMargin || 0) * 3)) return true
  if (Number.isFinite(supportCount) && supportCount < 3) return true
  if (Number.isFinite(queryWinCount) && queryWinCount < 3) return true

  return false
}

async function runMatchForOfficeIds(db, officeIds, descriptor, thresholds, queryDescriptor = null, descriptors = null) {
  const debug = {
    source: 'biometric_index',
    officeIdsCount: officeIds?.length || 0,
    officeIds,
    multiDescriptor: Array.isArray(descriptors) && descriptors.length > 0,
  }

  const bucketedCandidates = await queryBiometricIndexCandidates(db, officeIds, descriptor)
  debug.bucketedCandidatesFound = bucketedCandidates.length

  let matchResult = bucketedCandidates.length > 0
    ? runMatch(bucketedCandidates, descriptor, descriptors, thresholds)
    : {
      ok: false,
      decisionCode: 'blocked_no_reliable_match',
      message: 'No reliable face match was found.',
      debug: null,
    }

  let matchStrategy = 'bucketed'

  if (matchResult.ok && shouldVerifyBucketedMatch(matchResult)) {
    const fullCandidates = await queryBiometricIndexCandidatesFull(db, officeIds, descriptor)
    debug.fullCandidatesFound = fullCandidates.length

    if (fullCandidates.length > bucketedCandidates.length) {
      const fullMatchResult = runMatch(fullCandidates, descriptor, descriptors, thresholds)
      matchStrategy = 'bucketed_full_verified'

      if (!fullMatchResult.ok) {
        return {
          ...fullMatchResult,
          debug: {
            ...(fullMatchResult.debug || {}),
            ...debug,
            bucketedPersonId: matchResult.personId || '',
            bucketedBestDistance: matchResult.debug?.bestDistance ?? null,
            matchStrategy,
          },
        }
      }

      if (fullMatchResult.personId !== matchResult.personId) {
        return {
          ok: false,
          decisionCode: 'blocked_ambiguous_match',
          message: 'Face match is ambiguous between multiple employees.',
          debug: {
            ...(fullMatchResult.debug || {}),
            ...debug,
            bucketedPersonId: matchResult.personId || '',
            bucketedBestDistance: matchResult.debug?.bestDistance ?? null,
            fullPersonId: fullMatchResult.personId || '',
            fullBestDistance: fullMatchResult.debug?.bestDistance ?? null,
            matchStrategy,
            supportGate: 'bucketed_full_disagreement',
          },
        }
      }

      matchResult = fullMatchResult
    }
  }

  if (!matchResult.ok) {
    const fullCandidates = await queryBiometricIndexCandidatesFull(db, officeIds, descriptor)
    debug.fullCandidatesFound = fullCandidates.length

    if (fullCandidates.length === 0) {
      return {
        ok: false,
        decisionCode: 'blocked_no_reliable_match',
        message: 'No reliable face match was found.',
        debug,
      }
    }

    matchResult = runMatch(fullCandidates, descriptor, descriptors, thresholds)
    matchStrategy = 'full_fallback'
    if (!matchResult.ok) {
      return {
        ...matchResult,
        debug: {
          ...matchResult.debug,
          ...debug,
          matchStrategy,
        },
      }
    }
  }

  const resolved = await resolveMatchedPerson(db, matchResult, queryDescriptor)
  return {
    ...resolved,
    debug: {
      ...(resolved.debug || {}),
      ...debug,
      matchStrategy,
    },
  }
}

async function runFullMatchForOfficeIds(db, officeIds, descriptor, thresholds, queryDescriptor = null, descriptors = null) {
  const debug = {
    source: 'biometric_index',
    officeIdsCount: officeIds?.length || 0,
    officeIds,
    multiDescriptor: Array.isArray(descriptors) && descriptors.length > 0,
    matchStrategy: 'global_full_competition',
  }
  const fullCandidates = await queryBiometricIndexCandidatesFull(db, officeIds, descriptor)
  debug.fullCandidatesFound = fullCandidates.length

  if (fullCandidates.length === 0) {
    return {
      ok: false,
      decisionCode: 'blocked_no_reliable_match',
      message: 'No reliable face match was found.',
      debug,
    }
  }

  const matchResult = runMatch(fullCandidates, descriptor, descriptors, thresholds)
  if (!matchResult.ok) {
    return {
      ...matchResult,
      debug: {
        ...(matchResult.debug || {}),
        ...debug,
      },
    }
  }

  const resolved = await resolveMatchedPerson(db, matchResult, queryDescriptor)
  return {
    ...resolved,
    debug: {
      ...(resolved.debug || {}),
      ...debug,
    },
  }
}

function getResolvedPersonId(matchResult) {
  return String(matchResult?.person?.id || matchResult?.personId || '').trim()
}

/**
 * Global biometric match across all provided office IDs.
 * Pass ALL office IDs from the offices collection — location check happens after identification.
 * Thresholds are read from Firestore (system_config/thresholds) with 30s in-process cache.
 */
export async function findGlobalMatch(db, allOffices, descriptor, options = {}) {
  const thresholds = await getActiveThresholds(db)
  const allOfficeIds = uniqueOfficeIds((Array.isArray(allOffices) ? allOffices : []).map(office => office?.id))
  const searchPhases = buildOfficeSearchPhases(allOffices, options.entry || {}, options)
  const descriptors = Array.isArray(options.entry?.descriptors) && options.entry.descriptors.length > 0
    ? options.entry.descriptors
    : null
  const phaseDebug = []
  let lastFailure = null

  for (const phase of searchPhases) {
    if (!phase.officeIds?.length) continue
    const result = await runMatchForOfficeIds(
      db,
      phase.officeIds,
      descriptor,
      thresholds,
      descriptor,
      descriptors,
    )

    phaseDebug.push({
      key: phase.key,
      officeIdsCount: phase.officeIds.length,
      decisionCode: result.decisionCode || (result.ok ? 'matched' : 'blocked_no_reliable_match'),
      candidateCount: Number.isFinite(result.debug?.candidateCount)
        ? Number(result.debug.candidateCount)
        : Number.isFinite(result.debug?.candidatesFound)
          ? Number(result.debug.candidatesFound)
          : null,
      bestDistance: Number.isFinite(result.debug?.bestDistance) ? Number(result.debug.bestDistance) : null,
      secondDistance: Number.isFinite(result.debug?.secondDistance) ? Number(result.debug.secondDistance) : null,
    })

    if (result.ok && phase.key !== 'global' && phase.key !== 'global_fallback' && allOfficeIds.length > phase.officeIds.length) {
      const globalResult = await runFullMatchForOfficeIds(
        db,
        allOfficeIds,
        descriptor,
        thresholds,
        descriptor,
        descriptors,
      )
      const localPersonId = getResolvedPersonId(result)
      const globalPersonId = getResolvedPersonId(globalResult)

      phaseDebug.push({
        key: 'global_full_competition',
        officeIdsCount: allOfficeIds.length,
        decisionCode: globalResult.decisionCode || (globalResult.ok ? 'matched' : 'blocked_no_reliable_match'),
        candidateCount: Number.isFinite(globalResult.debug?.candidateCount)
          ? Number(globalResult.debug.candidateCount)
          : null,
        bestDistance: Number.isFinite(globalResult.debug?.bestDistance) ? Number(globalResult.debug.bestDistance) : null,
        secondDistance: Number.isFinite(globalResult.debug?.secondDistance) ? Number(globalResult.debug.secondDistance) : null,
      })

      if (!globalResult.ok) {
        return {
          ...globalResult,
          debug: {
            ...(globalResult.debug || {}),
            localPhase: phase.key,
            localPersonId,
            localBestDistance: result.debug?.bestDistance ?? null,
            searchPhase: 'global_full_competition',
            searchPhases: phaseDebug,
          },
        }
      }

      if (globalPersonId && localPersonId && globalPersonId !== localPersonId) {
        return {
          ok: false,
          decisionCode: 'blocked_ambiguous_match',
          message: 'Face match is ambiguous between multiple employees.',
          debug: {
            ...(globalResult.debug || {}),
            localPhase: phase.key,
            localPersonId,
            localBestDistance: result.debug?.bestDistance ?? null,
            globalPersonId,
            globalBestDistance: globalResult.debug?.bestDistance ?? null,
            supportGate: 'phase_global_identity_disagreement',
            searchPhase: 'global_full_competition',
            searchPhases: phaseDebug,
          },
        }
      }

      return {
        ...globalResult,
        debug: {
          ...(globalResult.debug || {}),
          localPhase: phase.key,
          localBestDistance: result.debug?.bestDistance ?? null,
          searchPhase: phase.key,
          searchPhases: phaseDebug,
        },
      }
    }

    if (result.ok) {
      return {
        ...result,
        debug: {
          ...(result.debug || {}),
          searchPhase: phase.key,
          searchPhases: phaseDebug,
        },
      }
    }

    lastFailure = result
  }

  return {
    ...(lastFailure || {
      ok: false,
      decisionCode: 'blocked_no_reliable_match',
      message: 'No reliable face match was found.',
      debug: null,
    }),
    debug: {
      ...(lastFailure?.debug || {}),
      searchPhases: phaseDebug,
    },
  }
}

export async function resolveMatchedPerson(db, matchResult, queryDescriptor = null) {
  if (!matchResult.ok) return matchResult
  if (matchResult.person) return matchResult

  const record = await db.collection('persons').doc(matchResult.personId).get()
  if (!record.exists) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'Matched employee record no longer exists.' }
  }

  const person = { id: record.id, ...record.data() }
  const support = Array.isArray(queryDescriptor)
    ? buildMatchSupportSnapshot(person, queryDescriptor, matchResult.debug?.threshold)
    : null

  if (support?.weakSingleSample) {
    return {
      ok: false,
      decisionCode: 'blocked_no_reliable_match',
      message: 'No reliable face match was found.',
      debug: {
        ...(matchResult.debug || {}),
        supportDescriptorCount: support.descriptorCount,
        supportCount: support.supportCount,
        supportDistance: support.supportDistance,
        supportBestDistance: support.bestDistance,
        supportSecondBestDistance: support.secondBestDistance,
        supportGate: 'weak_single_sample_match',
      },
    }
  }

  return {
    ok: true,
    person,
    distance: matchResult.distance,
    confidence: matchResult.confidence,
    debug: support
      ? {
          ...(matchResult.debug || {}),
          supportDescriptorCount: support.descriptorCount,
          supportCount: support.supportCount,
          supportDistance: support.supportDistance,
          supportBestDistance: support.bestDistance,
          supportSecondBestDistance: support.secondBestDistance,
        }
      : (matchResult.debug || null),
  }
}
