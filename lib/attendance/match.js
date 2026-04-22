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

/**
 * Global biometric match across all provided office IDs.
 * Pass ALL office IDs from the offices collection — location check happens after identification.
 * Thresholds are read from Firestore (system_config/thresholds) with 30s in-process cache.
 */
export async function findGlobalMatch(db, allOffices, descriptor, options = {}) {
  const thresholds = await getActiveThresholds(db)
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
