import {
  MIN_FACE_BOX_RATIO,
  MIN_FACE_CENTER_RATIO,
  MIN_CAPTURE_QUALITY_SCORE,
} from './config'

export function evaluateDetectionQuality(detection, frameWidth, frameHeight) {
  const box = detection?.detection?.box
  if (!box || !frameWidth || !frameHeight) {
    return {
      ok: false,
      score: 0,
      reason: 'Face bounds are unavailable.',
    }
  }

  const shorterSide = Math.min(frameWidth, frameHeight)
  const boxRatio = Math.min(box.width, box.height) / shorterSide
  const centerX = box.x + (box.width / 2)
  const centerY = box.y + (box.height / 2)
  const offsetX = Math.abs(centerX - (frameWidth / 2)) / (frameWidth / 2)
  const offsetY = Math.abs(centerY - (frameHeight / 2)) / (frameHeight / 2)
  const centeredness = Math.max(0, 1 - ((offsetX + offsetY) / 2))
  const faceSizeScore = Math.min(1, boxRatio / MIN_FACE_BOX_RATIO)
  const centerScore = Math.min(1, centeredness / MIN_FACE_CENTER_RATIO)
  const score = (faceSizeScore * 0.6) + (centerScore * 0.4)

  if (boxRatio < MIN_FACE_BOX_RATIO) {
    return {
      ok: false,
      score,
      reason: 'Move closer so the face fills more of the frame.',
    }
  }

  if (centeredness < MIN_FACE_CENTER_RATIO) {
    return {
      ok: false,
      score,
      reason: 'Center the face more clearly in the frame.',
    }
  }

  if (score < MIN_CAPTURE_QUALITY_SCORE) {
    return {
      ok: false,
      score,
      reason: 'Face quality is too weak for reliable matching.',
    }
  }

  return {
    ok: true,
    score,
    reason: null,
  }
}
