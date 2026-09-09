import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateMemoryExperiment } from '../scripts/lib/biometric-memory-evaluation.mjs'
import { enrollmentFingerprint } from '../lib/biometrics/memory-policy.js'
const vector = a => [Math.cos(a), Math.sin(a), ...Array(1022).fill(0)]
const person = { id: 'a', descriptors: [vector(0), vector(.05)], biometricModelVersion: 'test' }
const input = () => ({ pipelineFingerprint: 'test', thresholds: { kioskMatchDistance: .8, ambiguousMargin: .06 },
  cutoff: Date.parse('2026-09-04T00:00:00Z'), persons: [person], supplements: [],
  attempts: [{ id: 'probe', sessionId: 'later-session', timestamp: Date.parse('2026-09-05T00:00:00Z'),
    pipelineFingerprint: 'test', claimedPersonId: 'a', truePersonId: 'a', independentlyVerified: true, descriptors: [vector(.1), vector(.11)] }] })
test('offline comparison reports paired outcomes without changing enrollment', () => {
  const data = input(), snapshot = structuredClone(data)
  const report = evaluateMemoryExperiment(data)
  assert.equal(report.genuine.bothAccepted, 1)
  assert.deepEqual(data, snapshot)
  assert.equal(report.productionApproval, false)
})
test('offline comparison refuses training/test leakage and unverified labels', () => {
  const data = input()
  data.supplements.push({ personId: 'a', sessionId: 'later-session', capturedAt: data.cutoff - 1000,
    pipelineFingerprint: 'test', enrollmentFingerprint: enrollmentFingerprint(person), descriptor: vector(.12) })
  assert.throws(() => evaluateMemoryExperiment(data), /session/i)
  const unlabeled = input(); unlabeled.attempts[0].independentlyVerified = false
  assert.throws(() => evaluateMemoryExperiment(unlabeled), /independently/i)
})
test('offline comparison refuses probes from a different processing pipeline', () => {
  const data = input(); data.attempts[0].pipelineFingerprint = 'different'
  assert.throws(() => evaluateMemoryExperiment(data), /pipeline/i)
})

function supplement(data, day, angle = .12) {
  return { personId: 'a', sessionId: `training-${day}`, capturedAt: data.cutoff - day * 86400000,
    pipelineFingerprint: 'test', enrollmentFingerprint: enrollmentFingerprint(person), descriptor: vector(angle) }
}

test('selection requires three distinct days and caps the newest daily examples at four', () => {
  const data = input()
  data.supplements = [supplement(data, 1), supplement(data, 1), supplement(data, 2)]
  assert.equal(evaluateMemoryExperiment(data).selectedSupplementCount, 0)
  data.supplements.push(supplement(data, 3))
  assert.equal(evaluateMemoryExperiment(data).selectedSupplementCount, 3)
  data.supplements.push(supplement(data, 4), supplement(data, 5))
  assert.equal(evaluateMemoryExperiment(data).selectedSupplementCount, 4)
})

test('expired examples cannot rescue a later probe and impostor outcomes stay separate', () => {
  const data = input()
  data.supplements = [1, 2, 3].map(day => supplement(data, day, 1.5))
  data.attempts[0].descriptors = [vector(1.5), vector(1.51)]
  data.attempts[0].truePersonId = null
  const fresh = evaluateMemoryExperiment(data)
  assert.equal(fresh.impostor.additionalAccepted, 1)
  assert.equal(fresh.genuine.additionalAccepted, 0)
  data.attempts[0].timestamp += 31 * 86400000
  assert.equal(evaluateMemoryExperiment(data).impostor.bothRejected, 1)
})
