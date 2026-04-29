'use client'

/**
 * hooks/useEnrollmentCapture.js
 *
 * Key fix: capturePhaseFrames now re-checks pose PER FRAME during capture,
 * not just before the burst. Previously, waitForPose confirmed pose then
 * capturePhaseFrames started immediately — but if the user moved back to
 * center during the burst, all frames came from center and were
 * near-identical despite "guided" capture.
 *
 * Now: each captured frame must pass the pose check for its phase.
 * If a frame fails the pose check during capture, it is skipped.
 * We keep trying until we get FRAMES_PER_PHASE valid frames or timeout.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { detectFaceBoxes, detectWithDescriptors, detectPoseOnly } from '@/lib/biometrics/human'
import { getNavigatorDeviceProfile } from '@/lib/biometrics/device-profile'
import {
  getFaceAreaRatioFromBox,
  getFaceSizeGuidance,
  isFaceSizeCaptureReady,
} from '@/lib/biometrics/face-size-guidance'
import {
  buildOvalCaptureCanvas,
  selectOvalReadyFace,
} from '@/lib/biometrics/oval-capture'
import {
  scoreEnrollmentCapture,
  selectEnrollmentBurstSamples,
  summarizeEnrollmentCaptureQuality,
  ENROLLMENT_REQUIRED_PHASE_SAMPLE_COUNTS,
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
  {
    id: 'chin_down',
    label: 'Tilt chin down slightly',
    subtitle: 'As if looking at your phone',
    icon: '↓',
    poseType: 'chin_down',
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
const PITCH_CHIN_DOWN_MIN = 0.18
const CAPTURE_METRIC_SAMPLE_STEP = 4

function getCaptureTimingProfile() {
  const device = getNavigatorDeviceProfile()
  if (device.mobile) {
    return {
      frameIntervalMs: 250,
      frameMaxRetries: 12,
      posePollIntervalMs: 150,
      poseHoldStableMs: 500,
      preCaptureDelayMs: 600,
      registrationScanIntervalMs: Math.max(REGISTRATION_SCAN_INTERVAL_MS, 750),
      profile: 'mobile-wasm',
    }
  }

  return {
    frameIntervalMs: 200,
    frameMaxRetries: FRAME_MAX_RETRIES,
    posePollIntervalMs: 120,
    poseHoldStableMs: 400,
    preCaptureDelayMs: 450,
    registrationScanIntervalMs: REGISTRATION_SCAN_INTERVAL_MS,
    profile: 'desktop-wasm',
  }
}

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

export function estimateHeadPitch(mesh) {
  if (!Array.isArray(mesh) || mesh.length < 264) return null
  const getY = (i) => {
    const pt = mesh[i]
    if (!pt) return null
    return Array.isArray(pt) ? pt[1] : (typeof pt.y === 'number' ? pt.y : null)
  }
  const leftEyeY = getY(33)
  const rightEyeY = getY(263)
  const noseY = getY(1)
  const chinY = getY(152)
  if (leftEyeY == null || rightEyeY == null || noseY == null || chinY == null) return null
  const eyeY = (leftEyeY + rightEyeY) / 2
  const span = Math.max(10, chinY - eyeY)
  return (noseY - eyeY) / span
}

function resolveFacePose(result) {
  const yaw = Number.isFinite(result?.rotation?.yaw)
    ? Number(result.rotation.yaw)
    : result?.landmarks?.positions
      ? estimateHeadYaw(result.landmarks.positions)
      : null
  const pitch = Number.isFinite(result?.rotation?.pitch)
    ? Number(result.rotation.pitch)
    : result?.landmarks?.positions
      ? estimateHeadPitch(result.landmarks.positions)
      : null
  const roll = Number.isFinite(result?.rotation?.roll) ? Number(result.rotation.roll) : null
  return { yaw, pitch, roll }
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

function isPoseMatchingPhase(phaseType, yaw, sideAYaw, pitch) {
  switch (phaseType) {
    case 'center': return isPoseCentered(yaw)
    case 'side_a': return isPoseSufficient(yaw)
    case 'side_b': return isPoseOpposite(yaw, sideAYaw)
    case 'chin_down': return pitch !== null && pitch >= PITCH_CHIN_DOWN_MIN
    default: return true
  }
}

function getReadyFaceFromDetections(detections, width, height) {
  const ready = selectOvalReadyFace(detections, width, height)
  if (!ready) {
    return { ok: false, reason: 'oval', face: null, faceAreaRatio: null }
  }

  const faceAreaRatio = ready.faceAreaRatio ?? getFaceAreaRatioFromBox(ready.box, width, height)
  const guidance = getFaceSizeGuidance(faceAreaRatio)
  if (!guidance.isCaptureReady) {
    return { ok: false, reason: 'distance', face: ready.detection, faceAreaRatio, guidance }
  }

  return { ok: true, reason: '', face: ready.detection, faceAreaRatio, guidance }
}

export function getPoseGuidanceMessage(phaseType, yaw, sideAYw, pitch) {
  if (yaw === null && phaseType !== 'chin_down') return 'Position your face in the oval'
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
    case 'chin_down':
      if (pitch !== null && pitch >= PITCH_CHIN_DOWN_MIN) return '✓ Good — keep your chin slightly down'
      return 'Tilt your chin down slightly (phone-view posture)'
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

function buildCandidate(canvas, faceResult, phaseIndex, frameIndex, pose) {
  const metrics = measureCaptureMetrics(canvas, faceResult)
  return {
    attempt: phaseIndex * FRAMES_PER_PHASE + frameIndex,
    phaseId: CAPTURE_PHASES[phaseIndex]?.id || 'unknown',
    phaseIndex,
    descriptor: Array.from(faceResult?.descriptor || []),
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    metrics,
    score: scoreEnrollmentCapture(metrics),
    yaw: pose?.yaw ?? null,
    pitch: pose?.pitch ?? null,
    roll: pose?.roll ?? null,
  }
}

export function useEnrollmentCapture(camera) {
  const timingProfileRef = useRef(getCaptureTimingProfile())
  const [capturePhase, setCapturePhase] = useState(-1)
  const [phaseProgress, setPhaseProgress] = useState(0)
  const [faceFound, setFaceFound] = useState(false)
  const [faceNeedsAlignment, setFaceNeedsAlignment] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Align face with the camera.')
  const [currentYaw, setCurrentYaw] = useState(null)
  const [poseOk, setPoseOk] = useState(false)
  const [sideAYaw, setSideAYaw] = useState(null)
  const [faceSizeGuidance, setFaceSizeGuidance] = useState(() => getFaceSizeGuidance(null))

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
    const timingProfile = timingProfileRef.current
    const deadline = Date.now() + POSE_WAIT_TIMEOUT_MS
    let poseAchievedAt = null

    while (Date.now() < deadline && !abortedRef.current) {
      const canvas = camera.captureImageData({ maxWidth: 360, maxHeight: 360 })
      if (!canvas) { await wait(timingProfile.posePollIntervalMs); continue }

      const cropped = buildOvalCaptureCanvas(canvas)
      if (!cropped) { await wait(timingProfile.posePollIntervalMs); continue }
      let pose = { yaw: null, pitch: null, roll: null }
      try {
        const result = await detectPoseOnly(cropped)
        pose = resolveFacePose(result)
        const readyFace = getReadyFaceFromDetections(result ? [result] : [], cropped.width, cropped.height)
        setFaceSizeGuidance(readyFace.guidance || getFaceSizeGuidance(readyFace.faceAreaRatio))
        if (!readyFace.ok) {
          setCurrentYaw(pose.yaw)
          setPoseOk(false)
          updateStatus(readyFace.reason === 'distance'
            ? readyFace.guidance.detail
            : 'Center your face inside the oval')
          poseAchievedAt = null
          await wait(timingProfile.posePollIntervalMs)
          continue
        }
      } catch {}

      setCurrentYaw(pose.yaw)
      const poseMatch = isPoseMatchingPhase(phaseType, pose.yaw, sideAYw, pose.pitch)
      setPoseOk(poseMatch)
      updateStatus(getPoseGuidanceMessage(phaseType, pose.yaw, sideAYw, pose.pitch))

      if (poseMatch) {
        if (poseAchievedAt === null) poseAchievedAt = Date.now()
        else if (Date.now() - poseAchievedAt >= timingProfile.poseHoldStableMs) {
          return pose
        }
      } else {
        poseAchievedAt = null
      }

      await wait(timingProfile.posePollIntervalMs)
    }

    updateStatus('⚠️ Pose timeout — capturing best available frames')
    return null
  }, [camera])

  /**
   * FIX: Per-frame pose verification during capture.
   *
   * Each frame slot is retried up to FRAME_MAX_RETRIES times.
   * A frame is only accepted if the pose still matches the phase requirement.
   * This ensures diversity is ACTUALLY captured, not just detected once before burst.
   */
  const capturePhaseFrames = useCallback(async (phaseIndex, phaseType, sideAYw) => {
    const timingProfile = timingProfileRef.current
    const captures = []
    let frameSlot = 0

    while (frameSlot < FRAMES_PER_PHASE && !abortedRef.current) {
      let attempts = 0
      let captured = false

      while (attempts < timingProfile.frameMaxRetries && !captured && !abortedRef.current) {
        const canvas = camera.captureImageData({
          maxWidth: PREVIEW_MAX_DIMENSION,
          maxHeight: PREVIEW_MAX_DIMENSION,
        })
        const cropped = buildOvalCaptureCanvas(canvas)
        if (!cropped) { await wait(timingProfile.frameIntervalMs); continue }

        let faceResult = null
        let readyFace = null
        try {
          const detections = await detectWithDescriptors(cropped)
          readyFace = getReadyFaceFromDetections(detections, cropped.width, cropped.height)
          faceResult = readyFace.ok ? readyFace.face : null
        } catch {}

        if (faceResult && faceResult.descriptor?.length > 0) {
          const faceAreaRatio = readyFace?.faceAreaRatio ?? getFaceAreaRatioFromBox(faceResult?.detection?.box, cropped.width, cropped.height)
          setFaceSizeGuidance(readyFace?.guidance || getFaceSizeGuidance(faceAreaRatio))
          const pose = resolveFacePose(faceResult)

          // Verify position and pose DURING capture, not just before the burst.
          const poseStillOk = isPoseMatchingPhase(phaseType, pose.yaw, sideAYw, pose.pitch)

          if (poseStillOk) {
            captures.push(buildCandidate(cropped, faceResult, phaseIndex, frameSlot, pose))
            captured = true
            frameSlot++
            setPhaseProgress(frameSlot)
          }
          // If pose slipped, retry this frame slot without incrementing frameSlot
        } else if (readyFace?.guidance) {
          setFaceSizeGuidance(readyFace.guidance)
          setStatusMsg(readyFace.reason === 'distance'
            ? readyFace.guidance.detail
            : 'Center your face inside the oval')
        }

        if (!captured) {
          attempts++
          await wait(timingProfile.frameIntervalMs)
        }
      }

      // If we couldn't get a pose-valid frame after max retries, skip this slot
      // (better to have 2 good frames than 3 frames including a bad one)
      if (!captured) {
        console.warn(`[EnrollmentCapture] Phase ${phaseIndex} frame slot ${frameSlot} — could not capture valid pose after ${timingProfile.frameMaxRetries} attempts, skipping`)
        frameSlot++
      }

      if (captured) {
        await wait(timingProfile.frameIntervalMs)
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

        onStatusUpdate?.(`Phase ${phaseIndex + 1}/${CAPTURE_PHASES.length} — ${phase.label}`)

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
        requiredPhaseIds: CAPTURE_PHASES.map(phase => phase.id),
        minPhaseCounts: ENROLLMENT_REQUIRED_PHASE_SAMPLE_COUNTS,
      })

      const phaseSampleCounts = selected.reduce((counts, capture) => {
        const phaseId = String(capture?.phaseId || '')
        if (phaseId) counts[phaseId] = (counts[phaseId] || 0) + 1
        return counts
      }, {})
      const supportPairsReady = CAPTURE_PHASES.every(phase => (
        Number(phaseSampleCounts[phase.id] || 0) >= Number(ENROLLMENT_REQUIRED_PHASE_SAMPLE_COUNTS[phase.id] || 0)
      ))
      const selectedPhases = new Set(selected.map(c => c.phaseIndex))
      const genuinelyDiverse = selectedPhases.size === CAPTURE_PHASES.length && supportPairsReady

      // ✅ Warn if diversity is still low despite per-frame enforcement
      if (!genuinelyDiverse) {
        console.warn('[EnrollmentCapture] Low support diversity in selected samples', {
          phases: [...selectedPhases],
          phaseSampleCounts,
        })
        onStatusUpdate?.('Could not keep 2 validated frames for every pose — retrying capture')
        return null
      }

      const primary = selected[0]
      const quality = summarizeEnrollmentCaptureQuality(primary.metrics)
      const phaseIds = Array.from(new Set(selected.map(c => c.phaseId)))
      const captureMetadata = {
        modelVersion: 'human-faceres-browser-v1',
        captureProfile: 'guided_4_phase',
        timingProfile: timingProfileRef.current.profile,
        keptCount: selected.length,
        detectedCount: allCaptures.length,
        phasesCompleted: CAPTURE_PHASES.length,
        phasesCaptured: phaseIds,
        phaseSampleCounts,
        supportPairsReady,
        genuinelyDiverse,
        qualityScore: Math.round((Number(primary.score || 0)) * 100) / 100,
        primaryMetrics: primary.metrics,
        device: {
          ...getNavigatorDeviceProfile(),
          ...(camera?.getTrackSettings?.() || {}),
        },
      }

      return {
        descriptors: selected.map(c => c.descriptor),
        sampleFrames: selected.map(c => ({
          phaseId: String(c.phaseId || ''),
          frameDataUrl: c.previewUrl,
        })),
        previewUrl: primary.previewUrl,
        qualitySummary: quality,
        captureMetadata,
        burstSummary: {
          keptCount: selected.length,
          detectedCount: allCaptures.length,
          phasesCompleted: CAPTURE_PHASES.length,
          genuinelyDiverse,
          phasesCaptured: phaseIds.length,
          phaseIds,
          phaseSampleCounts,
          supportPairsReady,
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
    timingProfileRef.current = getCaptureTimingProfile()
    setFaceFound(false)
    setFaceNeedsAlignment(false)
    setCurrentYaw(null)
    setPoseOk(false)
    setStatusMsg(modelsReady ? 'Center your face in the oval.' : 'Loading models...')
    setFaceSizeGuidance(getFaceSizeGuidance(null))

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
        const largestFace = detections.length > 0
          ? detections.reduce((best, curr) => {
              const currBox = curr?.detection?.box || curr?.box
              const bestBox = best?.detection?.box || best?.box
              if (!currBox) return best
              if (!bestBox) return curr
              return (currBox.width * currBox.height) > (bestBox.width * bestBox.height) ? curr : best
            }, null)
          : null
        const faceAreaRatio = ready?.faceAreaRatio ?? getFaceAreaRatioFromBox(
          largestFace?.detection?.box || largestFace?.box || null,
          cropped.width,
          cropped.height,
        )
        const guidance = getFaceSizeGuidance(faceAreaRatio)
        setFaceSizeGuidance(guidance)

        setFaceFound(Boolean(ready))
        setFaceNeedsAlignment(Boolean(!ready && detections.length))

        if (!ready) {
          setStatusMsg(detections.length ? 'Move into the oval guide.' : 'Scanning for face...')
          return
        }

        if (!isFaceSizeCaptureReady(faceAreaRatio)) {
          setStatusMsg(guidance.detail)
          return
        }

        stopDetect()
        setStatusMsg(`Face detected — starting ${CAPTURE_PHASES.length}-phase guided capture...`)
        await wait(timingProfileRef.current.preCaptureDelayMs)

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
    autoRef.current = window.setInterval(runDetection, timingProfileRef.current.registrationScanIntervalMs)
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
    setFaceSizeGuidance(getFaceSizeGuidance(null))
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
    faceSizeGuidance,
    startDetect,
    stopDetect,
    resetCapture,
  }
}
