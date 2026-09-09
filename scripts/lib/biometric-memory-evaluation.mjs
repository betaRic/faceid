import { matchBiometricIndexMultiDescriptor } from '../../lib/biometric-math.js'
import { buildMatchSupportSnapshot, isStrongUnambiguousSingleSampleSupport } from '../../lib/attendance/match-policy.js'
import { normalizeDescriptor, normalizeStoredDescriptors } from '../../lib/biometrics/descriptor-utils.js'
import { enrollmentFingerprint, validMemoryVector } from '../../lib/biometrics/memory-policy.js'

function match(person, descriptors, thresholds) {
  const samples = normalizeStoredDescriptors(person.descriptors).map((vector, index) => ({
    personId: person.id, sampleIndex: index, normalizedDescriptor: normalizeDescriptor(vector),
  }))
  const result = matchBiometricIndexMultiDescriptor(samples, descriptors, thresholds.kioskMatchDistance, thresholds.ambiguousMargin)
  if (!result.ok) return false
  const average = normalizeDescriptor(descriptors[0].map((_, index) => descriptors.reduce((sum, vector) => sum + vector[index], 0) / descriptors.length))
  const support = buildMatchSupportSnapshot(person, average, thresholds.kioskMatchDistance)
  return !support.weakSingleSample || isStrongUnambiguousSingleSampleSupport(support, result.debug)
}

const counters = () => ({ bothAccepted: 0, bothRejected: 0, additionalAccepted: 0, newlyRejected: 0 })

// Offline experiment only: deliberately measure naive union regressions too.
// This is not a production rescue policy and never reads/writes a database.
export function evaluateMemoryExperiment(data) {
  if (!Number.isSafeInteger(data?.cutoff) || !data.pipelineFingerprint
    || !Array.isArray(data.persons) || !Array.isArray(data.supplements) || !Array.isArray(data.attempts)
    || !data.attempts.length || !Number.isFinite(data.thresholds?.kioskMatchDistance)
    || !Number.isFinite(data.thresholds?.ambiguousMargin)) throw new Error('Explicit experiment metadata and thresholds required.')
  const persons = new Map()
  for (const person of data.persons) {
    if (!person.id || persons.has(person.id) || normalizeStoredDescriptors(person.descriptors).length < 2
      || !normalizeStoredDescriptors(person.descriptors).every(validMemoryVector)) throw new Error('Invalid original enrollment.')
    persons.set(person.id, person)
  }
  const supplements = new Map(), trainingSessions = new Set()
  for (const sample of data.supplements) {
    const person = persons.get(sample.personId)
    if (!person || !sample.sessionId || !Number.isSafeInteger(sample.capturedAt) || sample.capturedAt >= data.cutoff
      || sample.pipelineFingerprint !== data.pipelineFingerprint || sample.enrollmentFingerprint !== enrollmentFingerprint(person)
      || !validMemoryVector(sample.descriptor)) throw new Error('Invalid, incompatible or future training sample.')
    trainingSessions.add(sample.sessionId)
    if (!supplements.has(person.id)) supplements.set(person.id, [])
    supplements.get(person.id).push(sample)
  }
  const report = { productionApproval: false, comparison: 'original versus bounded sample union; biometric matching only',
    genuine: counters(), impostor: counters(), selectedSupplementCount: 0, attempts: data.attempts.length }
  const selected = new Map()
  for (const [id, samples] of supplements) {
    const days = new Map()
    for (const sample of [...samples].sort((a, b) => b.capturedAt - a.capturedAt)) {
      const day = new Date(sample.capturedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      if (!days.has(day)) days.set(day, sample)
    }
    const kept = days.size >= 3 ? [...days.values()].slice(0, 4) : []
    selected.set(id, kept)
    report.selectedSupplementCount += kept.length
  }
  const attemptIds = new Set()
  for (const attempt of [...data.attempts].sort((a, b) => a.timestamp - b.timestamp)) {
    if (attempt.pipelineFingerprint !== data.pipelineFingerprint) throw new Error('Probe pipeline does not match experiment.')
    if (!attempt.id || attemptIds.has(attempt.id) || !attempt.sessionId || trainingSessions.has(attempt.sessionId)) throw new Error('Duplicate attempt or overlapping training/test session.')
    attemptIds.add(attempt.id)
    if (attempt.independentlyVerified !== true || !(attempt.truePersonId === null || persons.has(attempt.truePersonId))) throw new Error('Each identity label must be independently verified.')
    if (!Number.isSafeInteger(attempt.timestamp) || attempt.timestamp < data.cutoff
      || !Array.isArray(attempt.descriptors) || attempt.descriptors.length !== 2 || !attempt.descriptors.every(validMemoryVector)) throw new Error('Invalid later-session probe.')
    const person = persons.get(attempt.claimedPersonId)
    if (!person) throw new Error('Unknown claimed profile; evaluate invalid-code handling separately.')
    const oldAccepted = match(person, attempt.descriptors, data.thresholds)
    const eligible = (selected.get(person.id) || [])
      .filter(sample => sample.capturedAt + 30 * 86400000 > attempt.timestamp)
      .map(sample => sample.descriptor)
    const newAccepted = match({ ...person, descriptors: [...normalizeStoredDescriptors(person.descriptors), ...eligible] }, attempt.descriptors, data.thresholds)
    const group = attempt.truePersonId === person.id ? report.genuine : report.impostor
    const key = oldAccepted ? (newAccepted ? 'bothAccepted' : 'newlyRejected') : (newAccepted ? 'additionalAccepted' : 'bothRejected')
    group[key]++
  }
  return report
}
