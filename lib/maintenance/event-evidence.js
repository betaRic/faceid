const CATEGORY_ORDER = Object.freeze([
  'attendance_written',
  'identity_resolved_operational_block',
  'account_state_block',
  'claimed_identity_mismatch',
  'other_biometric_failure',
  'capture_quality_failure',
  'liveness_observation_block',
  'credential_failure',
  'location_or_policy_block',
  'system_or_rate_limit_failure',
  'unknown',
])

const DECISION_CATEGORY = new Map([
  ['blocked_recent_duplicate', 'identity_resolved_operational_block'],
  ['blocked_day_complete', 'identity_resolved_operational_block'],
  ['blocked_geofence', 'identity_resolved_operational_block'],
  ['blocked_inactive', 'account_state_block'],
  ['blocked_pending_approval', 'account_state_block'],
  ['blocked_missing_office_config', 'identity_resolved_operational_block'],
  ['blocked_workforce_policy_unavailable', 'identity_resolved_operational_block'],
  ['blocked_biometrics_inactive', 'account_state_block'],

  ['blocked_claimed_employee_mismatch', 'claimed_identity_mismatch'],

  ['blocked_no_reliable_match', 'other_biometric_failure'],
  ['blocked_ambiguous_match', 'other_biometric_failure'],
  ['blocked_unstable_descriptor_burst', 'other_biometric_failure'],
  ['blocked_multiple_faces', 'other_biometric_failure'],
  ['blocked_no_biometrics', 'other_biometric_failure'],

  ['blocked_capture_policy', 'capture_quality_failure'],
  ['blocked_descriptor_shape', 'capture_quality_failure'],
  ['blocked_landscape_mobile', 'capture_quality_failure'],
  ['blocked_low_descriptor_spread', 'capture_quality_failure'],
  ['blocked_low_resolution', 'capture_quality_failure'],
  ['blocked_missing_scan_frames', 'capture_quality_failure'],
  ['blocked_invalid_scan_frame', 'capture_quality_failure'],
  ['blocked_invalid_frame', 'capture_quality_failure'],
  ['blocked_no_face', 'capture_quality_failure'],

  ['blocked_liveness', 'liveness_observation_block'],
  ['blocked_antispoof', 'liveness_observation_block'],
  ['blocked_missing_liveness', 'liveness_observation_block'],
  ['blocked_photo_detected', 'liveness_observation_block'],
  ['blocked_photo_detected_flat', 'liveness_observation_block'],
  ['blocked_photo_detected_flat_no_blink', 'liveness_observation_block'],

  ['blocked_missing_access_code', 'credential_failure'],
  ['blocked_invalid_access_code', 'credential_failure'],
  ['blocked_unknown_access_code', 'credential_failure'],
  ['blocked_missing_employee_id', 'credential_failure'],
  ['blocked_invalid_employee_id', 'credential_failure'],
  ['blocked_unknown_employee_id', 'credential_failure'],
  ['blocked_employee_id_conflict', 'credential_failure'],

  ['blocked_missing_gps', 'location_or_policy_block'],
  ['blocked_wifi_mismatch', 'location_or_policy_block'],
  ['blocked_wrong_context', 'location_or_policy_block'],
  ['blocked_wrong_office_context', 'location_or_policy_block'],
  ['blocked_no_candidate_office', 'location_or_policy_block'],

  ['blocked_rate_limited', 'system_or_rate_limit_failure'],
  ['blocked_expired_challenge', 'system_or_rate_limit_failure'],
  ['blocked_invalid_challenge', 'system_or_rate_limit_failure'],
  ['blocked_index_building', 'system_or_rate_limit_failure'],
  ['blocked_server_error', 'system_or_rate_limit_failure'],
  ['blocked_legacy_attendance_route', 'system_or_rate_limit_failure'],
])

const VERIFICATION_CATEGORIES = new Set([
  'attendance_written',
  'identity_resolved_operational_block',
  'claimed_identity_mismatch',
  'other_biometric_failure',
])

