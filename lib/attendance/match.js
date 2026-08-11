import { getActiveThresholds } from '@/lib/thresholds'
import {
  matchBiometricIndexCandidates,
  matchBiometricIndexMultiDescriptor,
} from '@/lib/biometric-index'
import { normalizeDescriptor, normalizeStoredDescriptors } from '@/lib/biometrics/descriptor-utils'
import { isPersonApproved } from '@/lib/person-approval'
import { getLocalPersonByAccessCode } from '@/lib/postgres/attendance-store'
import { getLocalPersonById } from '@/lib/postgres/person-store'
import {
  buildMatchSupportSnapshot,
  isStrongUnambiguousSingleSampleSupport,
} from './match-policy'

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

function buildCandidateSamplesForPerson(personId, person) {
  return normalizeStoredDescriptors(person?.descriptors)
    .map((descriptor, sampleIndex) => {
      const normalizedDescriptor = normalizeDescriptor(descriptor)
      if (!Array.isArray(normalizedDescriptor) || normalizedDescriptor.length === 0) return null
      return {
        personId,
        employeeId: String(person?.employeeId || ''),
        name: String(person?.name || ''),
        officeId: String(person?.officeId || ''),
        officeName: String(person?.officeName || ''),
        sampleIndex,
        normalizedDescriptor,
      }
    })
    .filter(Boolean)
}

async function resolvePersonByAccessCode(accessCode) {
  const normalizedAccessCode = String(accessCode || '').trim()
  if (!/^\d{4}$/.test(normalizedAccessCode)) {
    return {
      ok: false,
      decisionCode: 'blocked_invalid_access_code',
      message: 'Enter the four-digit VeriFace access code.',
      debug: { source: 'claimed_access_code_1to1', matchMode: 'claimed_access_code_1to1' },
    }
  }

  const person = await getLocalPersonByAccessCode(normalizedAccessCode)
  if (!person) {
    return {
      ok: false,
      decisionCode: 'blocked_unknown_access_code',
      message: 'Access code was not found. Check the code and try again.',
      debug: {
        source: 'claimed_access_code_1to1',
        matchMode: 'claimed_access_code_1to1',
        claimedAccessCode: normalizedAccessCode,
      },
    }
  }

  return { ok: true, person }
}

export async function findClaimedEmployeeMatch(_db, _allOffices, descriptor, options = {}) {
  const thresholds = await getActiveThresholds()
  const entry = options.entry || {}
  const claimedAccessCode = String(options.employeeId || entry.employeeId || '').trim()
  const lookupResult = await resolvePersonByAccessCode(claimedAccessCode)
  if (!lookupResult.ok) return lookupResult

  const person = lookupResult.person
  const personId = String(person?.id || '')
  const debugBase = {
    source: 'claimed_access_code_1to1',
    matchMode: 'claimed_access_code_1to1',
    claimedAccessCode,
    resolvedEmployeeId: String(person?.employeeId || ''),
    resolvedPersonId: personId,
    officeId: String(person?.officeId || ''),
  }

  if (person.active === false) {
    return { ok: false, decisionCode: 'blocked_inactive', message: 'Employee account is inactive.', debug: debugBase }
  }
  if (!isPersonApproved(person)) {
    return { ok: false, decisionCode: 'blocked_pending_approval', message: 'Employee enrollment is still pending admin approval.', debug: debugBase }
  }

  const candidates = buildCandidateSamplesForPerson(personId, person)
  if (candidates.length === 0) {
    return {
      ok: false,
      decisionCode: 'blocked_no_biometrics',
      message: 'Employee has no active biometric samples. Re-enrollment is required.',
      debug: { ...debugBase, candidateCount: 0 },
    }
  }

  const descriptors = Array.isArray(entry.descriptors) && entry.descriptors.length >= 2 ? entry.descriptors : null
  const matchResult = runMatch(candidates, descriptor, descriptors, thresholds)
  if (!matchResult.ok) {
    return {
      ...matchResult,
      decisionCode: matchResult.decisionCode === 'blocked_ambiguous_match'
        ? matchResult.decisionCode
        : 'blocked_claimed_employee_mismatch',
      message: matchResult.decisionCode === 'blocked_ambiguous_match'
        ? matchResult.message
        : 'Face does not match the entered access code.',
      debug: { ...(matchResult.debug || {}), ...debugBase, candidateSampleCount: candidates.length },
    }
  }

  const resolved = await resolveMatchedPerson(matchResult, descriptor, person)
  return {
    ...resolved,
    debug: { ...(resolved.debug || {}), ...debugBase, candidateSampleCount: candidates.length },
  }
}

export async function resolveMatchedPerson(matchResult, queryDescriptor = null, preloadedPerson = null) {
  if (!matchResult.ok) return matchResult

  const person = matchResult.person || preloadedPerson || await getLocalPersonById(matchResult.personId)
  if (!person) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'Matched employee record no longer exists.' }
  }

  const support = Array.isArray(queryDescriptor)
    ? buildMatchSupportSnapshot(person, queryDescriptor, matchResult.debug?.threshold)
    : null
  const strongSingleSampleSupport = support?.weakSingleSample
    ? isStrongUnambiguousSingleSampleSupport(support, matchResult.debug)
    : false

  if (support?.weakSingleSample && !strongSingleSampleSupport) {
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
          supportGate: strongSingleSampleSupport ? 'strong_margin_single_sample_support' : (matchResult.debug?.supportGate || ''),
        }
      : (matchResult.debug || null),
  }
}
