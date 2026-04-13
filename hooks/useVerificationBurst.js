import { useCallback } from 'react'
import { getHumanVerification } from '@/lib/biometrics/human'
import { PREVIEW_MAX_DIMENSION, VERIFICATION_BURST_FRAMES, VERIFICATION_BURST_INTERVAL_MS } from '@/lib/config'
import { selectPrimaryFace } from '@/lib/kiosk-utils'
import { selectOvalReadyFace } from '@/lib/biometrics/oval-capture'

const wait = duration => new Promise(resolve => {
  window.setTimeout(resolve, duration)
})

export function useVerificationBurst(camera) {
  const captureVerificationBurst = useCallback(async () => {
    const human = await getHumanVerification()
    const captures = []
    const landmarksBuffer = []

    for (let attempt = 0; attempt < VERIFICATION_BURST_FRAMES; attempt += 1) {
      const canvas = camera.captureImageData({
        maxWidth: PREVIEW_MAX_DIMENSION,
        maxHeight: PREVIEW_MAX_DIMENSION,
        enhanced: true,
      })
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

      if (attempt < VERIFICATION_BURST_FRAMES - 1) await wait(VERIFICATION_BURST_INTERVAL_MS)
    }

    // If no captures passed strict oval filter, try with ANY face (more lenient)
    if (captures.length === 0) {
      for (let attempt = 0; attempt < VERIFICATION_BURST_FRAMES; attempt += 1) {
        const canvas = camera.captureImageData({
          maxWidth: PREVIEW_MAX_DIMENSION,
          maxHeight: PREVIEW_MAX_DIMENSION,
          enhanced: true,
        })
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
        
        if (attempt < VERIFICATION_BURST_FRAMES - 1) await wait(VERIFICATION_BURST_INTERVAL_MS)
      }
    }

    if (captures.length === 0) return null

    const bestCapture = captures.reduce((best, curr) => curr.score > best.score ? curr : best, captures[0])

    return { 
      ...bestCapture, 
      landmarks: landmarksBuffer,
      allCaptures: captures 
    }
  }, [camera])

  return { captureVerificationBurst }
}