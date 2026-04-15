import {
  ENROLLMENT_BURST_CAPTURE_ATTEMPTS,
  ENROLLMENT_BURST_CAPTURE_INTERVAL_MS,
  ENROLLMENT_MIN_SAMPLES,
  ENROLLMENT_TARGET_BURST_SAMPLES,
  scoreEnrollmentCapture,
  selectEnrollmentBurstSamples,
  summarizeEnrollmentCaptureQuality,
} from '@/lib/biometrics/enrollment-burst'
import {
  getOvalCaptureRegion,
  isFaceInsideCaptureOval,
  OVAL_CAPTURE_ASPECT_RATIO,
} from '@/lib/biometrics/oval-capture'
import { detectSingleDescriptor } from '@/lib/biometrics/human'
import { PREVIEW_MAX_DIMENSION } from '@/lib/config'
import { analyzeEnrollmentLiveness } from '@/lib/biometrics/liveness'

const CAPTURE_METRIC_SAMPLE_STEP = 4

export function buildOvalCaptureCanvas(sourceCanvas) {
  const region = getOvalCaptureRegion(sourceCanvas?.width, sourceCanvas?.height, OVAL_CAPTURE_ASPECT_RATIO)
  const canvas = document.createElement('canvas')
  canvas.width = region.width
  canvas.height = region.height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return sourceCanvas

  ctx.drawImage(
    sourceCanvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  )

  return canvas
}

export function measureCaptureMetrics(canvas, faceResult) {
  const detectionBox = faceResult?.detection?.box
  const detectionScore = Number(faceResult?.detection?.score || 0)
  const frameWidth = Math.max(1, Number(canvas?.width || 0))
  const frameHeight = Math.max(1, Number(canvas?.height || 0))
  const frameArea = frameWidth * frameHeight
  const boxWidth = Math.max(1, Number(detectionBox?.width || frameWidth))
  const boxHeight = Math.max(1, Number(detectionBox?.height || frameHeight))
  const boxArea = boxWidth * boxHeight
  const centeredness = detectionBox
    ? 1 - (
      Math.hypot(
        (detectionBox.x + (detectionBox.width / 2)) - (frameWidth / 2),
        (detectionBox.y + (detectionBox.height / 2)) - (frameHeight / 2),
      ) / Math.max(1, Math.hypot(frameWidth / 2, frameHeight / 2))
    )
    : 0

  const ctx = canvas?.getContext?.('2d', { willReadFrequently: true })
  if (!ctx) {
    return {
      detectionScore,
      faceAreaRatio: boxArea / frameArea,
      centeredness: Math.max(0, centeredness),
      brightness: 0,
      contrast: 0,
      sharpness: 0,
    }
  }

  const left = clampMetric(Math.floor(Number(detectionBox?.x || 0)), 0, frameWidth - 1)
  const top = clampMetric(Math.floor(Number(detectionBox?.y || 0)), 0, frameHeight - 1)
  const right = clampMetric(Math.ceil(Number((detectionBox?.x || 0) + (detectionBox?.width || frameWidth))), left + 1, frameWidth)
  const bottom = clampMetric(Math.ceil(Number((detectionBox?.y || 0) + (detectionBox?.height || frameHeight))), top + 1, frameHeight)
  const sampleWidth = Math.max(1, right - left)
  const sampleHeight = Math.max(1, bottom - top)
  const imageData = ctx.getImageData(left, top, sampleWidth, sampleHeight).data

  let brightnessTotal = 0
  let brightnessSquaredTotal = 0
  let brightnessCount = 0
  let sharpnessTotal = 0
  let sharpnessCount = 0

  for (let y = 0; y < sampleHeight; y += CAPTURE_METRIC_SAMPLE_STEP) {
    for (let x = 0; x < sampleWidth; x += CAPTURE_METRIC_SAMPLE_STEP) {
      const index = ((y * sampleWidth) + x) * 4
      const luminance = rgbToLuminance(
        imageData[index],
        imageData[index + 1],
        imageData[index + 2],
      )

      brightnessTotal += luminance
      brightnessSquaredTotal += luminance * luminance
      brightnessCount += 1

      if (x + CAPTURE_METRIC_SAMPLE_STEP < sampleWidth) {
        const nextIndex = ((y * sampleWidth) + (x + CAPTURE_METRIC_SAMPLE_STEP)) * 4
        sharpnessTotal += Math.abs(luminance - rgbToLuminance(
          imageData[nextIndex],
          imageData[nextIndex + 1],
          imageData[nextIndex + 2],
        ))
        sharpnessCount += 1
      }

      if (y + CAPTURE_METRIC_SAMPLE_STEP < sampleHeight) {
        const nextIndex = (((y + CAPTURE_METRIC_SAMPLE_STEP) * sampleWidth) + x) * 4
        sharpnessTotal += Math.abs(luminance - rgbToLuminance(
          imageData[nextIndex],
          imageData[nextIndex + 1],
          imageData[nextIndex + 2],
        ))
        sharpnessCount += 1
      }
    }
  }

  const brightness = brightnessCount ? (brightnessTotal / brightnessCount) : 0
  const variance = brightnessCount
    ? Math.max(0, (brightnessSquaredTotal / brightnessCount) - (brightness * brightness))
    : 0

  return {
    detectionScore,
    faceAreaRatio: boxArea / frameArea,
    centeredness: Math.max(0, centeredness),
    brightness,
    contrast: Math.sqrt(variance),
    sharpness: sharpnessCount ? (sharpnessTotal / sharpnessCount) : 0,
  }
}

