/**
 * lib/biometrics/liveness.js
 *
 * Passive anti-spoof + liveness detection from verification burst frames.
 *
 * Design (revised):
 * - Human's trained antispoof model is a HARD GATE (not a scoring contribution).
 *   Real faces score > 0.85; printed photos and phone screens score < 0.5.
 *   A single burst-averaged antispoof below ANTISPOOF_HARD_MIN fails the burst
 *   regardless of any other signal.
 * - Passing requires ONE eye-based signal AND ONE motion-based signal. This
 *   enforces two genuinely independent physiological axes:
 *     * Eye-based:    blink OR EAR variance
 *     * Motion-based: mesh micro-movement OR iris motion
 *   A blink without any head/iris motion is a mask-with-eye-cutout pattern; a
 *   head that moves without any eye variation is a rigid photo held at angle.
 *   Both axes required.
 * - Iris motion tracks MediaPipe iris landmarks (mesh indices 468-477). Real
 *   eyes micro-saccade constantly; a printed photo's iris is perfectly still.
 *
 * Tamper resistance, not zero-trust: the server re-derives the decision in
 * `validateLivenessEvidence` from the client-sent summary arrays. This defeats
 * naive bypass (client setting `pass: true`) but a sophisticated attacker can
 * forge physiologically-plausible arrays. The descriptors are generated
 * server-side from submitted still frames, but the frames and liveness evidence
 * still originate from the browser.
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

// MediaPipe iris landmarks (Human with iris enabled appends these after index 467).
// Layout per MediaPipe: 468 = right iris center, 473 = left iris center.
// We track both centers' inter-frame displacement.
const IRIS_LANDMARKS = [468, 473]

const EAR_BLINK_THRESHOLD = 0.18
const EAR_OPEN_MIN = 0.22
const MICRO_MOVEMENT_LIVE_MIN = 0.25
const IRIS_MOTION_LIVE_MIN = 0.20
const EAR_VARIANCE_LIVE_MIN = 0.001
const MIN_LIVENESS_FRAMES = 3

// PAD thresholds
const ANTISPOOF_HARD_MIN = 0.6  // below this, reject regardless of other signals
const LIVENESS_SOFT_MIN = 0.5   // Human liveness head — supplementary

// Static image gate (applied before scoring)
const STATIC_IMAGE_MOVEMENT_MAX = 0.15
const STATIC_IMAGE_EAR_VARIANCE_MAX = 0.0003
const STATIC_IMAGE_IRIS_MOTION_MAX = 0.08

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

export function computeIrisDelta(meshA, meshB) {
  if (!meshA || !meshB) return null
  let total = 0
  let count = 0
  for (const idx of IRIS_LANDMARKS) {
    const a = getMeshPoint(meshA, idx)
    const b = getMeshPoint(meshB, idx)
    const d = dist2d(a, b)
    if (d !== null) { total += d; count++ }
  }
  return count > 0 ? total / count : null
}

function detectBlinks(earSamples) {
  // Start `wasOpen = true` so a sample that begins with eyes already open
  // does not count the first frame as a blink. Blinks are counted only on
  // genuine closed→open transitions.
  let blinks = 0
  let wasOpen = true

  for (const ear of earSamples) {
    if (ear === null) continue
    if (ear >= EAR_OPEN_MIN) {
      if (!wasOpen) blinks++
      wasOpen = true
    } else if (ear < EAR_BLINK_THRESHOLD) {
      wasOpen = false
    }
  }

  return blinks > 0 && earSamples.filter(e => e !== null).length >= 2 ? blinks : 0
}

function variance(values) {
  const valid = values.filter(v => v !== null && Number.isFinite(v))
  if (valid.length < 2) return 0
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length
  return valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length
}

function averageOf(values) {
  const valid = values.filter(v => v !== null && Number.isFinite(v))
  if (valid.length === 0) return null
  return valid.reduce((s, v) => s + v, 0) / valid.length
}

function hasEyeSignal({ blinkCount, earVar }) {
  return blinkCount > 0 || earVar > EAR_VARIANCE_LIVE_MIN
}

function hasMotionSignal({ avgDelta, avgIrisDelta }) {
  return (
    avgDelta >= MICRO_MOVEMENT_LIVE_MIN
    || (avgIrisDelta !== null && avgIrisDelta >= IRIS_MOTION_LIVE_MIN)
  )
}

function summarizeSignals(metrics) {
  return {
    eye: hasEyeSignal(metrics),
    motion: hasMotionSignal(metrics),
  }
}

function round4(value) {
  return value !== null && Number.isFinite(value) ? Math.round(value * 10000) / 10000 : value
}

/**
 * Analyze liveness from verification burst frames.
 *
 * @param {Array} frames - Each frame: { primary: { detection: { landmarks, antispoof, liveness } } }
 * @returns {object} Raw measurements + pass/fail decision.
 */
