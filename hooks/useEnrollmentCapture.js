'use client'

import { useCallback, useRef, useState } from 'react'
import { detectFaceBoxes, detectSingleDescriptor } from '@/lib/biometrics/human'
import {
  getOvalCaptureRegion,
  isFaceInsideCaptureOval,
  OVAL_CAPTURE_ASPECT_RATIO,
  selectOvalReadyFace,
} from '@/lib/biometrics/oval-capture'
import {
  scoreEnrollmentCapture,
  selectEnrollmentBurstSamples,
  summarizeEnrollmentCaptureQuality,
  ENROLLMENT_TARGET_BURST_SAMPLES,
} from '@/lib/biometrics/enrollment-burst'
import { DETECTION_MAX_DIMENSION, PREVIEW_MAX_DIMENSION, REGISTRATION_SCAN_INTERVAL_MS } from '@/lib/config'

// ─── Capture phases — 3 angles, 3 frames each = 9 total input frames ──────────
export const CAPTURE_PHASES = [
  {
    id: 'center',
    label: 'Look straight ahead',
    subtitle: 'Face the camera directly',
    icon: '🎯',
  },
  {
    id: 'left',
    label: 'Turn slightly left',
    subtitle: 'About 20° to your left — chin stays level',
    icon: '←',
  },
  {
    id: 'right',
    label: 'Turn slightly right',
    subtitle: 'About 20° to your right — chin stays level',
    icon: '→',
  },
]

