const MIN_FRAMES = 6
const MIN_VARIANCE = 0.8
const MAX_VARIANCE = 400
const MIN_VALID_FRAMES = 4

// MediaPipe face mesh indices — stable landmarks with natural micro-movement
const LIVENESS_POINTS = [1, 4, 6, 9, 33, 263, 61, 291, 199]

function extractXY(pt) {
  if (!pt) return null
  // Human library: [x, y, z] array
  if (Array.isArray(pt)) {
    const x = pt[0]
    const y = pt[1]
    return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
  }
  // face-api.js / other: object with _x/_y or x/y
  const x = pt._x ?? pt.x
  const y = pt._y ?? pt.y
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
}

/**
 * Analyze liveness from collected frame landmarks.
 *
 * @param {Array} frameLandmarks - Array of landmark position arrays, one per frame.
 * @returns {{ live: boolean, reason: string, variance: number, framesAnalyzed: number }}
 */
export function analyzeLiveness(frameLandmarks) {
  if (!Array.isArray(frameLandmarks) || frameLandmarks.length < MIN_FRAMES) {
    // Not enough data to make a determination — fail open (assume live)
    return {
      live: true,
      reason: 'insufficient_frames_assumed_live',
      variance: 0,
      framesAnalyzed: frameLandmarks?.length ?? 0,
    }
  }

  const variances = LIVENESS_POINTS.map(pointIndex => {
    const positions = frameLandmarks
      .map(landmarks => {
        const pt = Array.isArray(landmarks) ? landmarks[pointIndex] : null
        return extractXY(pt)
      })
      .filter(Boolean)

    if (positions.length < MIN_VALID_FRAMES) return null

    const meanX = positions.reduce((s, p) => s + p.x, 0) / positions.length
    const meanY = positions.reduce((s, p) => s + p.y, 0) / positions.length
    return positions.reduce((s, p) => s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / positions.length
  }).filter(v => v !== null)

  if (variances.length < 3) {
    // Not enough landmark data — fail open
    return {
      live: true,
      reason: 'insufficient_landmark_data_assumed_live',
      variance: 0,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  const sorted = [...variances].sort((a, b) => a - b)
  const medianVariance = sorted[Math.floor(sorted.length / 2)]

  if (medianVariance < MIN_VARIANCE) {
    // Confirmed static face — block this
    return {
      live: false,
      reason: 'static_face',
      variance: medianVariance,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  if (medianVariance > MAX_VARIANCE) {
    // Too much movement — unstable capture, not a spoof, allow
    return {
      live: true,
      reason: 'excessive_movement_allowed',
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
 * Extract landmark positions from a Human library face result.
 * Human returns face.mesh as array of [x, y, z] points.
 */
export function extractLandmarkPositions(faceResult) {
  // Human library path
  if (faceResult?.mesh) return faceResult.mesh
  // face-api.js path
  return faceResult?.landmarks?.positions ?? null
}