function rgbToLuminance(red, green, blue) {
  return (
    (0.2126 * Number(red || 0))
    + (0.7152 * Number(green || 0))
    + (0.0722 * Number(blue || 0))
  )
}

function clampMetric(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function buildBurstCaptureCandidate(canvas, faceResult, attempt) {
  const metrics = measureCaptureMetrics(canvas, faceResult)
  const landmarks = faceResult?.landmarks?.positions || faceResult?.mesh || null

  return {
    attempt,
    descriptor: Array.from(faceResult?.descriptor || []),
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    metrics,
    landmarks,
    score: scoreEnrollmentCapture(metrics),
  }
}

export async function performEnrollmentBurstCapture(camera, setStatusMsg, setFaceFound, startDetect, showToast, playAudioCue, stopDetect, wait) {
  const captures = []
  const allLandmarks = []

  for (let attempt = 0; attempt < ENROLLMENT_BURST_CAPTURE_ATTEMPTS; attempt += 1) {
    if (attempt === 0) {
      setStatusMsg(`Capturing burst frames (1/${ENROLLMENT_BURST_CAPTURE_ATTEMPTS})...`)
    } else {
setStatusMsg(`Capturing burst frames (${attempt + 1}/${ENROLLMENT_BURST_CAPTURE_ATTEMPTS})...`)
    })
    const canvas = camera.captureImageData({
      maxWidth: PREVIEW_MAX_DIMENSION,
      maxHeight: PREVIEW_MAX_DIMENSION,
    })
    const croppedCanvas = buildOvalCaptureCanvas(canvas)
    if (!croppedCanvas) continue
    const faceResult = await detectSingleDescriptor(croppedCanvas)

    if (faceResult && isFaceInsideCaptureOval(faceResult.detection?.box, croppedCanvas.width, croppedCanvas.height)) {
      const candidate = buildBurstCaptureCandidate(croppedCanvas, faceResult, attempt)
      captures.push(candidate)
      if (candidate.landmarks) {
        allLandmarks.push(candidate.landmarks)
      }
    }

    if (attempt < ENROLLMENT_BURST_CAPTURE_ATTEMPTS - 1) await wait(ENROLLMENT_BURST_CAPTURE_INTERVAL_MS)
  }

  if (captures.length === 0) {
    setFaceFound(false)
    setStatusMsg('Scanning for face...')
    startDetect()
    showToast('No face detected. Reposition and try again.')
    return null
  }

  const livenessResult = analyzeEnrollmentLiveness(allLandmarks)

  if (!livenessResult.live) {
    setFaceFound(false)
    setStatusMsg('Liveness check failed...')
    startDetect()
    if (livenessResult.reason === 'static_face') {
      showToast('Static image detected. Please use live camera for enrollment.', 4000)
    } else if (livenessResult.reason === 'insufficient_frames') {
      showToast('Move slightly during capture and try again.', 4000)
    } else {
      showToast('Liveness check failed. Please try again.', 4000)
    }
    return null
  }

  const selectedCaptures = selectEnrollmentBurstSamples(captures, {
    maxSamples: ENROLLMENT_TARGET_BURST_SAMPLES,
  })
  const primaryCapture = selectedCaptures[0]
  const qualitySummary = summarizeEnrollmentCaptureQuality(primaryCapture.metrics)

  return {
    descriptors: selectedCaptures.map(capture => capture.descriptor),
    previewUrl: primaryCapture.previewUrl,
    qualitySummary,
    burstSummary: {
      keptCount: selectedCaptures.length,
      detectedCount: captures.length,
    },
    liveness: livenessResult,
  }
}

export { OVAL_CAPTURE_ASPECT_RATIO, ENROLLMENT_MIN_SAMPLES }