const VERIFIED_CATEGORIES = new Set([
  'attendance_written',
  'identity_resolved_operational_block',
])

const HEALTHY_STATUS = new Set(['healthy', 'stable', 'sufficient', 'fresh', 'ready'])

export const MAINTENANCE_EVIDENCE_POLICY = Object.freeze({
  minimumTelemetryEvents: 25,
  minimumVerificationAttempts: 25,
  minimumCriticalCoverage: 0.8,
  mismatchWarningRate: 0.1,
  mismatchFailureRate: 0.2,
  captureWarningRate: 0.08,
  captureFailureRate: 0.15,
  performanceWarningP95Ms: 2000,
  performanceFailureP95Ms: 3000,
  populationSufficientRate: 0.75,
  populationPartialRate: 0.4,
})

function asObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function rate(count, total) {
  return total > 0 ? count / total : null
}

function percentile(values, target) {
  const sorted = values
    .map(finiteNumber)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (!sorted.length) return null
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * Math.max(0, Math.min(1, Number(target) || 0))
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower))
}

function metricSummary(values, points = [0.5, 0.95]) {
  const finite = values.map(finiteNumber).filter(Number.isFinite)
  const summary = { count: finite.length }
  for (const point of points) {
    const key = `p${String(Math.round(point * 100)).padStart(2, '0')}`
    summary[key] = percentile(finite, point)
  }
  return summary
}

function normalizedText(value) {
  return String(value || '').trim()
}

function getMatchMode(event) {
  return normalizedText(event?.scanDiagnostics?.serverMatchMode || event?.matchDebug?.serverMatchMode) || 'unknown'
}

