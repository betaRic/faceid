import { useCallback } from 'react'
import { extractFaceRotationAngles, getHumanVerification } from '@/lib/biometrics/human'
import { euclideanDistance, normalizeDescriptor } from '@/lib/biometrics/descriptor-utils'
import { PREVIEW_MAX_DIMENSION, VERIFICATION_BURST_FRAMES, VERIFICATION_BURST_INTERVAL_MS } from '@/lib/config'
import { selectOvalReadyFace, buildOvalCaptureCanvas } from '@/lib/biometrics/oval-capture'

const wait = duration => new Promise(resolve => {
  window.setTimeout(resolve, duration)
})

function descriptorDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Number.POSITIVE_INFINITY
  return euclideanDistance(a, b)
}

function aggregateDescriptors(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null
  if (descriptors.length === 1) return Array.from(normalizeDescriptor(descriptors[0]))

  const normalized = descriptors.map(normalizeDescriptor)
  const merged = normalized[0].map((_, index) => (
    normalized.reduce((sum, vector) => sum + Number(vector[index] || 0), 0) / normalized.length
  ))
  return Array.from(normalizeDescriptor(merged))
}

function measureFrameMetrics(canvas, box) {
  if (!canvas || !box) {
    return {
      faceAreaRatio: 0,
      centeredness: 0,
    }
  }

  const frameArea = Math.max(1, canvas.width * canvas.height)
  const faceArea = Math.max(0, Number(box.width || 0) * Number(box.height || 0))
  const faceAreaRatio = faceArea / frameArea
  const centerX = Number(box.x || 0) + Number(box.width || 0) / 2
  const centerY = Number(box.y || 0) + Number(box.height || 0) / 2
  const centeredness = 1 - (
    Math.hypot(centerX - (canvas.width / 2), centerY - (canvas.height / 2))
    / Math.max(1, Math.hypot(canvas.width / 2, canvas.height / 2))
  )

  return {
    faceAreaRatio,
    centeredness: Math.max(0, centeredness),
  }
}

function scoreCaptureQuality(detection, metrics) {
  const yawAbs = Math.abs(Number(detection?.rotation?.yaw || 0))
  const pitchAbs = Math.abs(Number(detection?.rotation?.pitch || 0))
  const rollAbs = Math.abs(Number(detection?.rotation?.roll || 0))
  const score = Number(detection?.detection?.score || 0)
  const faceAreaRatio = Number(metrics?.faceAreaRatio || 0)
  const centeredness = Number(metrics?.centeredness || 0)
  const poseScore = Math.max(0, 1 - ((yawAbs * 0.7) + (pitchAbs * 0.4) + (rollAbs * 0.8)))

  return (
    (score * 2.4)
    + (faceAreaRatio * 6.5)
    + (centeredness * 1.8)
    + (poseScore * 1.2)
  )
}

function mapDetectedFace(face) {
  return {
    detection: {
      box: {
        x: face.box[0],
        y: face.box[1],
        width: face.box[2],
        height: face.box[3],
      },
      score: face.score,
    },
    landmarks: { positions: face.mesh },
    descriptor: face.embedding,
    antispoof: face.real ?? null,
    liveness: face.live ?? null,
    rotation: extractFaceRotationAngles(face),
  }
}

function selectBestFallbackFace(detections) {
  if (!Array.isArray(detections) || detections.length === 0) return null
  return detections.reduce((best, curr) => {
    const currScore = Number(curr?.detection?.score || 0) + ((curr?.detection?.box?.width || 0) * (curr?.detection?.box?.height || 0))
    const bestScore = Number(best?.detection?.score || 0) + ((best?.detection?.box?.width || 0) * (best?.detection?.box?.height || 0))
    return currScore > bestScore ? curr : best
  }, detections[0])
}

function summarizeDescriptorSpread(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length < 2) return 0
  let spread = 0
  for (let i = 0; i < descriptors.length; i += 1) {
    for (let j = i + 1; j < descriptors.length; j += 1) {
      spread = Math.max(spread, descriptorDistance(descriptors[i], descriptors[j]))
    }
  }
  return spread
}

