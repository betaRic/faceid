import {
  MIN_FACE_BOX_RATIO,
  MIN_FACE_CENTER_RATIO,
  MIN_CAPTURE_QUALITY_SCORE,
} from './config'

function getCanvasContext(frameSource) {
  if (!frameSource || typeof frameSource.getContext !== 'function') return null
  return frameSource.getContext('2d', { willReadFrequently: true })
}

function analyzeFrame(frameSource) {
  const ctx = getCanvasContext(frameSource)
  const width = frameSource?.width || 0
  const height = frameSource?.height || 0

  if (!ctx || !width || !height) {
    return {
      brightness: null,
      sharpness: null,
    }
  }

  const { data } = ctx.getImageData(0, 0, width, height)
  let brightnessTotal = 0
  let sharpnessTotal = 0
  let sampleCount = 0
  const stride = 4
  const rowStride = width * stride
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120))

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const index = (y * width + x) * stride
      const luma = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114)
      const left = index - stride
      const up = index - rowStride
      const leftLuma = (data[left] * 0.299) + (data[left + 1] * 0.587) + (data[left + 2] * 0.114)
      const upLuma = (data[up] * 0.299) + (data[up + 1] * 0.587) + (data[up + 2] * 0.114)

      brightnessTotal += luma
      sharpnessTotal += Math.abs(luma - leftLuma) + Math.abs(luma - upLuma)
      sampleCount += 1
    }
  }

  if (!sampleCount) {
    return {
      brightness: null,
      sharpness: null,
    }
  }

  return {
    brightness: brightnessTotal / sampleCount,
    sharpness: sharpnessTotal / sampleCount,
  }
}

export function evaluateDetectionQuality(detection, frameWidth, frameHeight, frameSource = null) {
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
  const frame = analyzeFrame(frameSource)
  const brightnessScore = frame.brightness == null ? 1 : Math.max(0, Math.min(1, frame.brightness / 90))
  const sharpnessScore = frame.sharpness == null ? 1 : Math.max(0, Math.min(1, frame.sharpness / 18))
  const score = (faceSizeScore * 0.45) + (centerScore * 0.3) + (brightnessScore * 0.15) + (sharpnessScore * 0.1)

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

  if (frame.brightness != null && frame.brightness < 45) {
    return {
      ok: false,
      score,
      reason: 'Lighting is too dim. Move closer to any available light source.',
    }
  }

  if (frame.sharpness != null && frame.sharpness < 5) {
    return {
      ok: false,
      score,
      reason: 'Hold still for a moment so the camera can capture a sharper frame.',
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
    brightness: frame.brightness,
    sharpness: frame.sharpness,
  }
}
