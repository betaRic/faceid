/**
 * hooks/useKioskLoop.js — Quality gate addition
 *
 * Key fix: before triggering verification burst, we now check that the face
 * meets minimum quality requirements:
 * - faceAreaRatio >= KIOSK_MIN_FACE_AREA_RATIO (face big enough)
 * - face center within KIOSK_MAX_CENTER_OFFSET_RATIO of oval center
 *
 * This prevents the "scan too fast" problem where a partially-visible or
 * tilted face triggers verification and gets a bad embedding.
 *
 * CONFIRM_FRAMES is also now 5 (was 3), requiring a 400ms stable hold.
 * Both changes together mean: user must hold face steady for ~400ms AND
 * the face must be properly sized and centered before verification fires.
 */

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
  KIOSK_MIN_FACE_AREA_RATIO,
  KIOSK_MAX_CENTER_OFFSET_RATIO,
} from '@/lib/config'
import { buildAttendanceEntryTiming } from '@/lib/attendance-time'
import { selectPrimaryFace, getSafeDecisionMessage } from '@/lib/kiosk-utils'
import { buildOvalCaptureCanvas, selectOvalReadyFace } from '@/lib/biometrics/oval-capture'

/**
 * Returns true if the face meets minimum quality for verification.
 * We are stricter here than the oval gate (which allows small/off-center faces
 * for the distance indicator). Verification should only fire on a good face.
 */