export function analyzeBurstLiveness(frames) {
  if (!Array.isArray(frames) || frames.length < MIN_LIVENESS_FRAMES) {
    return {
      earSamples: [],
      meshDeltas: [],
      irisDeltas: [],
      blinkCount: 0,
      earVariance: 0,
      avgMeshDelta: 0,
      avgIrisDelta: null,
      avgAntispoof: null,
      avgLiveness: null,
      hasEyeSignal: false,
      hasMotionSignal: false,
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
  const irisDeltas = []
  for (let i = 1; i < meshes.length; i++) {
    meshDeltas.push(computeMeshDelta(meshes[i - 1], meshes[i]))
    irisDeltas.push(computeIrisDelta(meshes[i - 1], meshes[i]))
  }

  const blinkCount = detectBlinks(earSamples)
  const earVar = variance(earSamples)
  const avgDelta = averageOf(meshDeltas) ?? 0
  const avgIrisDelta = averageOf(irisDeltas)
  const avgAntispoof = averageOf(frames.map(f => f?.primary?.detection?.antispoof))
  const avgLiveness = averageOf(frames.map(f => f?.primary?.detection?.liveness))

  const signals = summarizeSignals({ blinkCount, earVar, avgDelta, avgIrisDelta })

  // --- Decision ---

  // Hard gate 1: PAD floor. Human's trained antispoof head is our strongest single
  // signal against printed photos and phone screens. Fail fast here.
  if (avgAntispoof !== null && avgAntispoof < ANTISPOOF_HARD_MIN) {
    return buildResult({
      earSamples, meshDeltas, irisDeltas, blinkCount, earVar, avgDelta,
      avgIrisDelta, avgAntispoof, avgLiveness, signals,
      frameCount: frames.length, score: 0, pass: false, reason: 'antispoof_failed',
    })
  }

  // Hard gate 2: static image — no temporal variation at all.
  const irisLooksStatic = avgIrisDelta === null || avgIrisDelta < STATIC_IMAGE_IRIS_MOTION_MAX
  if (
    avgDelta < STATIC_IMAGE_MOVEMENT_MAX
    && earVar < STATIC_IMAGE_EAR_VARIANCE_MAX
    && irisLooksStatic
  ) {
    return buildResult({
      earSamples, meshDeltas, irisDeltas, blinkCount, earVar, avgDelta,
      avgIrisDelta, avgAntispoof, avgLiveness, signals,
      frameCount: frames.length, score: 0, pass: false, reason: 'static_image_detected',
    })
  }

  // Gate 3: require one eye-based signal AND one motion-based signal.
  if (!signals.eye || !signals.motion) {
    return buildResult({
      earSamples, meshDeltas, irisDeltas, blinkCount, earVar, avgDelta,
      avgIrisDelta, avgAntispoof, avgLiveness, signals,
      frameCount: frames.length, score: 0, pass: false,
      reason: !signals.eye ? 'missing_eye_signal' : 'missing_motion_signal',
    })
  }

  // Scoring for diagnostics (not used as a gate — the gates above decide).
  let score = 0.40 // base credit for passing both axes
  if (blinkCount > 0) score += 0.15
  if (earVar > EAR_VARIANCE_LIVE_MIN) score += 0.10
  if (avgDelta >= MICRO_MOVEMENT_LIVE_MIN) score += 0.10
  if (avgIrisDelta !== null && avgIrisDelta >= IRIS_MOTION_LIVE_MIN) score += 0.15
  if (avgLiveness !== null && avgLiveness >= LIVENESS_SOFT_MIN) score += 0.05
  score = Math.min(1, Math.max(0, score))

  return buildResult({
    earSamples, meshDeltas, irisDeltas, blinkCount, earVar, avgDelta,
    avgIrisDelta, avgAntispoof, avgLiveness, signals,
    frameCount: frames.length, score, pass: true, reason: '',
  })
}

function buildResult(raw) {
  return {
    earSamples: raw.earSamples.map(round4),
    meshDeltas: raw.meshDeltas.map(round4),
    irisDeltas: raw.irisDeltas.map(round4),
    blinkCount: raw.blinkCount,
    earVariance: Math.round(raw.earVar * 100000) / 100000,
    avgMeshDelta: round4(raw.avgDelta),
    avgIrisDelta: round4(raw.avgIrisDelta),
    avgAntispoof: round4(raw.avgAntispoof),
    avgLiveness: round4(raw.avgLiveness),
    hasEyeSignal: Boolean(raw.signals?.eye),
    hasMotionSignal: Boolean(raw.signals?.motion),
    frameCount: raw.frameCount,
    score: Math.round(raw.score * 1000) / 1000,
    pass: raw.pass,
    reason: raw.reason,
  }
}

/**
 * Server-side validation. Re-derives the decision from raw measurements so a
 * tampered client payload cannot bypass the gates by setting `pass: true`.
 */
export function validateLivenessEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, reason: 'missing_liveness_evidence' }
  }

  const earSamples = Array.isArray(evidence.earSamples) ? evidence.earSamples : []
  const meshDeltas = Array.isArray(evidence.meshDeltas) ? evidence.meshDeltas : []
  const irisDeltas = Array.isArray(evidence.irisDeltas) ? evidence.irisDeltas : []
  const frameCount = Number(evidence.frameCount || 0)

  if (frameCount < MIN_LIVENESS_FRAMES || earSamples.length < MIN_LIVENESS_FRAMES) {
    return { ok: false, reason: 'insufficient_liveness_frames' }
  }

  const validEar = earSamples.filter(v => v !== null && Number.isFinite(v))
  const validDeltas = meshDeltas.filter(v => v !== null && Number.isFinite(v))
  const validIris = irisDeltas.filter(v => v !== null && Number.isFinite(v))
  const earVar = variance(validEar)
  const avgDelta = validDeltas.length > 0
    ? validDeltas.reduce((s, v) => s + v, 0) / validDeltas.length
    : 0
  const avgIrisDelta = validIris.length > 0
    ? validIris.reduce((s, v) => s + v, 0) / validIris.length
    : null
  const blinkCount = detectBlinks(earSamples)
  const avgAntispoof = Number.isFinite(evidence.avgAntispoof) ? evidence.avgAntispoof : null
  const avgLiveness = Number.isFinite(evidence.avgLiveness) ? evidence.avgLiveness : null

  if (avgAntispoof !== null && avgAntispoof < ANTISPOOF_HARD_MIN) {
    return { ok: false, reason: 'antispoof_hard_fail' }
  }

  const irisLooksStatic = avgIrisDelta === null || avgIrisDelta < STATIC_IMAGE_IRIS_MOTION_MAX
  if (
    avgDelta < STATIC_IMAGE_MOVEMENT_MAX
    && earVar < STATIC_IMAGE_EAR_VARIANCE_MAX
    && irisLooksStatic
  ) {
    return { ok: false, reason: 'static_image_detected' }
  }

  const signals = summarizeSignals({ blinkCount, earVar, avgDelta, avgIrisDelta })
  if (!signals.eye) {
    return { ok: false, reason: 'missing_eye_signal' }
  }
  if (!signals.motion) {
    return { ok: false, reason: 'missing_motion_signal' }
  }

  return {
    ok: true,
    hasEyeSignal: true,
    hasMotionSignal: true,
    blinkCount,
    earVariance: earVar,
    avgMeshDelta: avgDelta,
    avgIrisDelta,
    avgAntispoof,
    avgLiveness,
  }
}
