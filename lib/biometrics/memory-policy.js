import { createHash } from 'node:crypto'
import { euclideanDistance, normalizeDescriptor, normalizeStoredDescriptors } from './descriptor-utils.js'

// Experimental quarantine selection only. These are NOT validated identity or
// anti-spoof thresholds and must never be used to approve attendance.
export const MEMORY_POLICY = Object.freeze({
  version: 'faceres-quarantine-v1', maxCandidates: 12, expiryDays: 30,
  maxOriginalDistance: .55, minOtherMargin: .18, maxFrameSpread: .20,
  minAntispoof: .80, minFaceScore: .90, minFacePixels: 80,
  minBrightness: 40, maxBrightness: 215, maxClippedFraction: .20,
  minSharpness: 40, minCandidateDiversity: .04,
})

export function validMemoryVector(vector) {
  return Array.isArray(vector) && vector.length === 1024
    && vector.every(value => typeof value === 'number' && Number.isFinite(value))
    && Math.abs(Math.hypot(...vector) - 1) <= .01
}

export function enrollmentFingerprint(person) {
  return createHash('sha256').update(JSON.stringify({
    model: person?.biometricModelVersion || '',
    descriptors: normalizeStoredDescriptors(person?.descriptors),
  })).digest('hex')
}

function originals(person) {
  const vectors = normalizeStoredDescriptors(person?.descriptors)
  return vectors.length > 0 && vectors.every(validMemoryVector) ? vectors.map(normalizeDescriptor) : []
}

export function assessMemoryCandidate({ person, frames, otherPersons, originalAccepted }) {
  const reject = reason => ({ ok: false, reason })
  if (originalAccepted !== true) return reject('original_match_required')
  const anchors = originals(person)
  if (anchors.length < 2) return reject('original_support_missing')
  if (!Array.isArray(frames) || frames.length !== 2) return reject('two_frames_required')
  if (!Array.isArray(otherPersons) || otherPersons.length === 0) return reject('competitor_evidence_missing')
  const otherAnchors = []
  for (const other of otherPersons) {
    if (other.id === person.id) continue
    const samples = originals(other)
    if (!samples.length) return reject('competitor_evidence_invalid')
    otherAnchors.push(...samples)
  }
  if (!otherAnchors.length) return reject('competitor_evidence_missing')
  const evidence = []
  for (const frame of frames) {
    if (!validMemoryVector(frame.descriptor)) return reject('invalid_descriptor')
    const q = frame.quality
    if (!q || ![q.faceScore, q.faceWidth, q.faceHeight, q.meanBrightness, q.clippedFraction, q.sharpness].every(Number.isFinite)
      || q.faceScore < MEMORY_POLICY.minFaceScore || q.faceScore > 1
      || Math.min(q.faceWidth, q.faceHeight) < MEMORY_POLICY.minFacePixels
      || q.meanBrightness < MEMORY_POLICY.minBrightness || q.meanBrightness > MEMORY_POLICY.maxBrightness
      || q.clippedFraction < 0 || q.clippedFraction > MEMORY_POLICY.maxClippedFraction
      || q.sharpness < MEMORY_POLICY.minSharpness) return reject('quality_insufficient')
    if (!Number.isFinite(frame.antispoof) || frame.antispoof < MEMORY_POLICY.minAntispoof || frame.antispoof > 1) return reject('antispoof_insufficient')
    const distances = anchors.map(anchor => euclideanDistance(anchor, frame.descriptor)).sort((a, b) => a - b)
    if (distances[1] > MEMORY_POLICY.maxOriginalDistance) return reject('original_support_insufficient')
    const otherDistance = otherAnchors.reduce((best, anchor) => Math.min(best, euclideanDistance(anchor, frame.descriptor)), Infinity)
    if (otherDistance - distances[0] < MEMORY_POLICY.minOtherMargin) return reject('competing_face_too_close')
    evidence.push({ bestDistance: distances[0], secondOriginalDistance: distances[1], otherDistance })
  }
  if (euclideanDistance(frames[0].descriptor, frames[1].descriptor) > MEMORY_POLICY.maxFrameSpread) return reject('inconsistent_frames')
  return { ok: true, frames, evidence }
}