const FRAMES_PER_PHASE = 3
const PHASE_FRAME_INTERVAL_MS = 200
const PHASE_REPOSITION_MS = 1400 // Time given to physically turn head between phases
const CAPTURE_METRIC_SAMPLE_STEP = 4

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function buildOvalCaptureCanvas(sourceCanvas) {
  const region = getOvalCaptureRegion(sourceCanvas?.width, sourceCanvas?.height, OVAL_CAPTURE_ASPECT_RATIO)
  const canvas = document.createElement('canvas')
  canvas.width = region.width
  canvas.height = region.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(sourceCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
  return canvas
}

function rgbToLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function measureCaptureMetrics(canvas, faceResult) {
  const box = faceResult?.detection?.box
  const detectionScore = Number(faceResult?.detection?.score || 0)
  const fw = Math.max(1, canvas?.width || 0)
  const fh = Math.max(1, canvas?.height || 0)
  const bw = Math.max(1, box?.width || fw)
  const bh = Math.max(1, box?.height || fh)
  const faceAreaRatio = (bw * bh) / (fw * fh)
  const centeredness = box
    ? 1 - Math.hypot(
        (box.x + bw / 2) - fw / 2,
        (box.y + bh / 2) - fh / 2,
      ) / Math.max(1, Math.hypot(fw / 2, fh / 2))
    : 0

  const ctx = canvas?.getContext?.('2d', { willReadFrequently: true })
  if (!ctx) return { detectionScore, faceAreaRatio, centeredness: Math.max(0, centeredness), brightness: 0, contrast: 0, sharpness: 0 }

  const l = clamp(Math.floor(box?.x || 0), 0, fw - 1)
  const t = clamp(Math.floor(box?.y || 0), 0, fh - 1)
  const r = clamp(Math.ceil((box?.x || 0) + (box?.width || fw)), l + 1, fw)
  const b = clamp(Math.ceil((box?.y || 0) + (box?.height || fh)), t + 1, fh)
  const sw = Math.max(1, r - l)
  const sh = Math.max(1, b - t)
  const data = ctx.getImageData(l, t, sw, sh).data

  let bright = 0, brightSq = 0, cnt = 0, sharp = 0, sharpCnt = 0

  for (let y = 0; y < sh; y += CAPTURE_METRIC_SAMPLE_STEP) {
    for (let x = 0; x < sw; x += CAPTURE_METRIC_SAMPLE_STEP) {
      const idx = (y * sw + x) * 4
      const lum = rgbToLuminance(data[idx], data[idx + 1], data[idx + 2])
      bright += lum; brightSq += lum * lum; cnt++
      if (x + CAPTURE_METRIC_SAMPLE_STEP < sw) {
        const ni = (y * sw + x + CAPTURE_METRIC_SAMPLE_STEP) * 4
        sharp += Math.abs(lum - rgbToLuminance(data[ni], data[ni + 1], data[ni + 2]))
        sharpCnt++
      }
      if (y + CAPTURE_METRIC_SAMPLE_STEP < sh) {
        const ni = ((y + CAPTURE_METRIC_SAMPLE_STEP) * sw + x) * 4
        sharp += Math.abs(lum - rgbToLuminance(data[ni], data[ni + 1], data[ni + 2]))
        sharpCnt++
      }
    }
  }

  const brightness = cnt ? bright / cnt : 0
  const variance = cnt ? Math.max(0, brightSq / cnt - brightness * brightness) : 0

  return {
    detectionScore,
    faceAreaRatio,
    centeredness: Math.max(0, centeredness),
    brightness,
    contrast: Math.sqrt(variance),
    sharpness: sharpCnt ? sharp / sharpCnt : 0,
  }
}

function buildCandidate(canvas, faceResult, phaseIndex, frameIndex) {
  const metrics = measureCaptureMetrics(canvas, faceResult)
  return {
    attempt: phaseIndex * FRAMES_PER_PHASE + frameIndex,
    phaseId: CAPTURE_PHASES[phaseIndex]?.id || 'unknown',
    descriptor: Array.from(faceResult?.descriptor || []),
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    metrics,
    score: scoreEnrollmentCapture(metrics),
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEnrollmentCapture(camera) {
  const [capturePhase, setCapturePhase] = useState(-1)      // -1 = not capturing
  const [phaseProgress, setPhaseProgress] = useState(0)     // 0–FRAMES_PER_PHASE
  const [faceFound, setFaceFound] = useState(false)
  const [faceNeedsAlignment, setFaceNeedsAlignment] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Align face with the camera.')

  const autoRef = useRef(null)
  const busyRef = useRef(false)
  const captureAttemptRef = useRef(false)
  const previewUrlRef = useRef(null)

  // ── Idle face detection loop ─────────────────────────────────────────────
  const stopDetect = useCallback(() => {
    if (autoRef.current) {
      window.clearInterval(autoRef.current)
      autoRef.current = null
    }
  }, [])

  // ── Multi-phase capture ─────────────────────────────────────────────────
  const captureAllPhases = useCallback(async () => {
    captureAttemptRef.current = true
    const allCaptures = []

    try {
      for (let phaseIndex = 0; phaseIndex < CAPTURE_PHASES.length; phaseIndex++) {
        const phase = CAPTURE_PHASES[phaseIndex]
        setCapturePhase(phaseIndex)
        setPhaseProgress(0)
        setStatusMsg(`${phase.label} — ${phase.subtitle}`)

        // Give user time to reposition for phases 2 and 3
        if (phaseIndex > 0) {
          await wait(PHASE_REPOSITION_MS)
        }

        let phaseCaptured = 0
        for (let frame = 0; frame < FRAMES_PER_PHASE; frame++) {
          const canvas = camera.captureImageData({
            maxWidth: PREVIEW_MAX_DIMENSION,
            maxHeight: PREVIEW_MAX_DIMENSION,
            enhanced: true,
          })
          const cropped = buildOvalCaptureCanvas(canvas)
          const faceResult = await detectSingleDescriptor(cropped)

          if (faceResult && faceResult.descriptor?.length > 0) {
            allCaptures.push(buildCandidate(cropped, faceResult, phaseIndex, frame))
            phaseCaptured++
          }

          setPhaseProgress(frame + 1)
          if (frame < FRAMES_PER_PHASE - 1) await wait(PHASE_FRAME_INTERVAL_MS)
        }

        // If phase yielded nothing (face turned too far), push a blank slot warning
        if (phaseCaptured === 0 && phaseIndex > 0) {
          setStatusMsg(`Couldn't capture ${phase.id} angle — results may be less accurate.`)
          await wait(800)
        }
      }

      if (allCaptures.length === 0) {
        return null
      }

      // Select best samples ensuring at least some angle diversity
      const selected = selectEnrollmentBurstSamples(allCaptures, {
        maxSamples: ENROLLMENT_TARGET_BURST_SAMPLES,
        minFrameGap: 1, // Lower gap to allow cross-phase diversity
        minDescriptorDiversity: 0.04, // Lower threshold to keep angle-diverse samples
      })

      const primary = selected[0]
      const quality = summarizeEnrollmentCaptureQuality(primary.metrics)

      return {
        descriptors: selected.map(c => c.descriptor),
        previewUrl: primary.previewUrl,
        qualitySummary: quality,
        burstSummary: {
          keptCount: selected.length,
          detectedCount: allCaptures.length,
          phasesCompleted: CAPTURE_PHASES.length,
        },
      }
    } finally {
      setCapturePhase(-1)
      setPhaseProgress(0)
      captureAttemptRef.current = false
    }
  }, [camera])

  // ── Detection loop startup ───────────────────────────────────────────────
  const startDetect = useCallback((onCaptureComplete, modelsReady) => {
    stopDetect()
    captureAttemptRef.current = false
    previewUrlRef.current = null
    setFaceFound(false)
    setFaceNeedsAlignment(false)
    setStatusMsg(modelsReady ? 'Center your face in the oval.' : 'Loading models...')

    if (!modelsReady) return

    const runDetection = async () => {
      if (busyRef.current || !camera.camOn || previewUrlRef.current || captureAttemptRef.current) return

      busyRef.current = true
      try {
        const canvas = camera.captureImageData({
          maxWidth: DETECTION_MAX_DIMENSION,
          maxHeight: DETECTION_MAX_DIMENSION,
        })
        const cropped = buildOvalCaptureCanvas(canvas)
        const detections = await detectFaceBoxes(cropped)
        const ready = selectOvalReadyFace(detections, cropped.width, cropped.height)

        setFaceFound(Boolean(ready))
        setFaceNeedsAlignment(Boolean(!ready && detections.length))

        if (!ready) {
          setStatusMsg(detections.length ? 'Move into the oval guide.' : 'Scanning for face...')
          return
        }

        stopDetect()
        setStatusMsg('Face detected — starting capture...')
        await wait(300)

        const result = await captureAllPhases()
        if (result) {
          previewUrlRef.current = result.previewUrl
          onCaptureComplete(result)
        } else {
          setFaceFound(false)
          setStatusMsg('No face captured. Try again.')
          startDetect(onCaptureComplete, modelsReady)
        }
      } catch {
        setStatusMsg('Camera error — retrying...')
      } finally {
        busyRef.current = false
      }
    }

    runDetection()
    autoRef.current = window.setInterval(runDetection, REGISTRATION_SCAN_INTERVAL_MS)
  }, [camera, captureAllPhases, stopDetect])

  return {
    // State
    capturePhase,         // index into CAPTURE_PHASES, or -1
    phaseProgress,        // 0–FRAMES_PER_PHASE
    faceFound,
    faceNeedsAlignment,
    statusMsg,
    setStatusMsg,
    // Actions
    startDetect,
    stopDetect,
    resetCapture: () => {
      previewUrlRef.current = null
      setFaceFound(false)
      setFaceNeedsAlignment(false)
      setCapturePhase(-1)
      setPhaseProgress(0)
    },
  }
}
