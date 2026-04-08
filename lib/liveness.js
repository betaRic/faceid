export const LIVENESS_CHALLENGES = [
  { id: 'blink', label: 'Blink both eyes' },
  { id: 'mouth', label: 'Open your mouth' },
]

export function pickLivenessChallenge() {
  return LIVENESS_CHALLENGES[Math.floor(Math.random() * LIVENESS_CHALLENGES.length)]
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

export function isLivenessChallengePassed(challengeId, analysis) {
  if (!analysis) return false
  if (challengeId === 'blink') return analysis.blinkDetected
  if (challengeId === 'mouth') return analysis.mouthOpenDetected
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
