import { euclideanDistance } from './descriptor-utils'
import { DESCRIPTOR_LENGTH as EXPECTED_DESCRIPTOR_LENGTH, ENROLLMENT_MIN_SAMPLE_DIVERSITY } from '@/lib/config'
import { CAPTURE_FACE_AREA_TARGET_RATIO, getFaceSizeGuidance } from '@/lib/biometrics/face-size-guidance'

export const ENROLLMENT_MIN_SAMPLES = 3
export const ENROLLMENT_BURST_CAPTURE_ATTEMPTS = 7
export const ENROLLMENT_BURST_CAPTURE_INTERVAL_MS = 140
export const ENROLLMENT_TARGET_BURST_SAMPLES = 5
export const ENROLLMENT_MAX_BATCH_SAMPLES = 5
export const ENROLLMENT_REQUIRED_PHASE_IDS = ['center', 'side_a', 'side_b', 'chin_down']

const TARGET_BRIGHTNESS = 128
const BRIGHTNESS_RANGE = 100
const TARGET_CONTRAST = 25
const TARGET_SHARPNESS = 10 
const MIN_DESCRIPTOR_DIVERSITY = ENROLLMENT_MIN_SAMPLE_DIVERSITY
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

export function normalizeEnrollmentSampleFrames(value, maxCount = ENROLLMENT_MAX_BATCH_SAMPLES) {
  return safeArray(value)
    .slice(0, maxCount)
    .map(frame => {
      if (typeof frame === 'string') {
        return {
          phaseId: '',
          frameDataUrl: String(frame || ''),
        }
      }

      const sample = frame && typeof frame === 'object' ? frame : {}
      return {
        phaseId: String(sample.phaseId || '').trim(),
        frameDataUrl: String(sample.frameDataUrl || sample.previewUrl || '').trim(),
      }
    })
    .filter(frame => Boolean(frame.frameDataUrl))
}

export function validateEnrollmentDescriptorBatch(descriptors, maxCount = ENROLLMENT_MAX_BATCH_SAMPLES) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return 'Face descriptor is required.'
  }

  if (descriptors.length > maxCount) {
    return `No more than ${maxCount} biometric samples can be submitted at once.`
  }

  for (const descriptor of descriptors) {
    if (!Array.isArray(descriptor) || descriptor.length !== EXPECTED_DESCRIPTOR_LENGTH) {
      return `Face descriptor must have exactly ${EXPECTED_DESCRIPTOR_LENGTH} dimensions.`
    }

    if (descriptor.some(value => !Number.isFinite(value))) {
      return 'Face descriptor contains invalid values.'
    }
  }

  return null
}

export function validateEnrollmentSampleFrames(sampleFrames, maxCount = ENROLLMENT_MAX_BATCH_SAMPLES) {
  if (!Array.isArray(sampleFrames) || sampleFrames.length === 0) {
    return 'Guided enrollment snapshots are required.'
  }

  if (sampleFrames.length > maxCount) {
    return `No more than ${maxCount} guided face snapshots can be submitted at once.`
  }

  for (const frame of sampleFrames) {
    if (!frame || typeof frame !== 'object') {
      return 'Guided enrollment snapshot payload is invalid.'
    }

    if (!ENROLLMENT_REQUIRED_PHASE_IDS.includes(String(frame.phaseId || '').trim())) {
      return 'Guided face snapshots must include valid pose labels.'
    }

    const frameDataUrl = String(frame.frameDataUrl || '').trim()
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(frameDataUrl)) {
      return 'Guided face snapshots must be JPEG, PNG, or WebP image data URLs.'
    }
  }

  const capturedPhaseIds = new Set(sampleFrames.map(frame => String(frame.phaseId || '').trim()))
  const missingPhase = ENROLLMENT_REQUIRED_PHASE_IDS.find(phaseId => !capturedPhaseIds.has(phaseId))
  if (missingPhase) {
    return 'Guided enrollment snapshots are incomplete. Retake with front, both side angles, and chin-down pose.'
  }

  return null
}

export function validateEnrollmentCaptureMetadata(metadata, descriptors = []) {
  const value = metadata && typeof metadata === 'object' ? metadata : {}
  const phasesCaptured = new Set(safeArray(value.phasesCaptured).map(phase => String(phase || '').trim()))
  const missingPhase = ENROLLMENT_REQUIRED_PHASE_IDS.find(phase => !phasesCaptured.has(phase))
  if (missingPhase) {
    return 'Guided face capture is incomplete. Retake with front, both side angles, and chin-down pose.'
  }

  if (value.genuinelyDiverse !== true) {
    return 'Guided face capture did not confirm enough pose diversity. Retake and follow each pose prompt.'
  }

  const keptCount = Number(value.keptCount || 0)
  if (keptCount < Math.min(ENROLLMENT_REQUIRED_PHASE_IDS.length, safeArray(descriptors).length || ENROLLMENT_REQUIRED_PHASE_IDS.length)) {
    return 'Guided face capture did not keep enough validated samples. Retake the capture.'
  }

  return null
}

export function scoreEnrollmentCapture(metrics = {}) {
  const detectionScore = clamp01(metrics.detectionScore)
  const faceAreaScore = clamp01(toFiniteNumber(metrics.faceAreaRatio) / CAPTURE_FACE_AREA_TARGET_RATIO)
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
  const faceSizeGuidance = getFaceSizeGuidance(faceAreaRatio)

  const brightnessLow = brightness < 60
  const brightnessTooHigh = brightness > 230

  if (faceSizeGuidance.status === 'too-far') {
    warnings.push('Move much closer — face is still too small in frame.')
  } else if (faceSizeGuidance.status === 'move-closer') {
    warnings.push('Move closer — face is too small and should fill more of the oval.')
  } else if (faceSizeGuidance.status === 'slightly-close') {
    warnings.push('Move back slightly — the face is getting too large in frame.')
  } else if (faceSizeGuidance.status === 'too-close') {
    warnings.push('Move back — face is too close to the camera.')
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
  const requiredPhaseIds = safeArray(options.requiredPhaseIds).map(id => String(id || '')).filter(Boolean)

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

  for (const phaseId of requiredPhaseIds) {
    if (selected.length >= maxSamples) break
    const candidate = ranked.find(capture => (
      String(capture?.phaseId || '') === phaseId
      && !selected.includes(capture)
    ))
    if (candidate) selected.push(candidate)
  }

  ranked.forEach(candidate => {
    if (selected.includes(candidate)) return
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
