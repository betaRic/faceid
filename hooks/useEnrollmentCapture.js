'use client'

/**
 * hooks/useEnrollmentCapture.js
 *
 * Key fix: capturePhaseFrames now re-checks yaw PER FRAME during capture,
 * not just before the burst. Previously, waitForPose confirmed pose then
 * capturePhaseFrames started immediately — but if the user moved back to
 * center during the 140ms burst, all frames came from center and were
 * near-identical (no real diversity despite "3-angle" capture).
 *
 * Now: each captured frame must pass the pose check for its phase.
 * If a frame fails the pose check during capture, it is skipped.
 * We keep trying until we get FRAMES_PER_PHASE valid frames or timeout.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { detectFaceBoxes, detectSingleDescriptor, detectPoseOnly } from '@/lib/biometrics/human'
import {
  buildOvalCaptureCanvas,
  selectOvalReadyFace,
} from '@/lib/biometrics/oval-capture'
import {
  scoreEnrollmentCapture,
  selectEnrollmentBurstSamples,
  summarizeEnrollmentCaptureQuality,
  ENROLLMENT_TARGET_BURST_SAMPLES,
} from '@/lib/biometrics/enrollment-burst'
import { DETECTION_MAX_DIMENSION, PREVIEW_MAX_DIMENSION, REGISTRATION_SCAN_INTERVAL_MS } from '@/lib/config'

export const CAPTURE_PHASES = [
  {
    id: 'center',
    label: 'Look straight ahead',
    subtitle: 'Face the camera directly — chin level',
    icon: '🎯',
    poseType: 'center',
  },
  {
    id: 'side_a',
    label: 'Turn head to one side (~20°)',
    subtitle: 'Keep chin level, eyes forward — turn left or right',
    icon: '↔',
    poseType: 'side_a',
  },
  {
    id: 'side_b',
    label: 'Now turn the other direction',
    subtitle: 'Opposite side from before, same 20° turn',
    icon: '↔',
    poseType: 'side_b',
  },
]

const FRAMES_PER_PHASE = 3
const PHASE_FRAME_INTERVAL_MS = 150
// Max attempts per frame before giving up on that frame slot
const FRAME_MAX_RETRIES = 8
const POSE_POLL_INTERVAL_MS = 90
const POSE_WAIT_TIMEOUT_MS = 12000
const POSE_HOLD_STABLE_MS = 300
const YAW_CENTER_MAX = 0.08
const YAW_SIDE_MIN = 0.12
const YAW_SIDE_GOOD = 0.18
const CAPTURE_METRIC_SAMPLE_STEP = 4

export function estimateHeadYaw(mesh) {
  if (!Array.isArray(mesh) || mesh.length < 455) return null
  const getX = (i) => {
    const pt = mesh[i]
    if (!pt) return null
    return Array.isArray(pt) ? pt[0] : (typeof pt.x === 'number' ? pt.x : null)
  }
  const noseX = getX(1)
  const leftX = getX(234)
  const rightX = getX(454)
  if (noseX == null || leftX == null || rightX == null) return null
  const faceWidth = rightX - leftX
  if (Math.abs(faceWidth) < 5) return null
  return (noseX - leftX) / faceWidth - 0.5
}

export function classifyPose(yaw) {
  if (yaw === null) return 'unknown'
  const abs = Math.abs(yaw)
  if (abs < YAW_CENTER_MAX) return 'center'
  if (abs < YAW_SIDE_MIN) return 'transition'
  if (abs < YAW_SIDE_GOOD) return 'side'
  return 'side_good'
}

function isPoseCentered(yaw) {
  return yaw !== null && Math.abs(yaw) < YAW_CENTER_MAX
}

function isPoseSufficient(yaw) {
  return yaw !== null && Math.abs(yaw) >= YAW_SIDE_MIN
}

function isPoseOpposite(yaw, referenceYaw) {
  if (yaw === null || referenceYaw === null || referenceYaw === 0) return false
  return Math.sign(yaw) !== Math.sign(referenceYaw) && Math.abs(yaw) >= YAW_SIDE_MIN
}

function isPoseMatchingPhase(phaseType, yaw, sideAYaw) {
  switch (phaseType) {
    case 'center': return isPoseCentered(yaw)
    case 'side_a': return isPoseSufficient(yaw)
    case 'side_b': return isPoseOpposite(yaw, sideAYaw)
    default: return true
  }
}

export function getPoseGuidanceMessage(phaseType, yaw, sideAYw) {
  if (yaw === null) return 'Position your face in the oval'
  switch (phaseType) {
    case 'center':
      return isPoseCentered(yaw) ? '✓ Hold still — capturing' : 'Center your face — look directly at the camera'
    case 'side_a':
      if (Math.abs(yaw) >= YAW_SIDE_GOOD) return '✓ Good — hold that angle'
      if (Math.abs(yaw) >= YAW_SIDE_MIN) return 'A little more — keep turning'
      return 'Turn your head to either side'
    case 'side_b':
      if (isPoseOpposite(yaw, sideAYw)) return '✓ Good — hold that angle'
      // Display is mirrored (scaleX(-1)) but raw canvas is not.
      // Positive sideAYaw = raw nose-right = user turned LEFT in mirror.
      // So opposite direction is RIGHT.
      return sideAYw !== null
        ? `Now turn your head to the ${sideAYw > 0 ? 'right' : 'left'}`
        : 'Turn your head the other way'
    default:
      return ''
  }
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
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
  if (!ctx) {
    return { detectionScore, faceAreaRatio, centeredness: Math.max(0, centeredness), brightness: 0, contrast: 0, sharpness: 0 }
  }

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

function buildCandidate(canvas, faceResult, phaseIndex, frameIndex, yaw) {
  const metrics = measureCaptureMetrics(canvas, faceResult)
  return {
    attempt: phaseIndex * FRAMES_PER_PHASE + frameIndex,
    phaseId: CAPTURE_PHASES[phaseIndex]?.id || 'unknown',
    phaseIndex,
    descriptor: Array.from(faceResult?.descriptor || []),
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    metrics,
    score: scoreEnrollmentCapture(metrics),
    yaw,
  }
}

export function useEnrollmentCapture(camera) {
  const [capturePhase, setCapturePhase] = useState(-1)
  const [phaseProgress, setPhaseProgress] = useState(0)
  const [faceFound, setFaceFound] = useState(false)
  const [faceNeedsAlignment, setFaceNeedsAlignment] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Align face with the camera.')
  const [currentYaw, setCurrentYaw] = useState(null)
  const [poseOk, setPoseOk] = useState(false)
  const [sideAYaw, setSideAYaw] = useState(null)

  const autoRef = useRef(null)
  const busyRef = useRef(false)
  const captureAttemptRef = useRef(false)
  const previewUrlRef = useRef(null)
  const abortedRef = useRef(false)

  const stopDetect = useCallback(() => {
    if (autoRef.current) {
      window.clearInterval(autoRef.current)
      autoRef.current = null
    }
  }, [])

  const waitForPose = useCallback(async (phaseType, sideAYw, updateStatus) => {
    const deadline = Date.now() + POSE_WAIT_TIMEOUT_MS
    let poseAchievedAt = null

    while (Date.now() < deadline && !abortedRef.current) {
      const canvas = camera.captureImageData({ maxWidth: 360, maxHeight: 360 })
      if (!canvas) { await wait(POSE_POLL_INTERVAL_MS); continue }

      const cropped = buildOvalCaptureCanvas(canvas)
      if (!cropped) { await wait(POSE_POLL_INTERVAL_MS); continue }
      let detectedYaw = null
      try {
        const result = await detectPoseOnly(cropped)
        if (result?.landmarks?.positions) {
          detectedYaw = estimateHeadYaw(result.landmarks.positions)
        }
      } catch {}

      setCurrentYaw(detectedYaw)
      const poseMatch = isPoseMatchingPhase(phaseType, detectedYaw, sideAYw)
      setPoseOk(poseMatch)
      updateStatus(getPoseGuidanceMessage(phaseType, detectedYaw, sideAYw))

      if (poseMatch) {
        if (poseAchievedAt === null) poseAchievedAt = Date.now()
        else if (Date.now() - poseAchievedAt >= POSE_HOLD_STABLE_MS) {
          return { yaw: detectedYaw }
        }
      } else {
        poseAchievedAt = null
      }

      await wait(POSE_POLL_INTERVAL_MS)
    }

    updateStatus('⚠️ Pose timeout — capturing best available frames')
    return null
  }, [camera])

  /**
   * FIX: Per-frame pose verification during capture.
   *
   * Each frame slot is retried up to FRAME_MAX_RETRIES times.
   * A frame is only accepted if the yaw still matches the phase requirement.
   * This ensures diversity is ACTUALLY captured, not just detected once before burst.
   */
  const capturePhaseFrames = useCallback(async (phaseIndex, phaseType, sideAYw) => {
    const captures = []
    let frameSlot = 0

    while (frameSlot < FRAMES_PER_PHASE && !abortedRef.current) {
      let attempts = 0
      let captured = false

      while (attempts < FRAME_MAX_RETRIES && !captured && !abortedRef.current) {
        const canvas = camera.captureImageData({
          maxWidth: PREVIEW_MAX_DIMENSION,
          maxHeight: PREVIEW_MAX_DIMENSION,
          enhanced: true,
        })
        const cropped = buildOvalCaptureCanvas(canvas)
        if (!cropped) { await wait(PHASE_FRAME_INTERVAL_MS); continue }

        let faceResult = null
        try {
          faceResult = await detectSingleDescriptor(cropped)
        } catch {}

        if (faceResult && faceResult.descriptor?.length > 0) {
          const frameYaw = faceResult.landmarks?.positions
            ? estimateHeadYaw(faceResult.landmarks.positions)
            : null

          // ✅ Verify pose is still correct DURING capture (not just before)
          const poseStillOk = isPoseMatchingPhase(phaseType, frameYaw, sideAYw)

          if (poseStillOk) {
            captures.push(buildCandidate(cropped, faceResult, phaseIndex, frameSlot, frameYaw))
            captured = true
            frameSlot++
            setPhaseProgress(frameSlot)
          }
          // If pose slipped, retry this frame slot without incrementing frameSlot
        }

        if (!captured) {
          attempts++
          await wait(PHASE_FRAME_INTERVAL_MS)
        }
      }

      // If we couldn't get a pose-valid frame after max retries, skip this slot
      // (better to have 2 good frames than 3 frames including a bad one)
      if (!captured) {
        console.warn(`[EnrollmentCapture] Phase ${phaseIndex} frame slot ${frameSlot} — could not capture valid pose after ${FRAME_MAX_RETRIES} attempts, skipping`)
        frameSlot++
      }

      if (captured) {
        await wait(PHASE_FRAME_INTERVAL_MS)
      }
    }

    return captures
  }, [camera])

  const captureAllPhases = useCallback(async (onStatusUpdate) => {
    captureAttemptRef.current = true
    abortedRef.current = false
    const allCaptures = []
    let sideAYw = null

    try {
      for (let phaseIndex = 0; phaseIndex < CAPTURE_PHASES.length; phaseIndex++) {
        if (abortedRef.current) break

        const phase = CAPTURE_PHASES[phaseIndex]
        setCapturePhase(phaseIndex)
        setPhaseProgress(0)
        setPoseOk(false)
        setCurrentYaw(null)

        onStatusUpdate?.(`Phase ${phaseIndex + 1}/3 — ${phase.label}`)

        const poseResult = await waitForPose(
          phase.poseType,
          sideAYw,
          (msg) => onStatusUpdate?.(msg),
        )

        if (abortedRef.current) break

        if (!poseResult) {
          onStatusUpdate?.(`⚠️ Could not confirm ${phase.label} pose — try again`)
          return null
        }

        if (phase.poseType === 'side_a' && poseResult?.yaw != null) {
          sideAYw = poseResult.yaw
          setSideAYaw(poseResult.yaw)
        }

        const phaseCaptures = await capturePhaseFrames(phaseIndex, phase.poseType, sideAYw)
        allCaptures.push(...phaseCaptures)

        if (phaseCaptures.length === 0) {
          onStatusUpdate?.(`⚠️ No valid frames for ${phase.id} — please retry`)
          return null
        }
      }

      if (allCaptures.length === 0) return null

      const selected = selectEnrollmentBurstSamples(allCaptures, {
        maxSamples: ENROLLMENT_TARGET_BURST_SAMPLES,
        minFrameGap: 1,
      })

      const selectedPhases = new Set(selected.map(c => c.phaseIndex))
      const genuinelyDiverse = selectedPhases.size >= 2

      // ✅ Warn if diversity is still low despite per-frame enforcement
      if (!genuinelyDiverse) {
        console.warn('[EnrollmentCapture] Low diversity in selected samples — only phases:', [...selectedPhases])
      }

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
          genuinelyDiverse,
          phasesCaptured: [...selectedPhases].length,
          sideAYw,
        },
      }
    } finally {
      setCapturePhase(-1)
      setPhaseProgress(0)
      setPoseOk(false)
      setCurrentYaw(null)
      setSideAYaw(null)
      captureAttemptRef.current = false
    }
  }, [waitForPose, capturePhaseFrames])

  const startDetect = useCallback((onCaptureComplete, modelsReady) => {
    stopDetect()
    captureAttemptRef.current = false
    abortedRef.current = false
    previewUrlRef.current = null
    setFaceFound(false)
    setFaceNeedsAlignment(false)
    setCurrentYaw(null)
    setPoseOk(false)
    setStatusMsg(modelsReady ? 'Center your face in the oval.' : 'Loading models...')

    if (!modelsReady) return

    const runDetection = async () => {
      if (busyRef.current || !camera.camOn || previewUrlRef.current || captureAttemptRef.current) return

      // Guard: video element may not be ready yet
      if (!camera.videoRef.current || camera.videoRef.current.readyState < 2) {
        setStatusMsg('Waiting for camera...')
        return
      }

      busyRef.current = true
      try {
        const canvas = camera.captureImageData({
          maxWidth: DETECTION_MAX_DIMENSION,
          maxHeight: DETECTION_MAX_DIMENSION,
        })
        const cropped = buildOvalCaptureCanvas(canvas)
        if (!cropped) {
          setStatusMsg('Camera not ready')
          return
        }
        const detections = await detectFaceBoxes(cropped)
        const ready = selectOvalReadyFace(detections, cropped.width, cropped.height)

        setFaceFound(Boolean(ready))
        setFaceNeedsAlignment(Boolean(!ready && detections.length))

        if (!ready) {
          setStatusMsg(detections.length ? 'Move into the oval guide.' : 'Scanning for face...')
          return
        }

        stopDetect()
        setStatusMsg('Face detected — starting 3-angle guided capture...')
        await wait(400)

        const result = await captureAllPhases((msg) => setStatusMsg(msg))

        if (result && !abortedRef.current) {
          previewUrlRef.current = result.previewUrl
          onCaptureComplete(result)
        } else if (!abortedRef.current) {
          setFaceFound(false)
          setStatusMsg('Could not complete capture. Please try again.')
          startDetect(onCaptureComplete, modelsReady)
        }
      } catch (err) {
        console.error('[EnrollmentCapture] Error:', err)
        setStatusMsg('Camera error — retrying...')
      } finally {
        busyRef.current = false
      }
    }

    runDetection()
    autoRef.current = window.setInterval(runDetection, REGISTRATION_SCAN_INTERVAL_MS)
  }, [camera, captureAllPhases, stopDetect])

  useEffect(() => {
    return () => {
      abortedRef.current = true
      if (autoRef.current) window.clearInterval(autoRef.current)
    }
  }, [])

  const resetCapture = useCallback(() => {
    abortedRef.current = true
    previewUrlRef.current = null
    setFaceFound(false)
    setFaceNeedsAlignment(false)
    setCapturePhase(-1)
    setPhaseProgress(0)
    setCurrentYaw(null)
    setPoseOk(false)
    setSideAYaw(null)
    setStatusMsg('Align face with the camera.')
    window.setTimeout(() => { abortedRef.current = false }, 100)
  }, [])

  return {
    capturePhase,
    phaseProgress,
    faceFound,
    faceNeedsAlignment,
    statusMsg,
    setStatusMsg,
    currentYaw,
    poseOk,
    sideAYaw,
    startDetect,
    stopDetect,
    resetCapture,
  }
}
