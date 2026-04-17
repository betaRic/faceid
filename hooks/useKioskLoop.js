/**
 * hooks/useKioskLoop.js — Quality gate addition
 *
 * Key fix: before triggering verification burst, we now check that the face
 * meets minimum quality requirements:
 * - shared face-size ready band is satisfied
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
import { requestAttendanceChallenge } from '@/lib/data-store'
import { getNavigatorDeviceProfile } from '@/lib/biometrics/device-profile'
import { detectFaceBoxes } from '@/lib/biometrics/human'
import { SCAN_CAPTURE_POLICY_VERSION } from '@/lib/attendance/capture-policy'
import {
  CONFIRM_FRAMES,
  DESCRIPTOR_LENGTH,
  KIOSK_IDLE_SCAN_MS,
  KIOSK_ACTIVE_SCAN_MS,
  KIOSK_IDLE_DETECTION_MAX_DIMENSION,
  KIOSK_ATTEMPT_COOLDOWN_MS,
  KIOSK_FACE_LOSS_GRACE_MS,
  UNKNOWN_DEBOUNCE_MS,
  KIOSK_MAX_CENTER_OFFSET_RATIO,
} from '@/lib/config'
import { buildAttendanceEntryTiming } from '@/lib/attendance-time'
import { selectPrimaryFace, getSafeDecisionMessage } from '@/lib/kiosk-utils'
import { buildOvalCaptureCanvas, selectOvalReadyFace } from '@/lib/biometrics/oval-capture'
import {
  getFaceAreaRatioFromBox,
  getFaceSizeGuidance,
  isFaceSizeCaptureReady,
} from '@/lib/biometrics/face-size-guidance'

function getClientCaptureContext() {
  let kioskId = ''
  try {
    kioskId = window.localStorage.getItem('faceattend:kiosk-device-id') || ''
    if (!kioskId) {
      kioskId = window.crypto?.randomUUID?.() || `kiosk-${Date.now()}`
      window.localStorage.setItem('faceattend:kiosk-device-id', kioskId)
    }
  } catch {}
  return {
    ...getNavigatorDeviceProfile(),
    kioskId,
  }
}

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

function getBrowserLabel(userAgent = '') {
  const value = String(userAgent || '')
  if (/edg/i.test(value)) return 'Edge'
  if (/chrome|crios/i.test(value)) return 'Chrome'
  if (/safari/i.test(value) && !/chrome|crios|android/i.test(value)) return 'Safari'
  if (/firefox|fxios/i.test(value)) return 'Firefox'
  return 'Unknown'
}

/**
 * Returns true if the face meets minimum quality for verification.
 * The shared face-size ready band is the real distance gate. A separate kiosk-only
 * minimum caused hidden mismatch and made the guidance harder to reason about.
 */
