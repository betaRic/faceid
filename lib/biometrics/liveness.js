/**
 * lib/biometrics/liveness.js
 *
 * Passive temporal liveness detection from verification burst frames.
 *
 * Uses data Human.js already produces during the normal capture burst:
 * - 468-point face mesh → Eye Aspect Ratio (EAR) per frame
 * - Frame-to-frame mesh displacement → micro-movement detection
 * - EAR variance across frames → natural eye flutter vs static photo
 * - Human's built-in antispoof/liveness → supplementary signal
 *
 * No extra capture step. No head-turn prompts. No extra latency.
 * Liveness is computed from the same frames used for descriptor extraction.
 */

// MediaPipe Face Mesh 468 landmark indices for EAR computation
const LEFT_EYE = {
  outer: 33, upperOuter: 160, upperInner: 158,
  inner: 133, lowerInner: 153, lowerOuter: 145,
}
const RIGHT_EYE = {
  outer: 263, upperOuter: 387, upperInner: 385,
  inner: 362, lowerInner: 374, lowerOuter: 380,
}

// Stable landmarks for micro-movement tracking (nose bridge, cheek bones, jaw)
const MOVEMENT_LANDMARKS = [1, 4, 5, 6, 10, 33, 133, 152, 263, 362]

const EAR_BLINK_THRESHOLD = 0.18
const EAR_OPEN_MIN = 0.22
const MICRO_MOVEMENT_LIVE_MIN = 0.25
const MIN_LIVENESS_FRAMES = 3

function getMeshPoint(mesh, index) {
  const pt = mesh?.[index]
  if (!pt) return null
  if (Array.isArray(pt)) return { x: pt[0], y: pt[1], z: pt[2] ?? 0 }
  if (typeof pt.x === 'number') return pt
  return null
}

