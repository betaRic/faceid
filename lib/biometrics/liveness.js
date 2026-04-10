/**
 * lib/biometrics/liveness.js
 * Passive liveness detection — no user action required.
 *
 * Method: Landmark micro-movement variance analysis across frames.
 * face-api.js computes 68-point landmarks on every frame already.
 * A live face has natural micro-movement (head sway, breathing, eye micro-tremor).
 * A printed photo or frozen frame has near-zero landmark variance.
 *
 * Threat model:
 *   Stops: printed photo attacks, single-frame spoofs
 *   Does NOT stop: sophisticated video replay (needs IR/depth hardware — not feasible in browser)
 *   Mitigated by: admin audit trail, enrollment approval workflow, controlled kiosk placement
 *
 * Tune MIN_VARIANCE and MAX_VARIANCE after field testing on real devices and lighting.
 */

// Minimum frames needed to make a reliable liveness decision
const MIN_FRAMES = 12

// Landmark variance thresholds (px²)
// Below MIN = face is not moving naturally (photo or frozen video)
// Above MAX = too much movement for reliable capture (discard, not reject)
const MIN_VARIANCE = 1.5
const MAX_VARIANCE = 350

// Minimum frames that must have valid landmark data
const MIN_VALID_FRAMES = 8

// face-api.js 68-point landmark indices used for liveness
// Selected for natural micro-movement: nose, eye corners, mouth corners, chin
// These move together with natural breathing/micro-expressions
const LIVENESS_POINTS = [8, 27, 30, 36, 45, 48, 54]

/**
 * Analyze liveness from collected frame landmarks.
 *
 * @param {Array} frameLandmarks
 *   Array of face-api landmark position arrays, one entry per captured frame.
 *   Each entry is the .landmarks.positions array from a face detection result.
 *
 * @returns {{ live: boolean, reason: string, variance: number, framesAnalyzed: number }}
 */
export function analyzeLiveness(frameLandmarks) {
  if (!Array.isArray(frameLandmarks) || frameLandmarks.length < MIN_FRAMES) {
    return {
      live: false,
      reason: 'insufficient_frames',
      variance: 0,
      framesAnalyzed: frameLandmarks?.length ?? 0,
    }
  }

  // Per-landmark: compute spatial variance across all frames
  const variances = LIVENESS_POINTS.map(pointIndex => {
    const positions = frameLandmarks
      .map(landmarks => {
        const pt = landmarks?.[pointIndex]
        if (!pt) return null
        // face-api.js uses ._x/_y (private) or .x/.y depending on version
        const x = pt._x ?? pt.x
        const y = pt._y ?? pt.y
        return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
      })
      .filter(Boolean)

    if (positions.length < MIN_VALID_FRAMES) return null

    const meanX = positions.reduce((s, p) => s + p.x, 0) / positions.length
    const meanY = positions.reduce((s, p) => s + p.y, 0) / positions.length
    return positions.reduce((s, p) => s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / positions.length
  }).filter(v => v !== null)

  if (variances.length < 3) {
    return {
      live: false,
      reason: 'insufficient_landmark_data',
      variance: 0,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  // Use median over mean — more robust against one twitchy landmark outlier
  const sorted = [...variances].sort((a, b) => a - b)
  const medianVariance = sorted[Math.floor(sorted.length / 2)]

  if (medianVariance < MIN_VARIANCE) {
    return {
      live: false,
      reason: 'static_face',
      variance: medianVariance,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  if (medianVariance > MAX_VARIANCE) {
    // Too much movement = unstable capture, not a spoof.
    // Tell the user to hold still rather than rejecting them permanently.
    return {
      live: false,
      reason: 'excessive_movement',
      variance: medianVariance,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  return {
    live: true,
    reason: 'ok',
    variance: medianVariance,
    framesAnalyzed: frameLandmarks.length,
  }
}

/**
 * Convenience: extract landmark positions array from a face-api.js detection result.
 * Call this on each frame result before passing to analyzeLiveness.
 *
 * @param {object} detectionResult - result from detectSingleFace().withFaceLandmarks()
 * @returns {Array|null}
 */
export function extractLandmarkPositions(detectionResult) {
  return detectionResult?.landmarks?.positions ?? null
}
