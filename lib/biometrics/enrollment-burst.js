import { euclideanDistance } from './descriptor-utils'

export const ENROLLMENT_MIN_SAMPLES = 3
export const ENROLLMENT_BURST_CAPTURE_ATTEMPTS = 7
export const ENROLLMENT_BURST_CAPTURE_INTERVAL_MS = 140
export const ENROLLMENT_TARGET_BURST_SAMPLES = 3
export const ENROLLMENT_MAX_BATCH_SAMPLES = 3

const TARGET_FACE_AREA_RATIO = 0.18
const TARGET_BRIGHTNESS = 138
const BRIGHTNESS_RANGE = 72
const TARGET_CONTRAST = 34
const TARGET_SHARPNESS = 30
const MIN_DESCRIPTOR_DIVERSITY = 0.06
const MIN_FRAME_GAP = 2

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function normalizeEnrollmentDescriptorBatch(value, maxCount = ENROLLMENT_MAX_BATCH_SAMPLES) {
  const rawDescriptors = Array.isArray(value) && typeof value[0] === 'number'
    ? [value]
    : safeArray(value)

  return rawDescriptors
    .slice(0, maxCount)
    .map(descriptor => safeArray(descriptor).map(Number))
}

export function validateEnrollmentDescriptorBatch(descriptors, maxCount = ENROLLMENT_MAX_BATCH_SAMPLES) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return 'Face descriptor is required.'
  }

  if (descriptors.length > maxCount) {
    return `No more than ${maxCount} biometric samples can be submitted at once.`
  }

  const expectedLength = descriptors[0]?.length || 0
  if (!expectedLength) return 'Face descriptor is required.'

  for (const descriptor of descriptors) {
    if (!Array.isArray(descriptor) || descriptor.length !== expectedLength) {
      return 'Face descriptors must all have the same length.'
    }

    if (descriptor.some(value => !Number.isFinite(value))) {
      return 'Face descriptor contains invalid values.'
    }
  }

  return null
}

export function scoreEnrollmentCapture(metrics = {}) {
  const detectionScore = clamp01(metrics.detectionScore)
  const faceAreaScore = clamp01(toFiniteNumber(metrics.faceAreaRatio) / TARGET_FACE_AREA_RATIO)
  const centerednessScore = clamp01(metrics.centeredness)
  const brightnessScore = clamp01(
    1 - (Math.abs(toFiniteNumber(metrics.brightness) - TARGET_BRIGHTNESS) / BRIGHTNESS_RANGE),
  )
  const contrastScore = clamp01(toFiniteNumber(metrics.contrast) / TARGET_CONTRAST)
  const sharpnessScore = clamp01(toFiniteNumber(metrics.sharpness) / TARGET_SHARPNESS)

  return (
    (detectionScore * 2.2)
    + (faceAreaScore * 1.4)
    + (centerednessScore * 0.8)
    + (brightnessScore * 0.8)
    + (contrastScore * 0.7)
    + (sharpnessScore * 0.6)
  )
}

export function summarizeEnrollmentCaptureQuality(metrics = {}) {
  const warnings = []

  if (toFiniteNumber(metrics.faceAreaRatio) < 0.1) {
    warnings.push('Move closer so the face occupies more of the frame.')
  }

  if (toFiniteNumber(metrics.brightness) < 82) {
    warnings.push('Lighting is too dim. Add a front light or face a brighter area.')
  } else if (toFiniteNumber(metrics.brightness) > 205) {
    warnings.push('Lighting is too harsh. Reduce glare on the face.')
  }

  if (toFiniteNumber(metrics.contrast) < 20) {
    warnings.push('Face contrast is weak. Avoid backlight and use front lighting.')
  }

  if (toFiniteNumber(metrics.sharpness) < 12) {
    warnings.push('Hold still for a sharper capture.')
  }

  if (toFiniteNumber(metrics.centeredness) < 0.52) {
    warnings.push('Keep the face centered and level with the camera.')
  }

  if (warnings.length === 0) {
    return {
      tone: 'default',
      title: 'Capture quality looks usable',
      text: 'This burst has enough light and detail to enroll. Front lighting will still improve kiosk matching.',
      warnings,
    }
  }

  return {
    tone: 'warn',
    title: warnings.length >= 2 ? 'Capture quality is weak' : 'Capture quality needs attention',
    text: warnings.join(' '),
    warnings,
  }
}

export function selectEnrollmentBurstSamples(captures, options = {}) {
  const maxSamples = Math.max(1, options.maxSamples || ENROLLMENT_TARGET_BURST_SAMPLES)
  const minDescriptorDiversity = options.minDescriptorDiversity ?? MIN_DESCRIPTOR_DIVERSITY
  const minFrameGap = options.minFrameGap ?? MIN_FRAME_GAP

  const ranked = safeArray(captures)
    .filter(capture => Array.isArray(capture?.descriptor) && capture.descriptor.length > 0)
    .map(capture => ({
      ...capture,
      score: Number.isFinite(capture.score)
        ? capture.score
        : scoreEnrollmentCapture(capture.metrics),
    }))
    .sort((left, right) => right.score - left.score)

  if (ranked.length <= maxSamples) return ranked

  const selected = []
  const skipped = []

  ranked.forEach(candidate => {
    const similar = selected.some(existing => (
      Math.abs(Number(existing.attempt || 0) - Number(candidate.attempt || 0)) < minFrameGap
      || euclideanDistance(existing.descriptor, candidate.descriptor) < minDescriptorDiversity
    ))

    if (!similar && selected.length < maxSamples) {
      selected.push(candidate)
    } else {
      skipped.push(candidate)
    }
  })

  while (selected.length < maxSamples && skipped.length > 0) {
    selected.push(skipped.shift())
  }

  return selected.sort((left, right) => right.score - left.score)
}