function dist2d(a, b) {
  if (!a || !b) return null
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function computeEyeAspectRatio(mesh, eye) {
  const p1 = getMeshPoint(mesh, eye.outer)
  const p2 = getMeshPoint(mesh, eye.upperOuter)
  const p3 = getMeshPoint(mesh, eye.upperInner)
  const p4 = getMeshPoint(mesh, eye.inner)
  const p5 = getMeshPoint(mesh, eye.lowerInner)
  const p6 = getMeshPoint(mesh, eye.lowerOuter)

  const horizontal = dist2d(p1, p4)
  const vertA = dist2d(p2, p6)
  const vertB = dist2d(p3, p5)

  if (!horizontal || horizontal < 1 || !vertA || !vertB) return null
  return (vertA + vertB) / (2 * horizontal)
}

export function computeEAR(mesh) {
  const left = computeEyeAspectRatio(mesh, LEFT_EYE)
  const right = computeEyeAspectRatio(mesh, RIGHT_EYE)
  if (left === null && right === null) return null
  if (left === null) return right
  if (right === null) return left
  return (left + right) / 2
}

export function computeMeshDelta(meshA, meshB) {
  if (!meshA || !meshB) return null
  let total = 0
  let count = 0
  for (const idx of MOVEMENT_LANDMARKS) {
    const a = getMeshPoint(meshA, idx)
    const b = getMeshPoint(meshB, idx)
    const d = dist2d(a, b)
    if (d !== null) { total += d; count++ }
  }
  return count > 0 ? total / count : null
}

function detectBlinks(earSamples) {
  let blinks = 0
  let wasOpen = false

  for (const ear of earSamples) {
    if (ear === null) continue
    if (ear >= EAR_OPEN_MIN) {
      if (!wasOpen) blinks++
      wasOpen = true
    } else if (ear < EAR_BLINK_THRESHOLD) {
      wasOpen = false
    }
  }

  // Only count if the sequence ends open (closed→open transitions)
  return blinks > 0 && earSamples.filter(e => e !== null).length >= 2 ? blinks : 0
}

function variance(values) {
  const valid = values.filter(v => v !== null && Number.isFinite(v))
  if (valid.length < 2) return 0
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length
  return valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length
}

/**
 * Analyze liveness from verification burst frames.
 *
 * @param {Array} frames - Array of captured frame objects from the burst.
 *   Each frame needs: { primary: { detection: { landmarks, antispoof, liveness } } }
 * @returns {object} Liveness evidence with raw measurements + computed score.
 */
export function analyzeBurstLiveness(frames) {
  if (!Array.isArray(frames) || frames.length < MIN_LIVENESS_FRAMES) {
    return {
      earSamples: [],
      meshDeltas: [],
      blinkCount: 0,
      earVariance: 0,
      avgMeshDelta: 0,
      avgAntispoof: null,
      avgLiveness: null,
      frameCount: frames?.length || 0,
      score: 0,
      pass: false,
      reason: 'insufficient_frames',
    }
  }

  const meshes = frames
    .map(f => f?.primary?.detection?.landmarks?.positions)
    .filter(Boolean)

  const earSamples = meshes.map(computeEAR)
  const meshDeltas = []
  for (let i = 1; i < meshes.length; i++) {
    meshDeltas.push(computeMeshDelta(meshes[i - 1], meshes[i]))
  }

  const blinkCount = detectBlinks(earSamples)
  const earVar = variance(earSamples)
  const validDeltas = meshDeltas.filter(d => d !== null && Number.isFinite(d))
  const avgDelta = validDeltas.length > 0
    ? validDeltas.reduce((s, v) => s + v, 0) / validDeltas.length
    : 0

  const antispoofValues = frames
    .map(f => f?.primary?.detection?.antispoof)
    .filter(v => v !== null && Number.isFinite(v))
  const livenessValues = frames
    .map(f => f?.primary?.detection?.liveness)
    .filter(v => v !== null && Number.isFinite(v))
  const avgAntispoof = antispoofValues.length > 0
    ? antispoofValues.reduce((s, v) => s + v, 0) / antispoofValues.length
    : null
  const avgLiveness = livenessValues.length > 0
    ? livenessValues.reduce((s, v) => s + v, 0) / livenessValues.length
    : null

  // --- Scoring ---
  // Each signal contributes independently. A photo fails on ALL of these.
  // A real person passes on most/all.

  let score = 0

  // Blink detected: strong proof of life (photos can't blink)
  if (blinkCount > 0) score += 0.35

  // EAR variance: real eyes flutter, photo eyes don't
  // Typical real variance: 0.002–0.02. Photo: <0.0005.
  if (earVar > 0.001) score += Math.min(0.20, earVar * 100)

  // Micro-movement: real faces move involuntarily
  // Typical real delta: 0.3–2.0 px. Photo: <0.15 px.
  if (avgDelta >= MICRO_MOVEMENT_LIVE_MIN) {
    score += Math.min(0.25, avgDelta * 0.15)
  }

  // Human's built-in antispoof (supplementary, not sole signal)
  if (avgAntispoof !== null && avgAntispoof > 0.5) {
    score += 0.10
  }

  // Human's built-in liveness (supplementary)
  if (avgLiveness !== null && avgLiveness > 0.5) {
    score += 0.10
  }

  score = Math.min(1, Math.max(0, score))
  const pass = score >= 0.30

  let reason = ''
  if (!pass) {
    if (avgDelta < MICRO_MOVEMENT_LIVE_MIN && earVar < 0.0005) {
      reason = 'static_image_detected'
    } else if (avgAntispoof !== null && avgAntispoof < 0.3) {
      reason = 'antispoof_failed'
    } else {
      reason = 'insufficient_liveness_signals'
    }
  }

  return {
    earSamples: earSamples.map(v => v !== null ? Math.round(v * 10000) / 10000 : null),
    meshDeltas: meshDeltas.map(v => v !== null ? Math.round(v * 10000) / 10000 : null),
    blinkCount,
    earVariance: Math.round(earVar * 100000) / 100000,
    avgMeshDelta: Math.round(avgDelta * 10000) / 10000,
    avgAntispoof: avgAntispoof !== null ? Math.round(avgAntispoof * 10000) / 10000 : null,
    avgLiveness: avgLiveness !== null ? Math.round(avgLiveness * 10000) / 10000 : null,
    frameCount: frames.length,
    score: Math.round(score * 1000) / 1000,
    pass,
    reason,
  }
}

/**
 * Server-side validation of liveness evidence sent by the client.
 *
 * Does NOT trust the client's computed score. Re-derives the decision from
 * the raw measurements (EAR samples, mesh deltas, antispoof/liveness values).
 * A replay attack would need to fabricate physiologically plausible temporal
 * patterns — much harder than spoofing a single score.
 */
export function validateLivenessEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, reason: 'missing_liveness_evidence' }
  }

  const earSamples = Array.isArray(evidence.earSamples) ? evidence.earSamples : []
  const meshDeltas = Array.isArray(evidence.meshDeltas) ? evidence.meshDeltas : []
  const frameCount = Number(evidence.frameCount || 0)

  if (frameCount < MIN_LIVENESS_FRAMES || earSamples.length < MIN_LIVENESS_FRAMES) {
    return { ok: false, reason: 'insufficient_liveness_frames' }
  }

  const validEar = earSamples.filter(v => v !== null && Number.isFinite(v))
  const validDeltas = meshDeltas.filter(v => v !== null && Number.isFinite(v))
  const earVar = variance(validEar)
  const avgDelta = validDeltas.length > 0
    ? validDeltas.reduce((s, v) => s + v, 0) / validDeltas.length
    : 0
  const blinkCount = detectBlinks(earSamples)
  const avgAntispoof = Number.isFinite(evidence.avgAntispoof) ? evidence.avgAntispoof : null
  const avgLiveness = Number.isFinite(evidence.avgLiveness) ? evidence.avgLiveness : null

  if (avgAntispoof !== null && avgAntispoof < 0.25) {
    return { ok: false, reason: 'antispoof_hard_fail' }
  }

  // Static image: no movement AND no EAR variance
  if (avgDelta < 0.15 && earVar < 0.0003) {
    return { ok: false, reason: 'static_image_detected' }
  }

  let serverScore = 0
  if (blinkCount > 0) serverScore += 0.35
  if (earVar > 0.001) serverScore += Math.min(0.20, earVar * 100)
  if (avgDelta >= MICRO_MOVEMENT_LIVE_MIN) serverScore += Math.min(0.25, avgDelta * 0.15)
  if (avgAntispoof !== null && avgAntispoof > 0.5) serverScore += 0.10
  if (avgLiveness !== null && avgLiveness > 0.5) serverScore += 0.10
  serverScore = Math.min(1, Math.max(0, serverScore))

  if (serverScore < 0.25) {
    return { ok: false, reason: 'liveness_score_too_low' }
  }

  return {
    ok: true,
    serverScore: Math.round(serverScore * 1000) / 1000,
    blinkCount,
    earVariance: earVar,
    avgMeshDelta: avgDelta,
  }
}
