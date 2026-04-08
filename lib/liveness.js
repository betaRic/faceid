export const LIVENESS_CHALLENGES = [
  { id: 'any', label: 'Blink or open your mouth' },
  { id: 'blink', label: 'Blink both eyes' },
  { id: 'mouth', label: 'Open your mouth' },
]

export function pickLivenessChallenge(preferredId = 'any') {
  return LIVENESS_CHALLENGES.find(challenge => challenge.id === preferredId)
    || LIVENESS_CHALLENGES[Math.floor(Math.random() * LIVENESS_CHALLENGES.length)]
}

export function analyzeLiveness(detection) {
  const landmarks = detection?.landmarks
  if (!landmarks?.getLeftEye || !landmarks?.getRightEye || !landmarks?.getMouth) {
    return {
      blinkDetected: false,
      mouthOpenDetected: false,
      eyeAspectRatio: null,
      mouthAspectRatio: null,
    }
  }

  const leftEye = landmarks.getLeftEye()
  const rightEye = landmarks.getRightEye()
  const mouth = landmarks.getMouth()

  const leftEar = calculateEyeAspectRatio(leftEye)
  const rightEar = calculateEyeAspectRatio(rightEye)
  const eyeAspectRatio = (leftEar + rightEar) / 2
  const mouthAspectRatio = calculateMouthAspectRatio(mouth)

  return {
    blinkDetected: eyeAspectRatio < 0.19,
    mouthOpenDetected: mouthAspectRatio > 0.33,
    eyeAspectRatio,
    mouthAspectRatio,
  }
}

export function createLivenessTracker() {
  return {
    baselineEar: null,
    baselineMar: null,
    openEyeFrames: 0,
    closedEyeFrames: 0,
    openMouthFrames: 0,
  }
}

export function updateLivenessTracker(tracker, analysis) {
  if (!analysis) return { ...tracker }

  const next = { ...tracker }
  const ear = analysis.eyeAspectRatio
  const mar = analysis.mouthAspectRatio

  if (Number.isFinite(ear)) {
    const likelyOpenEyes = ear > 0.2
    if (likelyOpenEyes) {
      next.baselineEar = next.baselineEar == null ? ear : (next.baselineEar * 0.8) + (ear * 0.2)
      next.openEyeFrames += 1
    } else {
      next.openEyeFrames = 0
    }

    const blinkThreshold = next.baselineEar == null
      ? 0.21
      : Math.max(0.16, next.baselineEar * 0.72)

    next.closedEyeFrames = ear <= blinkThreshold ? next.closedEyeFrames + 1 : 0
  }

  if (Number.isFinite(mar)) {
    const likelyClosedMouth = mar < 0.34
    if (likelyClosedMouth) {
      next.baselineMar = next.baselineMar == null ? mar : (next.baselineMar * 0.8) + (mar * 0.2)
    }

    const mouthThreshold = next.baselineMar == null
      ? 0.36
      : Math.max(0.36, next.baselineMar * 1.45)

    next.openMouthFrames = mar >= mouthThreshold ? next.openMouthFrames + 1 : 0
  }

  return next
}

export function isLivenessChallengePassed(challengeId, analysis) {
  if (!analysis) return false
  if (challengeId === 'any') return analysis.blinkDetected || analysis.mouthOpenDetected
  if (challengeId === 'blink') return analysis.blinkDetected
  if (challengeId === 'mouth') return analysis.mouthOpenDetected
  return false
}

export function hasLivenessTrackerPassed(challengeId, tracker) {
  if (!tracker) return false

  const blinkPassed = tracker.openEyeFrames >= 2 && tracker.closedEyeFrames >= 1
  const mouthPassed = tracker.openMouthFrames >= 2

  if (challengeId === 'any') return blinkPassed || mouthPassed
  if (challengeId === 'blink') return blinkPassed
  if (challengeId === 'mouth') return mouthPassed
  return false
}

function calculateEyeAspectRatio(eyePoints) {
  if (!eyePoints || eyePoints.length < 6) return 1

  const verticalOne = distance(eyePoints[1], eyePoints[5])
  const verticalTwo = distance(eyePoints[2], eyePoints[4])
  const horizontal = distance(eyePoints[0], eyePoints[3]) || 1

  return (verticalOne + verticalTwo) / (2 * horizontal)
}

function calculateMouthAspectRatio(mouthPoints) {
  if (!mouthPoints || mouthPoints.length < 8) return 0

  const top = mouthPoints[3]
  const bottom = mouthPoints[9] || mouthPoints[mouthPoints.length - 3]
  const left = mouthPoints[0]
  const right = mouthPoints[6]
  const horizontal = distance(left, right) || 1

  return distance(top, bottom) / horizontal
}

function distance(left, right) {
  const dx = left.x - right.x
  const dy = left.y - right.y
  return Math.sqrt((dx * dx) + (dy * dy))
}