export function useVerificationBurst(camera) {
  const captureVerificationBurst = useCallback(async () => {
    const human = await getHumanVerification()
    const captures = []
    const landmarksBuffer = []
    const isMobile = typeof navigator !== 'undefined'
      ? (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || navigator.userAgentData?.mobile === true)
      : false
    const targetFrames = isMobile ? Math.max(VERIFICATION_BURST_FRAMES, 8) : VERIFICATION_BURST_FRAMES
    const frameInterval = isMobile ? Math.max(VERIFICATION_BURST_INTERVAL_MS, 90) : VERIFICATION_BURST_INTERVAL_MS

    for (let attempt = 0; attempt < targetFrames; attempt += 1) {
      const rawCanvas = camera.captureImageData({
        maxWidth: PREVIEW_MAX_DIMENSION,
        maxHeight: PREVIEW_MAX_DIMENSION,
      })
      const canvas = buildOvalCaptureCanvas(rawCanvas)
      if (!canvas) {
        if (attempt < targetFrames - 1) await wait(frameInterval)
        continue
      }
      if (!camera.camOn) break

      const result = await human.detect(canvas)
      const detections = result.face.map(mapDetectedFace)
      const strictPrimary = selectOvalReadyFace(detections, canvas.width, canvas.height)
      const primary = strictPrimary?.detection || selectBestFallbackFace(detections)

      if (primary?.landmarks?.positions) {
        landmarksBuffer.push(primary.landmarks.positions)
      }

      if (primary?.descriptor?.length) {
        const metrics = measureFrameMetrics(canvas, primary.detection?.box)
        captures.push({
          canvas,
          detections,
          primary: {
            detection: primary,
            box: primary.detection?.box || null,
            strictOval: Boolean(strictPrimary),
          },
          metrics,
          qualityScore: scoreCaptureQuality(primary, metrics),
        })
      }

      if (attempt < targetFrames - 1) await wait(frameInterval)
    }

    if (captures.length === 0) return null

    const rankedCaptures = [...captures].sort((left, right) => right.qualityScore - left.qualityScore)
    const aggregationCount = Math.min(isMobile ? 4 : 3, rankedCaptures.length)
    const selectedForAggregation = rankedCaptures.slice(0, aggregationCount)
    const descriptorSamples = selectedForAggregation
      .map(capture => capture?.primary?.detection?.descriptor)
      .filter(descriptor => Array.isArray(descriptor) && descriptor.length > 0)

    const fusedDescriptor = aggregateDescriptors(descriptorSamples)
    const descriptorSpread = summarizeDescriptorSpread(descriptorSamples)
    const strictCount = captures.filter(capture => capture?.primary?.strictOval).length
    const multiFaceFrames = captures.filter(capture => (capture?.detections?.length || 0) > 1).length
    const bestCapture = rankedCaptures[0]

    const burstDiagnostics = {
      targetFrames,
      capturedFrames: captures.length,
      strictFrames: strictCount,
      fallbackFrames: captures.length - strictCount,
      multiFaceFrames,
      aggregatedFrames: descriptorSamples.length,
      descriptorSpread,
      bestQualityScore: Number(bestCapture?.qualityScore || 0),
      bestFaceAreaRatio: Number(bestCapture?.metrics?.faceAreaRatio || 0),
      bestCenteredness: Number(bestCapture?.metrics?.centeredness || 0),
      bestYaw: Number(bestCapture?.primary?.detection?.rotation?.yaw || 0),
      bestPitch: Number(bestCapture?.primary?.detection?.rotation?.pitch || 0),
      bestRoll: Number(bestCapture?.primary?.detection?.rotation?.roll || 0),
    }

    return {
      ...bestCapture,
      landmarks: landmarksBuffer,
      allCaptures: captures,
      fusedDescriptor,
      descriptorSpread,
      burstDiagnostics,
    }
  }, [camera])

  return { captureVerificationBurst }
}