function facePassesQualityGate(box, canvasWidth, canvasHeight) {
  if (!box) return false

  const faceAreaRatio = getFaceAreaRatioFromBox(box, canvasWidth, canvasHeight)
  if (!Number.isFinite(faceAreaRatio)) return false

  if (!isFaceSizeCaptureReady(faceAreaRatio)) return false

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
  setKioskState,
  setCurrentMatch,
  setCapturedFrameUrl,
  setFlashKey,
  setAlertState,
  setChallengeState,
  setFaceDistanceInfo,
  confirmRef,
  confirmedTimer,
  unknownTimer,
  attemptCooldownUntilRef,
  faceLossTimerRef,
  pausedRef,
  showAlertAndResume,
  recordScan,
  recordVerification,
  recordNetwork,
}) {
  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const faceDetectedRef = useRef(false)
  const distanceSamplesRef = useRef([])

  const runScan = useCallback(async (captureVerificationBurst, captureActiveChallenge) => {
    if (busyRef.current || pausedRef.current || !camera.camOn || !modelsReady) return

    busyRef.current = true
    const scanStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    try {
      const rawCanvas = camera.captureImageData({
        maxWidth: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
        maxHeight: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
      })
      if (!rawCanvas) return

      const canvas = buildOvalCaptureCanvas(rawCanvas)
      if (!canvas) return
      
      const detections = await detectFaceBoxes(canvas)

      const largestFace = detections.length > 0
        ? detections.reduce((best, curr) => {
            const currBox = curr?.detection?.box || curr?.box
            const bestBox = best?.detection?.box || best?.box
            if (!currBox) return best
            if (!bestBox) return curr
            return currBox.width * currBox.height > bestBox.width * bestBox.height ? curr : best
          }, null)
        : null
      const ovalReady = selectOvalReadyFace(detections, canvas.width, canvas.height)
      const distanceSource = ovalReady?.box ? { box: ovalReady.box } : largestFace

      if (distanceSource) {
        const box = distanceSource?.detection?.box || distanceSource?.box
        if (box) {
          const ratio = getFaceAreaRatioFromBox(box, canvas.width, canvas.height)
          if (Number.isFinite(ratio)) {
            distanceSamplesRef.current.push(ratio)
            if (distanceSamplesRef.current.length > 4) {
              distanceSamplesRef.current.shift()
            }
          }
          const smoothedRatio = distanceSamplesRef.current.length > 0
            ? distanceSamplesRef.current.reduce((sum, value) => sum + value, 0) / distanceSamplesRef.current.length
            : ratio
          const guidance = getFaceSizeGuidance(smoothedRatio)
          setFaceDistanceInfo({
            faceAreaRatio: smoothedRatio,
            rawFaceAreaRatio: ratio,
            ...guidance,
          })
        }
      } else if (!faceDetectedRef.current) {
        distanceSamplesRef.current = []
        setFaceDistanceInfo(null)
      }

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

        const verificationStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const burstResult = await captureVerificationBurst()

        if (!burstResult) {
          recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, false)
          setCapturedFrameUrl(null)
          setKioskState('unknown')
          pausedRef.current = true
          showAlertAndResume('No reliable face match was found.')
          confirmRef.current = 0
          return
        }

        const {
          allCaptures,
          canvas: bestCanvas,
          landmarks,
          fusedDescriptor,
          descriptorSpread,
          burstDiagnostics,
        } = burstResult
        const primaryVerification = selectPrimaryFace(burstResult.detections, bestCanvas.width, bestCanvas.height)

        if (!primaryVerification?.detection?.descriptor) {
          recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, false)
          setKioskState('unknown')
          pausedRef.current = true
          showAlertAndResume('No reliable face match was found.')
          confirmRef.current = 0
          return
        }

        if (allCaptures.length > 1) {
          const multiFaceFrames = allCaptures.filter(c => c.detections && c.detections.length > 1)
          if (multiFaceFrames.length > 0) {
            recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, false)
            setKioskState('blocked')
            pausedRef.current = true
            showAlertAndResume('Multiple faces detected. One employee at a time.', 2400)
            confirmRef.current = 0
            return
          }
        }

        const descriptor = Array.isArray(fusedDescriptor) && fusedDescriptor.length > 0
          ? fusedDescriptor
          : Array.from(primaryVerification.detection.descriptor)
        if (descriptor.length !== DESCRIPTOR_LENGTH) {
          recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, false)
          setKioskState('unknown')
          pausedRef.current = true
          showAlertAndResume(`Face capture error — unexpected descriptor length ${descriptor.length}.`, 3000)
          confirmRef.current = 0
          return
        }

        const antispoof = primaryVerification.detection.antispoof
        const liveness = primaryVerification.detection.liveness
        
        if (antispoof !== undefined && antispoof <= 0.3) {
          recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, false)
          setKioskState('blocked')
          pausedRef.current = true
          showAlertAndResume('Photo or screen detected. Please present your live face.', 3500)
          confirmRef.current = 0
          return
        }

        if (liveness !== undefined && liveness <= 0.3) {
          recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, false)
          setKioskState('blocked')
          pausedRef.current = true
          showAlertAndResume('Fake face detected. Please scan your live face.', 3500)
          confirmRef.current = 0
          return
        }

        setCapturedFrameUrl(bestCanvas.toDataURL('image/jpeg', 0.82))
        const coordinates = locationState?.coords || null
        const timing = buildAttendanceEntryTiming(now)
        const trackSettings = camera.getTrackSettings?.() || {}
        const captureContext = {
          ...getClientCaptureContext(),
          trackWidth: trackSettings.width ?? null,
          trackHeight: trackSettings.height ?? null,
          trackAspectRatio: trackSettings.aspectRatio ?? null,
          trackFrameRate: trackSettings.frameRate ?? null,
          trackFacingMode: trackSettings.facingMode || '',
          trackResizeMode: trackSettings.resizeMode || '',
        }
        const networkStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const baseAttendanceEntry = {
          id: `${now}`,
          name: '',
          employeeId: '',
          officeId: '',
          officeName: '',
          attendanceMode: '',
          geofenceStatus: '',
          confidence: 0,
          landmarks: landmarks || [],
          antispoof,
          liveness,
          captureContext: {
            ...captureContext,
            capturePolicyVersion: SCAN_CAPTURE_POLICY_VERSION,
            captureResolution: `${bestCanvas.width}x${bestCanvas.height}`,
            verificationFrames: allCaptures.length,
            descriptorSpread: Number.isFinite(descriptorSpread) ? descriptorSpread : null,
            burstQualityScore: roundMetric(burstDiagnostics?.bestQualityScore),
            strictFrames: burstDiagnostics?.strictFrames ?? null,
            fallbackFrames: burstDiagnostics?.fallbackFrames ?? null,
            trackWidth: captureContext.trackWidth,
            trackHeight: captureContext.trackHeight,
            trackAspectRatio: captureContext.trackAspectRatio,
            trackFrameRate: captureContext.trackFrameRate,
            trackFacingMode: captureContext.trackFacingMode,
            trackResizeMode: captureContext.trackResizeMode,
            screenOrientation: captureContext.screenOrientation,
            clientKey: captureContext.kioskId || '',
          },
          scanDiagnostics: {
            deviceClass: captureContext.mobile ? 'mobile' : 'desktop',
            browser: getBrowserLabel(captureContext.userAgent),
            bestFaceAreaRatio: roundMetric(burstDiagnostics?.bestFaceAreaRatio),
            bestCenteredness: roundMetric(burstDiagnostics?.bestCenteredness),
            bestYaw: roundMetric(burstDiagnostics?.bestYaw),
            bestPitch: roundMetric(burstDiagnostics?.bestPitch),
            bestRoll: roundMetric(burstDiagnostics?.bestRoll),
            targetFrames: burstDiagnostics?.targetFrames ?? null,
            capturedFrames: burstDiagnostics?.capturedFrames ?? null,
            strictFrames: burstDiagnostics?.strictFrames ?? null,
            fallbackFrames: burstDiagnostics?.fallbackFrames ?? null,
            aggregatedFrames: burstDiagnostics?.aggregatedFrames ?? null,
            multiFaceFrames: burstDiagnostics?.multiFaceFrames ?? null,
            descriptorSpread: roundMetric(descriptorSpread),
          },
          kioskContext: {
            kioskId: captureContext.kioskId || '',
            clientKey: captureContext.kioskId || '',
            source: 'web-scan',
          },
          verificationMode: 'challenge_v2',
          verificationStage: 'passive',
          timestamp: timing.timestamp,
          dateKey: timing.dateKey,
          dateLabel: timing.dateLabel,
          date: timing.date,
          time: timing.time,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          descriptor,
        }

        const runActiveChallengeStep = async (challenge) => {
          if (!challenge) {
            throw new Error('Active challenge metadata is missing.')
          }

          setChallengeState({
            ...challenge,
            startedAt: Date.now(),
            sampleCount: 0,
          })
          setKioskState('challenge')

          const activeTrace = await captureActiveChallenge(challenge.motionType || '')

          setChallengeState(current => (
            current
              ? {
                  ...current,
                  completedAt: Date.now(),
                  sampleCount: Array.isArray(activeTrace?.samples) ? activeTrace.samples.length : 0,
                }
              : current
          ))
          setKioskState('verifying')
          return activeTrace
        }

        try {
          const challengeResult = await requestAttendanceChallenge(baseAttendanceEntry)
          if (!challengeResult?.challenge?.token && !challengeResult?.challenge?.challengeId) {
            throw new Error('Attendance challenge was not issued.')
          }

          let submissionEntry = {
            ...baseAttendanceEntry,
            challenge: challengeResult.challenge,
            riskFlags: Array.isArray(challengeResult.riskFlags) ? challengeResult.riskFlags : [],
          }

          if (challengeResult.challenge?.mode === 'active') {
            submissionEntry = {
              ...submissionEntry,
              verificationStage: 'active',
              activeChallengeTrace: await runActiveChallengeStep(challengeResult.challenge),
            }
          }

          let result

          try {
            result = await onLogAttendance(submissionEntry)
          } catch (initialError) {
            if (initialError?.decisionCode !== 'challenge_required' || !initialError?.challenge) {
              throw initialError
            }

            submissionEntry = {
              ...baseAttendanceEntry,
              challenge: initialError.challenge,
              riskFlags: Array.isArray(initialError?.riskFlags) ? initialError.riskFlags : submissionEntry.riskFlags,
              verificationStage: 'active',
              activeChallengeTrace: await runActiveChallengeStep(initialError.challenge),
            }
            result = await onLogAttendance(submissionEntry)
          }

          setChallengeState(null)
          recordNetwork?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - networkStartedAt, true)
          recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, true)

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
              employeeViewSession: result.employeeViewSession || '',
              employeeViewSessionExpiresAt: result.employeeViewSessionExpiresAt || null,
            })
            setKioskState('confirmed')
            setAlertState(null)
          } else {
            setKioskState('unknown')
            pausedRef.current = true
            showAlertAndResume('No reliable face match was found. Ensure you are enrolled.', 3000)
          }
        } catch (error) {
          setChallengeState(null)
          recordNetwork?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - networkStartedAt, false)
          recordVerification?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - verificationStartedAt, false)
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
          } else if (decisionCode === 'blocked_recent_duplicate' || decisionCode === 'blocked_day_complete') {
            setKioskState('blocked')
            setCurrentMatch({
              name: error.entry?.name || safeDecision.name,
              confidence: error.entry?.confidence ?? 0,
              officeName: error.entry?.officeName || null,
              officeId: error.entry?.officeId || null,
              employeeId: error.entry?.employeeId || null,
              time: error.entry?.time || timing.time,
              timestamp: Number(error.entry?.timestamp ?? timing.timestamp),
              action: error.entry?.action || '',
              attendanceMode: error.entry?.attendanceMode || '',
              detail: safeDecision.detail,
              blocked: true,
              resultState: 'already-recorded',
              employeeViewSession: error?.employeeViewSession || '',
              employeeViewSessionExpiresAt: error?.employeeViewSessionExpiresAt || null,
            })
            setAlertState(null)
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
          officeName: error.entry?.officeName || null,
          officeId: error.entry?.officeId || null,
          employeeId: error.entry?.employeeId || null,
          time: error.entry?.time || '',
          timestamp: Number(error.entry?.timestamp || Date.now()),
          action: error.entry?.action || '',
          attendanceMode: error.entry?.attendanceMode || '',
          detail: safeDecision.detail,
          blocked: true,
          resultState: 'already-recorded',
          employeeViewSession: error?.employeeViewSession || '',
          employeeViewSessionExpiresAt: error?.employeeViewSessionExpiresAt || null,
        })
        setAlertState(null)
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
      recordScan?.((typeof performance !== 'undefined' ? performance.now() : Date.now()) - scanStartedAt)
      busyRef.current = false
    }
  }, [camera, modelsReady, locationState, setKioskState, setCurrentMatch, setCapturedFrameUrl, setFlashKey, setAlertState, setChallengeState, confirmRef, confirmedTimer, unknownTimer, attemptCooldownUntilRef, faceLossTimerRef, pausedRef, showAlertAndResume, recordScan, recordVerification, recordNetwork])

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
