import { euclideanDistance } from './descriptor-utils'

export const ENROLLMENT_MIN_SAMPLES = 3
export const ENROLLMENT_BURST_CAPTURE_ATTEMPTS = 7
export const ENROLLMENT_BURST_CAPTURE_INTERVAL_MS = 140
export const ENROLLMENT_TARGET_BURST_SAMPLES = 3
export const ENROLLMENT_MAX_BATCH_SAMPLES = 3

const TARGET_FACE_AREA_RATIO = 0.18
const TARGET_BRIGHTNESS = 128
const BRIGHTNESS_RANGE = 100
const TARGET_CONTRAST = 25
const TARGET_SHARPNESS = 10  // was 18 — too aggressive for typical webcam + office lighting
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
    + (sharpnessScore * 0.3)
  )
}

export function summarizeEnrollmentCaptureQuality(metrics = {}) {
  const warnings = []

  const brightness = toFiniteNumber(metrics.brightness)
  const contrast = toFiniteNumber(metrics.contrast)
  const sharpness = toFiniteNumber(metrics.sharpness)
  const faceAreaRatio = toFiniteNumber(metrics.faceAreaRatio)
  const centeredness = toFiniteNumber(metrics.centeredness)

  const brightnessLow = brightness < 60
  const brightnessTooHigh = brightness > 230

  if (faceAreaRatio < 0.1) {
    warnings.push('Move closer — the face is too small in the frame.')
  }

  if (brightnessLow) {
    warnings.push('Too dark. Move to better lighting or face a window.')
  } else if (brightnessTooHigh) {
    warnings.push('Too bright. Reduce glare or move away from direct light.')
  }

  if (contrast < 12) {
    warnings.push('Low contrast. Avoid backlight and use front lighting.')
  }

  // Only flag sharpness if lighting is adequate — in dim scenes sharpness
  // is always low regardless of motion, and the lighting warning is more useful.
  // Threshold lowered from 6 to 2 to avoid false positives on normal webcams.
  if (sharpness < 2 && !brightnessLow && !brightnessTooHigh) {
    warnings.push('Hold still for a sharper capture.')
  }

  if (centeredness < 0.35) {
    warnings.push('Center the face in the oval guide.')
  }

  if (warnings.length === 0) {
    return {
      tone: 'default',
      title: 'Capture quality looks good',
      text: 'Samples captured. Review the preview before continuing.',
      warnings,
    }
  }

  return {
    tone: 'warn',
    title: warnings.length >= 2 ? 'Capture quality is poor' : 'Capture quality needs attention',
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
