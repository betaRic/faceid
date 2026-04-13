import { useCallback, useRef } from 'react'
import { detectFaceBoxes } from '@/lib/biometrics/human'
import {
  CONFIRM_FRAMES,
  DESCRIPTOR_LENGTH,
  KIOSK_IDLE_SCAN_MS,
  KIOSK_ACTIVE_SCAN_MS,
  CONFIRMED_HOLD_MS,
  KIOSK_IDLE_DETECTION_MAX_DIMENSION,
  KIOSK_ATTEMPT_COOLDOWN_MS,
  KIOSK_FACE_LOSS_GRACE_MS,
  UNKNOWN_DEBOUNCE_MS,
} from '@/lib/config'

import { buildAttendanceEntryTiming } from '@/lib/attendance-time'
import { selectPrimaryFace, getSafeDecisionMessage, drawBracketBox } from '@/lib/kiosk-utils'
// buildOvalCaptureCanvas is now used here for the same reason it's used in registration:
// detection geometry must match so that selectOvalReadyFace sees face coordinates
// relative to the same portrait-cropped oval frame as the enrollment pipeline.
import { buildOvalCaptureCanvas, selectOvalReadyFace } from '@/lib/biometrics/oval-capture'

export function useKioskLoop({
  camera,
  modelsReady,
  locationState,
  onLogAttendance,
  kioskState,
  setKioskState,
  setCurrentMatch,
  setCapturedFrameUrl,
  setFlashKey,
  setAlertState,
  setFaceDistanceInfo,
  confirmRef,
  confirmedTimer,
  unknownTimer,
  attemptCooldownUntilRef,
  faceLossTimerRef,
  pausedRef,
  scheduleResume,
  showAlertAndResume,
}) {
  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const faceDetectedRef = useRef(false)

  const drawOverlay = useCallback((detection, sourceWidth, sourceHeight) => {
    const video = camera.videoRef.current
    const overlay = camera.overlayRef.current

    if (!overlay || !video) return

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    overlay.width = width
    overlay.height = height

    // Clear overlay — no bounding box drawn in kiosk to avoid distraction
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, width, height)
  }, [camera])

  const runScan = useCallback(async (captureVerificationBurst) => {
    if (busyRef.current || pausedRef.current || !camera.camOn || !modelsReady) return

    busyRef.current = true

    try {
      const scanStart = performance.now()

      // ── STEP 1: capture raw frame ─────────────────────────────────────────
      const rawCanvas = camera.captureImageData({
        maxWidth: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
        maxHeight: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
      })
      if (!rawCanvas) {
        busyRef.current = false
        return
      }

      // ── STEP 2: crop to oval BEFORE detection ──────────────────────────────
      // This is the critical fix: registration crops to oval before detectFaceBoxes,
      // so kiosk must do the same. Without this, selectOvalReadyFace evaluates face
      // coordinates against full-frame dimensions (e.g. 480×270) instead of the
      // portrait oval crop (e.g. ~183×270), making the area-ratio threshold ~2.5×
      // harder to pass at the same physical distance.
      const canvas = buildOvalCaptureCanvas(rawCanvas)
      const detections = await detectFaceBoxes(canvas)
      const scanDuration = performance.now() - scanStart

      if (typeof window !== 'undefined' && window.getKioskMetrics) {
        window.getKioskMetrics().recordScan(scanDuration)
      }

      // ── STEP 3: face-in-oval gate (identical geometry to registration) ─────
      const ovalReady = selectOvalReadyFace(detections, canvas.width, canvas.height)

      // ── STEP 4: distance feedback (visual only — does NOT gate verification) ─
      // Ratios are now oval-relative, matching what the user sees in the UI oval.
      const largestFace = detections.length > 0 ? detections.reduce((best, curr) => {
        const currBox = curr?.detection?.box || curr?.box
        const bestBox = best?.detection?.box || best?.box
        if (!currBox) return best
        if (!bestBox) return curr
        const currArea = currBox.width * currBox.height
        const bestArea = bestBox.width * bestBox.height
        return currArea > bestArea ? curr : best
      }, null) : null

      if (largestFace) {
        const box = largestFace?.detection?.box || largestFace?.box
        if (box) {
          const frameArea = canvas.width * canvas.height
          const faceArea = box.width * box.height
          const ratio = faceArea / frameArea
          // Thresholds tuned for oval canvas (portrait, ~0.68 aspect ratio)
          let status = 'too-far'
          if (ratio > 0.80) status = 'too-close'
          else if (ratio >= 0.06) status = 'perfect'
          else if (ratio >= 0.03) status = 'good'
          else status = 'too-far'
          setFaceDistanceInfo({ faceAreaRatio: ratio, status })
        }
      } else {
        if (!faceDetectedRef.current) {
          setFaceDistanceInfo(null)
        }
      }

      // ── No face in oval → reset state, start face-loss grace timer ─────────
      if (!ovalReady) {
        faceDetectedRef.current = false
        if (!confirmedTimer.current && !faceLossTimerRef.current) {
          faceLossTimerRef.current = window.setTimeout(() => {
            window.clearTimeout(unknownTimer.current)
            unknownTimer.current = null
            setKioskState('idle')
            setCurrentMatch(null)
            confirmRef.current = 0
            camera.clearOverlay()
            faceLossTimerRef.current = null
          }, KIOSK_FACE_LOSS_GRACE_MS)
        }
        camera.clearOverlay()
        busyRef.current = false
        return
      }

      // ── Face IS in oval ───────────────────────────────────────────────────
      faceDetectedRef.current = true

      if (faceLossTimerRef.current) {
        window.clearTimeout(faceLossTimerRef.current)
        faceLossTimerRef.current = null
      }

      window.clearTimeout(unknownTimer.current)
      unknownTimer.current = null

      const ovalBox = ovalReady.box
      drawOverlay({ detection: { box: ovalBox } }, canvas.width, canvas.height)

      // ── Update scanning state ─────────────────────────────────────────────
      // The previous PERFECT_POSITION_HOLD_MS=600 block was removed:
      //   • It required a 600 ms hold *before* confirmRef even started counting.
      //   • Combined with CONFIRM_FRAMES=3, users had to hold ~900ms+ before
      //     verification was ever triggered.
      //   • CONFIRM_FRAMES already provides a natural multi-frame debounce.
      setKioskState('scanning')

      if (confirmRef.current < CONFIRM_FRAMES) {
        confirmRef.current += 1
      }

      // ── Trigger verification once enough frames confirmed ─────────────────
      if (confirmRef.current >= CONFIRM_FRAMES && Date.now() >= attemptCooldownUntilRef.current) {
        const now = Date.now()
        attemptCooldownUntilRef.current = now + KIOSK_ATTEMPT_COOLDOWN_MS
        pausedRef.current = true
        setKioskState('verifying')
        camera.clearOverlay()

        const verifyStart = performance.now()
        const burstResult = await captureVerificationBurst()
        const verifyDuration = performance.now() - verifyStart
        const networkStart = performance.now()

        if (!burstResult) {
          if (typeof window !== 'undefined' && window.getKioskMetrics) {
            window.getKioskMetrics().recordVerification(verifyDuration, false)
          }
          setCapturedFrameUrl(null)
          setKioskState('unknown')
          pausedRef.current = true
          showAlertAndResume('No reliable face match was found.')
          confirmRef.current = 0
          return
        }

        const { allCaptures, canvas: bestCanvas, landmarks } = burstResult
        const primaryVerification = selectPrimaryFace(burstResult.detections, bestCanvas.width, bestCanvas.height)

        if (!primaryVerification?.detection?.descriptor) {
          setKioskState('unknown')
          pausedRef.current = true
          showAlertAndResume('No reliable face match was found.')
          confirmRef.current = 0
          return
        }

        if (allCaptures.length > 1) {
          const multiFaceFrames = allCaptures.filter(c => c.detections && c.detections.length > 1)
          if (multiFaceFrames.length > 0) {
            setKioskState('blocked')
            pausedRef.current = true
            showAlertAndResume('Multiple faces detected. One employee at a time.', 2400)
            confirmRef.current = 0
            return
          }
        }

        const descriptor = Array.from(primaryVerification.detection.descriptor)
        if (descriptor.length !== DESCRIPTOR_LENGTH) {
          setKioskState('unknown')
          pausedRef.current = true
          showAlertAndResume(`Face capture error — unexpected descriptor length ${descriptor.length}. Expected ${DESCRIPTOR_LENGTH}. Check model configuration.`, 3000)
          confirmRef.current = 0
          return
        }

        setCapturedFrameUrl(bestCanvas.toDataURL('image/jpeg', 0.82))
        const coordinates = locationState?.coords || null
        const wifiSsid = locationState?.wifiSsid || null
        const timing = buildAttendanceEntryTiming(now)
        let attendanceAccepted = false

        try {
          const result = await onLogAttendance({
            id: `${now}`,
            name: '',
            employeeId: '',
            officeId: '',
            officeName: '',
            attendanceMode: '',
            geofenceStatus: '',
            confidence: 0,
            landmarks: landmarks || [],
            timestamp: timing.timestamp,
            dateKey: timing.dateKey,
            dateLabel: timing.dateLabel,
            date: timing.date,
            time: timing.time,
            latitude: coordinates?.latitude ?? null,
            longitude: coordinates?.longitude ?? null,
            wifiSsid,
            descriptor,
          })
          const networkDuration = performance.now() - networkStart

          if (typeof window !== 'undefined' && window.getKioskMetrics) {
            window.getKioskMetrics().recordVerification(verifyDuration + networkDuration, result.entry !== undefined)
            window.getKioskMetrics().recordNetwork(networkDuration, result.entry !== undefined)
          }

          if (result.entry) {
            setFlashKey(value => value + 1)
            const actionLabel = result.entry.action === 'checkout' ? 'Checked out' : 'Checked in'
            setCurrentMatch({
              name: result.entry.name || 'Attendance recorded',
              confidence: result.entry.confidence ?? 0,
              officeName: result.entry.officeName || null,
              officeId: result.entry.officeId || null,
              employeeId: result.entry.employeeId || null,
              time: result.entry.time || timing.time,
              timestamp: Number(result.entry.timestamp ?? timing.timestamp),
              action: result.entry.action || '',
              attendanceMode: result.entry.attendanceMode || '',
              detail: `${actionLabel} successfully`,
            })
            setKioskState('confirmed')
            setAlertState(null)
            attendanceAccepted = true
          } else {
            setKioskState('unknown')
            pausedRef.current = true
            showAlertAndResume('No reliable face match was found. Ensure you are enrolled.', 3000)
          }
        } catch (error) {
          const networkDuration = performance.now() - networkStart
          if (typeof window !== 'undefined' && window.getKioskMetrics) {
            window.getKioskMetrics().recordVerification(verifyDuration + networkDuration, false)
            window.getKioskMetrics().recordNetwork(networkDuration, false)
          }
          const decisionCode = error?.decisionCode || 'blocked_server_error'
          const safeDecision = getSafeDecisionMessage(decisionCode)
          if (decisionCode === 'blocked_no_reliable_match') {
            setKioskState('unknown')
            showAlertAndResume('No reliable face match was found.', 3000)
          } else if (decisionCode === 'blocked_ambiguous_match') {
            setKioskState('blocked')
            showAlertAndResume(safeDecision.detail, 4000)
          } else if (decisionCode === 'blocked_liveness_failed') {
            setKioskState('unknown')
            showAlertAndResume('Move slightly and try again.', 3500)
          } else {
            setKioskState('blocked')
            showAlertAndResume(safeDecision.detail, 4000)
          }
        }

        confirmRef.current = 0
      }
    } catch (error) {
      attemptCooldownUntilRef.current = Date.now() + KIOSK_ATTEMPT_COOLDOWN_MS
      confirmRef.current = 0
      const decisionCode = error?.decisionCode || 'blocked_server_error'
      const safeDecision = getSafeDecisionMessage(decisionCode)

      if (decisionCode === 'blocked_no_reliable_match' || decisionCode === 'blocked_ambiguous_match') {
        if (!confirmedTimer.current && !unknownTimer.current) {
          unknownTimer.current = window.setTimeout(() => {
            setKioskState(decisionCode === 'blocked_ambiguous_match' ? 'blocked' : 'unknown')
            setCurrentMatch({
              name: safeDecision.name,
              confidence: 0,
              detail: safeDecision.detail,
            })
            confirmRef.current = 0
            unknownTimer.current = null
          }, UNKNOWN_DEBOUNCE_MS)
        }
        showAlertAndResume(safeDecision.detail, 3000)
      } else if (decisionCode === 'blocked_recent_duplicate' || decisionCode === 'blocked_day_complete') {
        setKioskState('blocked')
        setCurrentMatch({
          name: error.entry?.name || safeDecision.name,
          confidence: error.entry?.confidence ?? 0,
          officeName: error.entry?.officeName,
          detail: safeDecision.detail,
        })
        showAlertAndResume(safeDecision.detail, 4000)
      } else if (decisionCode === 'blocked_liveness_failed') {
        setKioskState('unknown')
        showAlertAndResume('Move slightly and try again.', 3500)
      } else {
        setKioskState('blocked')
        setCurrentMatch({
          name: safeDecision.name,
          confidence: 0,
          detail: safeDecision.detail,
        })
        showAlertAndResume(safeDecision.detail, 4000)
      }
      pausedRef.current = true
    } finally {
      busyRef.current = false
    }
  }, [camera, modelsReady, locationState, kioskState, setKioskState, setCurrentMatch, setCapturedFrameUrl, setFlashKey, setAlertState, confirmRef, confirmedTimer, unknownTimer, attemptCooldownUntilRef, faceLossTimerRef, pausedRef, scheduleResume, showAlertAndResume, drawOverlay])

  const startLoop = useCallback((runScanFn) => {
    if (scanRef.current) return

    const scheduleNext = (delay = 0) => {
      scanRef.current = window.setTimeout(async () => {
        scanRef.current = null
        await runScanFn()

        if (!pausedRef.current) {
          const nextDelay = faceDetectedRef.current ? KIOSK_ACTIVE_SCAN_MS : KIOSK_IDLE_SCAN_MS
          scheduleNext(nextDelay)
        }
      }, delay)
    }

    pausedRef.current = false
    scheduleNext()
  }, [])

  const stopLoop = useCallback(() => {
    if (scanRef.current) {
      window.clearTimeout(scanRef.current)
      scanRef.current = null
    }
  }, [])

  return {
    runScan,
    startLoop,
    stopLoop,
  }
}
