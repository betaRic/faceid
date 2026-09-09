import test from 'node:test'
import assert from 'node:assert/strict'
import { assessMemoryCandidate, enrollmentFingerprint, MEMORY_POLICY } from '../lib/biometrics/memory-policy.js'
import { measureFaceImageQuality } from '../lib/biometrics/image-quality.js'

const vector = (angle = 0) => [Math.cos(angle), Math.sin(angle), ...Array(1022).fill(0)]
const original = { id: 'employee-a', biometricModelVersion: 'human-faceres-server-wasm-v1', descriptors: [vector(0), vector(.08)] }
const quality = { faceScore: .99, faceWidth: 120, faceHeight: 160, meanBrightness: 128, clippedFraction: .01, sharpness: 200 }
const frame = angle => ({ descriptor: vector(angle), antispoof: .95, quality: { ...quality } })
const input = () => ({ person: original, frames: [frame(.1), frame(.12)], otherPersons: [{ id: 'employee-b', descriptors: [vector(1.4)] }], originalAccepted: true })

test('memory admits strong original matches with real competitor evidence', () => {
  const result = assessMemoryCandidate(input())
  assert.equal(result.ok, true)
  assert.equal(result.frames.length, 2)
  assert.ok(result.evidence.every(item => item.otherDistance - item.bestDistance >= MEMORY_POLICY.minOtherMargin))
})
test('memory never learns from adaptive-only acceptance or absent quality', () => {
  assert.equal(assessMemoryCandidate({ ...input(), originalAccepted: false }).ok, false)
  const args = input(); delete args.frames[0].quality
  assert.equal(assessMemoryCandidate(args).ok, false)
})
test('memory requires two trustworthy frames and other-person evidence', () => {
  assert.equal(assessMemoryCandidate({ ...input(), frames: [frame(.1)] }).ok, false)
  assert.equal(assessMemoryCandidate({ ...input(), otherPersons: [] }).ok, false)
  const args = input(); args.frames[1].antispoof = null
  assert.equal(assessMemoryCandidate(args).ok, false)
})
test('memory rejects close competing employee, inconsistent frames and invalid vectors', () => {
  assert.equal(assessMemoryCandidate({ ...input(), otherPersons: [{ id: 'employee-b', descriptors: [vector(.11)] }] }).ok, false)
  assert.equal(assessMemoryCandidate({ ...input(), frames: [frame(.1), frame(-.5)] }).ok, false)
  const args = input(); args.frames[0].descriptor[0] = NaN
  assert.equal(assessMemoryCandidate(args).ok, false)
})
test('original fingerprint changes with enrollment or model but not access code', () => {
  assert.equal(enrollmentFingerprint(original), enrollmentFingerprint({ ...original, accessCode: '1234' }))
  assert.notEqual(enrollmentFingerprint(original), enrollmentFingerprint({ ...original, descriptors: [vector(.3)] }))
  assert.notEqual(enrollmentFingerprint(original), enrollmentFingerprint({ ...original, biometricModelVersion: 'different' }))
})
test('image quality measures only face pixels, detects flat and clipped images', () => {
  const pixels = new Uint8Array(20 * 20 * 3).fill(128)
  const flat = measureFaceImageQuality(pixels, 20, 20, { x: 2, y: 2, width: 16, height: 16 })
  assert.equal(flat.sharpness, 0)
  assert.ok(Math.abs(flat.meanBrightness - 128) < 1e-9)
  pixels.fill(255)
  assert.equal(measureFaceImageQuality(pixels, 20, 20, { x: 2, y: 2, width: 16, height: 16 }).clippedFraction, 1)
  assert.equal(measureFaceImageQuality(pixels, 20, 20, { x: NaN, y: 2, width: 16, height: 16 }), null)
})