function getBrowser(event) {
  const explicit = normalizedText(event?.scanDiagnostics?.browser)
  if (explicit) return explicit
  const userAgent = String(event?.captureContext?.userAgent || '')
  if (/FBAN|FBAV|Messenger/i.test(userAgent)) return 'Facebook/Messenger'
  if (/Edg\//i.test(userAgent)) return 'Edge'
  if (/CriOS/i.test(userAgent)) return 'Chrome iOS'
  if (/Chrome\//i.test(userAgent)) return 'Chrome'
  if (/Firefox\//i.test(userAgent)) return 'Firefox'
  if (/Safari\//i.test(userAgent)) return 'Safari'
  return 'Unknown'
}

function getDeviceClass(event) {
  return normalizedText(
    event?.scanDiagnostics?.deviceClass
      || (event?.captureContext?.mobile === true ? 'mobile' : '')
      || (event?.captureContext?.mobile === false ? 'desktop' : ''),
  ).toLowerCase() || 'unknown'
}

export function normalizeScanEventIdentity(event = {}) {
  const debug = asObject(event.matchDebug)
  return {
    personId: normalizedText(event.personId || debug.resolvedPersonId),
    employeeId: normalizedText(debug.resolvedEmployeeId || event.employeeId),
    officeId: normalizedText(debug.officeId || event.officeId),
  }
}

export function resolvePersistedScanIdentity({ entry = {}, person = null, debug = null, requestMeta = null } = {}) {
  const matchDebug = asObject(debug)
  return {
    personId: normalizedText(person?.id || matchDebug.resolvedPersonId || requestMeta?.personId || entry?.personId).slice(0, 128),
    employeeId: normalizedText(person?.employeeId || matchDebug.resolvedEmployeeId || entry?.employeeId).slice(0, 64),
    officeId: normalizedText(person?.officeId || matchDebug.officeId || requestMeta?.officeId || entry?.officeId).slice(0, 64),
  }
}

export function classifyScanEvent(event = {}) {
  if (event.status === 'accepted') return 'attendance_written'
  return DECISION_CATEGORY.get(normalizedText(event.decisionCode)) || 'unknown'
}

function countBy(events, getKey, orderedKeys = null) {
  const counts = new Map()
  for (const event of events) {
    const key = normalizedText(getKey(event)) || 'unknown'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const keys = orderedKeys || [...counts.keys()].sort((left, right) => (counts.get(right) - counts.get(left)) || left.localeCompare(right))
  return keys.map(key => ({ key, count: counts.get(key) || 0, rate: rate(counts.get(key) || 0, events.length) }))
}

function hasServerAuthoritativeEvidence(event) {
  return Boolean(
    event?.captureContext?.authoritativeDescriptorSource
      || Number.isFinite(event?.captureContext?.serverEmbeddingFrames)
      || Number.isFinite(event?.scanDiagnostics?.serverEmbeddingFrames),
  )
}

function hasCaptureDiagnostics(event) {
  return Number.isFinite(event?.scanDiagnostics?.bestFaceAreaRatio)
    || Number.isFinite(event?.captureContext?.burstQualityScore)
    || Boolean(event?.scanDiagnostics?.deviceClass)
}

function hasTiming(event) {
  return Number.isFinite(event?.performance?.totalMeasuredMs)
}

function buildGroupedEvidence(events, getKey) {
  const groups = new Map()
  for (const event of events) {
    const key = normalizedText(getKey(event)) || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const verification = group.filter(event => VERIFICATION_CATEGORIES.has(classifyScanEvent(event)))
      const biometricFailures = verification.filter(event => (
        classifyScanEvent(event) === 'claimed_identity_mismatch'
        || classifyScanEvent(event) === 'other_biometric_failure'
      ))
      const captureFailures = group.filter(event => classifyScanEvent(event) === 'capture_quality_failure')
      return {
        key,
        total: group.length,
        verificationDenominator: verification.length,
        biometricFailureRate: rate(biometricFailures.length, verification.length),
        captureFailureRate: rate(captureFailures.length, group.length),
        telemetryCoverageRate: rate(group.filter(hasCaptureDiagnostics).length, group.length),
        p95TotalServerMs: percentile(group.map(event => event?.performance?.totalMeasuredMs), 0.95),
      }
    })
    .sort((left, right) => right.total - left.total || left.key.localeCompare(right.key))
}

function buildRepeatedMismatchCandidates(events) {
  const groups = new Map()
  for (const event of events) {
    if (classifyScanEvent(event) !== 'claimed_identity_mismatch') continue
    const identity = normalizeScanEventIdentity(event)
    if (!identity.personId) continue
    if (!groups.has(identity.personId)) groups.set(identity.personId, { identity, events: [] })
    groups.get(identity.personId).events.push(event)
  }
  return [...groups.entries()]
    .map(([personId, group]) => ({
      personId,
      employeeId: group.identity.employeeId,
      officeId: group.identity.officeId,
      count: group.events.length,
      lastTimestamp: Math.max(...group.events.map(event => Number(event.timestamp || 0))),
      medianDistance: percentile(group.events.map(event => event?.matchDebug?.bestDistance), 0.5),
      deviceClasses: [...new Set(group.events.map(getDeviceClass))].sort(),
    }))
    .filter(candidate => candidate.count >= 2)
    .sort((left, right) => right.count - left.count || right.lastTimestamp - left.lastTimestamp)
}

function status(statusValue, value, denominator, rule, detail) {
  return { status: statusValue, value, denominator, rule, detail }
}

function buildActions(statuses, evidence, calibration) {
  const labels = {
    telemetry: 'Repair telemetry evidence',
    verification1to1: 'Investigate 1:1 verification failures',
    capture: 'Improve capture quality',
    performance: 'Investigate scan latency',
    populationCoverage: 'Collect broader employee evidence',
  }
  const actions = []
  for (const [key, value] of Object.entries(statuses)) {
    if (!HEALTHY_STATUS.has(value.status)) {
      actions.push({
        id: key,
        severity: ['failing', 'truncated'].includes(value.status) ? 'critical' : 'warning',
        title: labels[key] || key,
        detail: value.detail,
      })
    }
  }
  if (evidence.unknownOutcomeCount > 0) {
    actions.push({
      id: 'unknown-outcomes',
      severity: 'warning',
      title: 'Classify unknown scan outcomes',
      detail: `${evidence.unknownOutcomeCount} event(s) use unrecognized decision codes.`,
    })
  }
  actions.push({
    id: 'calibration',
    severity: 'information',
    title: 'Threshold calibration unavailable',
    detail: calibration.reason,
  })
  return actions
}

function sameCurrentEmployee(identity, employee, uniqueEmployeeIds) {
  const personId = normalizedText(employee?.personId || employee?.id)
  const employeeId = normalizedText(employee?.employeeId)
  if (identity.personId) return Boolean(personId && identity.personId === personId)
  return Boolean(employeeId && uniqueEmployeeIds.has(employeeId) && identity.employeeId === employeeId)
}

export function buildMaintenanceEvidenceReport(scanEvents = [], options = {}) {
  const events = Array.isArray(scanEvents) ? scanEvents : []
  const totalWindowEvents = Math.max(events.length, Number(options.totalWindowEvents) || 0)
  const coverageRate = rate(events.length, totalWindowEvents)
  const categories = countBy(events, classifyScanEvent, CATEGORY_ORDER)
  const categoryCounts = Object.fromEntries(categories.map(item => [item.key, item.count]))
  const verificationEvents = events.filter(event => VERIFICATION_CATEGORIES.has(classifyScanEvent(event)))
  const verifiedEvents = verificationEvents.filter(event => VERIFIED_CATEGORIES.has(classifyScanEvent(event)))
  const mismatchEvents = verificationEvents.filter(event => classifyScanEvent(event) === 'claimed_identity_mismatch')
  const otherBiometricFailures = verificationEvents.filter(event => classifyScanEvent(event) === 'other_biometric_failure')
  const captureFailures = events.filter(event => classifyScanEvent(event) === 'capture_quality_failure')
  const attributedVerification = verificationEvents.filter(event => normalizeScanEventIdentity(event).personId)
  const distanceEvents = verificationEvents.filter(event => Number.isFinite(event?.matchDebug?.bestDistance))
  const thresholdValues = verificationEvents.map(event => event?.matchDebug?.threshold)
  const verifiedDistances = verifiedEvents.map(event => event?.matchDebug?.bestDistance)
  const mismatchDistances = mismatchEvents.map(event => event?.matchDebug?.bestDistance)
  const headroomValues = verifiedEvents
    .map(event => {
      const threshold = finiteNumber(event?.matchDebug?.threshold)
      const distance = finiteNumber(event?.matchDebug?.bestDistance)
      return threshold == null || distance == null ? null : threshold - distance
    })
  const totalServerValues = events.map(event => event?.performance?.totalMeasuredMs)
  const currentEmployees = Array.isArray(options.currentEmployees) ? options.currentEmployees : []
  const employeeIdCounts = new Map()
  for (const employee of currentEmployees) {
    const employeeId = normalizedText(employee?.employeeId)
    if (employeeId) employeeIdCounts.set(employeeId, (employeeIdCounts.get(employeeId) || 0) + 1)
  }
  const uniqueEmployeeIds = new Set(
    [...employeeIdCounts.entries()].filter(([, count]) => count === 1).map(([employeeId]) => employeeId),
  )
  const representedCurrentEmployees = currentEmployees.filter(employee => (
    verifiedEvents.some(event => sameCurrentEmployee(normalizeScanEventIdentity(event), employee, uniqueEmployeeIds))
  ))
  const unknownOutcomeCount = categoryCounts.unknown || 0
  const evidence = {
    totalWindowEvents,
    loadedEvents: events.length,
    coverageRate,
    truncated: totalWindowEvents > events.length,
    identityAttributionCoverageRate: rate(attributedVerification.length, verificationEvents.length),
    serverAuthoritativeCoverageRate: rate(events.filter(hasServerAuthoritativeEvidence).length, events.length),
    matchDistanceCoverageRate: rate(distanceEvents.length, verificationEvents.length),
    timingCoverageRate: rate(events.filter(hasTiming).length, events.length),
    captureDiagnosticsCoverageRate: rate(events.filter(hasCaptureDiagnostics).length, events.length),
    unknownOutcomeCount,
  }

  const mismatchRate = rate(mismatchEvents.length, verificationEvents.length)
  const captureFailureRate = rate(captureFailures.length, events.length)
  const p95TotalServerMs = percentile(totalServerValues, 0.95)
  const populationCoverageRate = rate(representedCurrentEmployees.length, currentEmployees.length)
  const telemetryState = evidence.truncated
    ? 'truncated'
    : events.length < MAINTENANCE_EVIDENCE_POLICY.minimumTelemetryEvents
      ? 'insufficient'
      : unknownOutcomeCount > 0 || (evidence.serverAuthoritativeCoverageRate ?? 0) < MAINTENANCE_EVIDENCE_POLICY.minimumCriticalCoverage
        ? 'partial'
        : 'sufficient'
  const verificationState = verificationEvents.length < MAINTENANCE_EVIDENCE_POLICY.minimumVerificationAttempts
    ? 'insufficient'
    : mismatchRate > MAINTENANCE_EVIDENCE_POLICY.mismatchFailureRate
      ? 'failing'
      : telemetryState !== 'sufficient'
        ? 'insufficient'
      : mismatchRate > MAINTENANCE_EVIDENCE_POLICY.mismatchWarningRate
        ? 'warning'
        : 'stable'
  const captureState = events.length < MAINTENANCE_EVIDENCE_POLICY.minimumTelemetryEvents
    ? 'insufficient'
    : captureFailureRate > MAINTENANCE_EVIDENCE_POLICY.captureFailureRate
      ? 'failing'
      : captureFailureRate > MAINTENANCE_EVIDENCE_POLICY.captureWarningRate
        ? 'warning'
        : 'stable'
  const performanceState = evidence.timingCoverageRate == null || evidence.timingCoverageRate < 0.5
    ? 'insufficient'
    : p95TotalServerMs > MAINTENANCE_EVIDENCE_POLICY.performanceFailureP95Ms
      ? 'failing'
      : p95TotalServerMs > MAINTENANCE_EVIDENCE_POLICY.performanceWarningP95Ms
        ? 'warning'
        : 'stable'
  const populationState = currentEmployees.length === 0
    ? 'insufficient'
    : populationCoverageRate >= MAINTENANCE_EVIDENCE_POLICY.populationSufficientRate
      ? 'sufficient'
      : populationCoverageRate >= MAINTENANCE_EVIDENCE_POLICY.populationPartialRate
        ? 'partial'
        : 'insufficient'

  const statuses = {
    telemetry: status(telemetryState, events.length, totalWindowEvents, 'Complete, classified, server-authoritative evidence is required.', evidence.truncated ? 'Selected window is truncated.' : 'Telemetry completeness and classification coverage.'),
    verification1to1: status(verificationState, mismatchRate, verificationEvents.length, 'At least 25 complete comparison attempts; mismatch warning above 10% and failure above 20%.', verificationEvents.length ? `${mismatchEvents.length} claimed mismatch event(s) among ${verificationEvents.length} comparison outcomes.` : 'No usable 1:1 comparison outcomes.'),
    capture: status(captureState, captureFailureRate, events.length, 'Capture warning above 8% and failure above 15%.', `${captureFailures.length} capture failure event(s) in the loaded window.`),
    performance: status(performanceState, p95TotalServerMs, events.filter(hasTiming).length, 'Server p95 warning above 2000 ms and failure above 3000 ms.', p95TotalServerMs == null ? 'Server timing evidence is missing.' : `Server p95 is ${Math.round(p95TotalServerMs)} ms.`),
    populationCoverage: status(populationState, populationCoverageRate, currentEmployees.length, 'At least 75% of current employees for sufficient coverage.', `${representedCurrentEmployees.length} of ${currentEmployees.length} current employees are represented by verified scans.`),
  }

  const calibration = {
    status: 'unavailable',
    reason: 'Labeled genuine and impostor evidence is not available. Operational mismatches cannot establish FAR, FMR, or FNMR.',
    thresholdRecommendation: null,
    labeledGenuineSamples: 0,
    labeledImpostorSamples: 0,
  }

  return {
    version: 2,
    generatedAt: new Date(Number(options.now) || Date.now()).toISOString(),
    window: options.window || null,
    evidence,
    statuses,
    actions: buildActions(statuses, evidence, calibration),
    verification1to1: {
      denominator: verificationEvents.length,
      verifiedIdentityCount: verifiedEvents.length,
      verifiedIdentityRate: rate(verifiedEvents.length, verificationEvents.length),
      claimedMismatchCount: mismatchEvents.length,
      claimedMismatchRate: mismatchRate,
      otherBiometricFailureCount: otherBiometricFailures.length,
      otherBiometricFailureRate: rate(otherBiometricFailures.length, verificationEvents.length),
      verifiedDistance: metricSummary(verifiedDistances, [0.5, 0.95]),
      mismatchDistance: metricSummary(mismatchDistances, [0.05, 0.5]),
      threshold: {
        count: thresholdValues.map(finiteNumber).filter(Number.isFinite).length,
        min: percentile(thresholdValues, 0),
        median: percentile(thresholdValues, 0.5),
        max: percentile(thresholdValues, 1),
      },
      acceptedHeadroom: metricSummary(headroomValues, [0.05, 0.5]),
      repeatedMismatchCandidates: buildRepeatedMismatchCandidates(mismatchEvents),
    },
    capture: {
      failureCount: captureFailures.length,
      failureRate: captureFailureRate,
      faceAreaRatio: metricSummary(events.map(event => event?.scanDiagnostics?.bestFaceAreaRatio), [0.1, 0.5, 0.9]),
      burstQuality: metricSummary(events.map(event => event?.captureContext?.burstQualityScore), [0.1, 0.5]),
      byDevice: buildGroupedEvidence(events, getDeviceClass),
      byBrowser: buildGroupedEvidence(events, getBrowser),
      byFacingMode: buildGroupedEvidence(events, event => event?.captureContext?.trackFacingMode || 'unknown'),
      byOrientation: buildGroupedEvidence(events, event => event?.captureContext?.screenOrientation || 'unknown'),
    },
    performance: {
      totalServerMs: metricSummary(totalServerValues, [0.5, 0.95]),
      serverEmbeddingMs: metricSummary(events.map(event => event?.performance?.serverEmbeddingMs), [0.5, 0.95]),
      matchingMs: metricSummary(events.map(event => event?.performance?.matchingMs), [0.5, 0.95]),
      databaseReadMs: metricSummary(events.map(event => event?.performance?.databaseReadMs), [0.5, 0.95]),
      databaseWriteMs: metricSummary(events.map(event => event?.performance?.databaseWriteMs), [0.5, 0.95]),
    },
    population: {
      currentApprovedActiveEmployees: currentEmployees.length,
      representedCurrentEmployees: representedCurrentEmployees.length,
      coverageRate: populationCoverageRate,
      repeatedMismatchCandidates: buildRepeatedMismatchCandidates(mismatchEvents),
      unattributedVerificationFailures: verificationEvents.filter(event => (
        !normalizeScanEventIdentity(event).personId
        && !VERIFIED_CATEGORIES.has(classifyScanEvent(event))
      )).length,
    },
    breakdowns: {
      categories,
      decisions: countBy(events, event => event.decisionCode || event.status),
      matchModes: countBy(events, getMatchMode),
    },
    calibration,
  }
}
