import { useCallback } from 'react'
import { getHumanVerification } from '@/lib/biometrics/human'
import { PREVIEW_MAX_DIMENSION, VERIFICATION_BURST_FRAMES, VERIFICATION_BURST_INTERVAL_MS } from '@/lib/config'
import { selectPrimaryFace } from '@/lib/kiosk-utils'

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
      const primary = selectPrimaryFace(detections, canvas.width, canvas.height)
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