function facePassesQualityGate(box, canvasWidth, canvasHeight) {
  if (!box) return false

  const frameArea = canvasWidth * canvasHeight
  const faceArea = box.width * box.height
  const faceAreaRatio = faceArea / frameArea

  // Must be big enough — distant or partial faces give bad embeddings
  if (faceAreaRatio < KIOSK_MIN_FACE_AREA_RATIO) return false

  // Face center must not be too far off-center
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const offsetX = Math.abs(centerX - canvasWidth / 2) / canvasWidth
  const offsetY = Math.abs(centerY - canvasHeight / 2) / canvasHeight
  if (offsetX > KIOSK_MAX_CENTER_OFFSET_RATIO || offsetY > KIOSK_MAX_CENTER_OFFSET_RATIO) return false

  return true
}

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

  const runScan = useCallback(async (captureVerificationBurst) => {
    if (busyRef.current || pausedRef.current || !camera.camOn || !modelsReady) return

    busyRef.current = true
    try {
      const rawCanvas = camera.captureImageData({
        maxWidth: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
        maxHeight: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
      })
      if (!rawCanvas) return

      const canvas = buildOvalCaptureCanvas(rawCanvas)
      if (!canvas) return
      
      const detections = await detectFaceBoxes(canvas)

      // Distance feedback (visual only)
      const largestFace = detections.length > 0
        ? detections.reduce((best, curr) => {
            const currBox = curr?.detection?.box || curr?.box
            const bestBox = best?.detection?.box || best?.box
            if (!currBox) return best
            if (!bestBox) return curr
            return currBox.width * currBox.height > bestBox.width * bestBox.height ? curr : best
          }, null)
        : null

      if (largestFace) {
        const box = largestFace?.detection?.box || largestFace?.box
        if (box) {
          const ratio = (box.width * box.height) / (canvas.width * canvas.height)
          setFaceDistanceInfo({
            faceAreaRatio: ratio,
            status: ratio > 0.80 ? 'too-close' : ratio >= 0.06 ? 'perfect' : ratio >= 0.03 ? 'good' : 'too-far',
          })
        }
      } else if (!faceDetectedRef.current) {
        setFaceDistanceInfo(null)
      }

      const ovalReady = selectOvalReadyFace(detections, canvas.width, canvas.height)

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
        return
      }

      faceDetectedRef.current = true
      if (faceLossTimerRef.current) {
        window.clearTimeout(faceLossTimerRef.current)
        faceLossTimerRef.current = null
      }
      window.clearTimeout(unknownTimer.current)
      unknownTimer.current = null

      const ovalBox = ovalReady.box
      setKioskState('scanning')

      if (confirmRef.current < CONFIRM_FRAMES) {
        confirmRef.current += 1
      }

      if (confirmRef.current >= CONFIRM_FRAMES && Date.now() >= attemptCooldownUntilRef.current) {

        // ✅ Quality gate — don't verify on partial/distant/off-center faces
        if (!facePassesQualityGate(ovalBox, canvas.width, canvas.height)) {
          // Don't reset confirmRef — keep counting but don't trigger yet
          // The face just needs to get closer / more centered
          setKioskState('scanning')
          return
        }

        const now = Date.now()
        attemptCooldownUntilRef.current = now + KIOSK_ATTEMPT_COOLDOWN_MS
        pausedRef.current = true
        setKioskState('verifying')
        camera.clearOverlay()

        const burstResult = await captureVerificationBurst()

        if (!burstResult) {
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
          showAlertAndResume(`Face capture error — unexpected descriptor length ${descriptor.length}.`, 3000)
          confirmRef.current = 0
          return
        }

        const antispoof = primaryVerification.detection.antispoof
        const liveness = primaryVerification.detection.liveness
        
        if (antispoof !== undefined && antispoof <= 0.3) {
          setKioskState('blocked')
          pausedRef.current = true
          showAlertAndResume('Photo or screen detected. Please present your live face.', 3500)
          confirmRef.current = 0
          return
        }

        if (liveness !== undefined && liveness <= 0.3) {
          setKioskState('blocked')
          pausedRef.current = true
          showAlertAndResume('Fake face detected. Please scan your live face.', 3500)
          confirmRef.current = 0
          return
        }

        setCapturedFrameUrl(bestCanvas.toDataURL('image/jpeg', 0.82))
        const coordinates = locationState?.coords || null
        const timing = buildAttendanceEntryTiming(now)

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
            antispoof: antispoof,
            liveness: liveness,
            timestamp: timing.timestamp,
            dateKey: timing.dateKey,
            dateLabel: timing.dateLabel,
            date: timing.date,
            time: timing.time,
            latitude: coordinates?.latitude ?? null,
            longitude: coordinates?.longitude ?? null,
            descriptor,
          })

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
              needsReenrollment: result.needsReenrollment || false,
              personId: result.personId || null,
            })
            setKioskState('confirmed')
            setAlertState(null)
          } else {
            setKioskState('unknown')
            pausedRef.current = true
            showAlertAndResume('No reliable face match was found. Ensure you are enrolled.', 3000)
          }
        } catch (error) {
          const decisionCode = error?.decisionCode || 'blocked_server_error'
          const safeDecision = getSafeDecisionMessage(decisionCode)
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[KioskLoop] Attendance rejected', {
              decisionCode,
              message: error?.message || null,
              detail: safeDecision.detail,
              debug: error?.debug || null,
              entry: error?.entry || null,
            })
          }
          if (decisionCode === 'blocked_no_reliable_match') {
            setKioskState('unknown')
            showAlertAndResume('No reliable face match was found.', 3000)
          } else if (decisionCode === 'blocked_ambiguous_match') {
            setKioskState('blocked')
            showAlertAndResume(safeDecision.detail, 4000)
          } else if (decisionCode === 'blocked_liveness' || decisionCode === 'blocked_antispoof') {
            setKioskState('unknown')
            showAlertAndResume(safeDecision.detail, 3500)
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
            setCurrentMatch({ name: safeDecision.name, confidence: 0, detail: safeDecision.detail })
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
      } else if (decisionCode === 'blocked_liveness' || decisionCode === 'blocked_antispoof') {
        setKioskState('unknown')
        showAlertAndResume(safeDecision.detail, 3500)
      } else {
        setKioskState('blocked')
        setCurrentMatch({ name: safeDecision.name, confidence: 0, detail: safeDecision.detail })
        showAlertAndResume(safeDecision.detail, 4000)
      }
      pausedRef.current = true
    } finally {
      busyRef.current = false
    }
  }, [camera, modelsReady, locationState, kioskState, setKioskState, setCurrentMatch, setCapturedFrameUrl, setFlashKey, setAlertState, confirmRef, confirmedTimer, unknownTimer, attemptCooldownUntilRef, faceLossTimerRef, pausedRef, scheduleResume, showAlertAndResume])

  const startLoop = useCallback((runScanFn) => {
    if (scanRef.current) return
    const scheduleNext = (delay = 0) => {
      scanRef.current = window.setTimeout(async () => {
        scanRef.current = null
        await runScanFn()
        if (!pausedRef.current) {
          scheduleNext(faceDetectedRef.current ? KIOSK_ACTIVE_SCAN_MS : KIOSK_IDLE_SCAN_MS)
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

  return { runScan, startLoop, stopLoop }
}
