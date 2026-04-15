import { useCallback } from 'react'
import { getHumanVerification } from '@/lib/biometrics/human'
import { PREVIEW_MAX_DIMENSION, VERIFICATION_BURST_FRAMES, VERIFICATION_BURST_INTERVAL_MS } from '@/lib/config'
import { selectOvalReadyFace, buildOvalCaptureCanvas } from '@/lib/biometrics/oval-capture'

const wait = duration => new Promise(resolve => {
  window.setTimeout(resolve, duration)
})

function descriptorDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Number.POSITIVE_INFINITY
  let sum = 0
  for (let i = 0; i < a.length; i += 1) {
    const diff = Number(a[i] || 0) - Number(b[i] || 0)
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

function selectMedoidDescriptor(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null
  if (descriptors.length === 1) return Array.from(descriptors[0] || [])

  let bestIndex = 0
  let bestScore = Number.POSITIVE_INFINITY
  for (let i = 0; i < descriptors.length; i += 1) {
    let totalDistance = 0
    for (let j = 0; j < descriptors.length; j += 1) {
      if (i === j) continue
      totalDistance += descriptorDistance(descriptors[i], descriptors[j])
    }
    if (totalDistance < bestScore) {
      bestScore = totalDistance
      bestIndex = i
    }
  }
  return Array.from(descriptors[bestIndex] || [])
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
        enhanced: true,
      })
      // Crop to oval BEFORE descriptor extraction — must match enrollment pipeline
      const canvas = buildOvalCaptureCanvas(rawCanvas)
      if (!canvas) { await wait(VERIFICATION_BURST_INTERVAL_MS); continue }
      if (!camera.camOn) break
      const result = await human.detect(canvas)
      const detections = result.face.map(face => ({
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
      }))
      
      // Use more lenient oval selection for verification burst (same thresholds as kiosk idle)
      const primary = selectOvalReadyFace(detections, canvas.width, canvas.height)
      if (primary?.detection?.landmarks) {
        landmarksBuffer.push(primary.detection.landmarks.positions)
      }
      const primaryBox = primary?.box
      const frameArea = Math.max(1, canvas.width * canvas.height)
      const boxArea = primaryBox ? primaryBox.width * primaryBox.height : 0
      const score = detections.length + (boxArea / frameArea)

      if (detections.length && primary) {
        captures.push({ canvas, detections, primary, score })
      }

      if (attempt < targetFrames - 1) await wait(frameInterval)
    }

    // If no captures passed strict oval filter, try with ANY face (more lenient)
    if (captures.length === 0) {
      for (let attempt = 0; attempt < targetFrames; attempt += 1) {
        const rawCanvas = camera.captureImageData({
          maxWidth: PREVIEW_MAX_DIMENSION,
          maxHeight: PREVIEW_MAX_DIMENSION,
          enhanced: true,
        })
        // Crop to oval even in fallback — descriptor geometry must match enrollment
        const canvas = buildOvalCaptureCanvas(rawCanvas)
        if (!canvas) { await wait(VERIFICATION_BURST_INTERVAL_MS); continue }
        if (!camera.camOn) break
        const result = await human.detect(canvas)
        const detections = result.face.map(face => ({
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
        }))

        if (detections.length > 0) {
          // Use the best face regardless of oval position (fallback)
          const best = detections.reduce((best, curr) => 
            (curr.detection?.score || 0) > (best.detection?.score || 0) ? curr : best
          , detections[0])
          
          if (best.landmarks?.positions) {
            landmarksBuffer.push(best.landmarks.positions)
          }
          
          const frameArea = Math.max(1, canvas.width * canvas.height)
          const boxArea = (best.detection?.box?.width || 0) * (best.detection?.box?.height || 0)
          const score = detections.length + (boxArea / frameArea)
          
          captures.push({ 
            canvas, 
            detections, 
            primary: { detection: best, box: best.detection?.box }, 
            score 
          })
        }
        
        if (attempt < targetFrames - 1) await wait(frameInterval)
      }
    }

    if (captures.length === 0) return null

    const bestCapture = captures.reduce((best, curr) => curr.score > best.score ? curr : best, captures[0])
    const descriptorSamples = captures
      .map(c => c?.primary?.detection?.descriptor)
      .filter(d => Array.isArray(d) && d.length > 0)
    const fusedDescriptor = selectMedoidDescriptor(descriptorSamples)
    const descriptorSpread = descriptorSamples.length > 1
      ? Math.max(
          ...descriptorSamples.map((d, i) => descriptorSamples
            .map((other, j) => (i === j ? 0 : descriptorDistance(d, other)))
            .reduce((a, b) => Math.max(a, b), 0)),
        )
      : 0

    return { 
      ...bestCapture, 
      landmarks: landmarksBuffer,
      allCaptures: captures,
      fusedDescriptor,
      descriptorSpread,
    }
  }, [camera])

  return { captureVerificationBurst }
}
