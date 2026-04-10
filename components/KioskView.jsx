'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { detectFaceBoxes, detectWithDescriptors } from '../lib/biometrics/human'
import {
  CONFIRM_FRAMES,
  SCAN_INTERVAL_MS,
  CONFIRMED_HOLD_MS,
  UNKNOWN_DEBOUNCE_MS,
  KIOSK_IDLE_DETECTION_MAX_DIMENSION,
  PREVIEW_MAX_DIMENSION,
  KIOSK_ATTEMPT_COOLDOWN_MS,
  KIOSK_FACE_LOSS_GRACE_MS,
} from '../lib/config'
import { ATTENDANCE_TIME_ZONE, buildAttendanceEntryTiming } from '../lib/attendance-time'
import { useAudioCue } from '../hooks/useAudioCue'
import AppShell from './AppShell'

const kioskClockFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: ATTENDANCE_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

const kioskDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: ATTENDANCE_TIME_ZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const kioskHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ATTENDANCE_TIME_ZONE,
  hour: '2-digit',
  hour12: false,
})

function formatTime(timestamp) {
  return kioskClockFormatter.format(new Date(timestamp))
}

function formatDate(timestamp) {
  return kioskDateFormatter.format(new Date(timestamp))
}

function getGreeting(timestamp) {
  const hour = Number(kioskHourFormatter.format(new Date(timestamp)))
  if (!Number.isFinite(hour)) return 'Welcome'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function drawBracketBox(ctx, box, color, label, confidence, scaleX = 1, scaleY = 1) {
  const x = box.x * scaleX
  const y = box.y * scaleY
  const width = box.width * scaleX
  const height = box.height * scaleY
  const corner = Math.min(width, height) * 0.18

  ctx.strokeStyle = color
  ctx.lineWidth = 3

  ;[
    [[x, y + corner], [x, y], [x + corner, y]],
    [[x + width - corner, y], [x + width, y], [x + width, y + corner]],
    [[x + width, y + height - corner], [x + width, y + height], [x + width - corner, y + height]],
    [[x + corner, y + height], [x, y + height], [x, y + height - corner]],
  ].forEach(points => {
    ctx.beginPath()
    points.forEach(([px, py], index) => {
      if (index === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  })

  if (!label) return

  ctx.font = 'bold 14px "Outfit", sans-serif'
  const text = confidence != null ? `${label} ${(confidence * 100).toFixed(0)}%` : label
  const textWidth = ctx.measureText(text).width + 16

  ctx.fillStyle = `${color}cc`
  ctx.fillRect(x, y - 32, textWidth, 30)
  ctx.fillStyle = '#06120f'
  ctx.fillText(text, x + 8, y - 12)
}

function selectPrimaryFace(detections, sourceWidth, sourceHeight) {
  if (!Array.isArray(detections) || detections.length === 0) return null

  const frameCenterX = sourceWidth / 2
  const frameCenterY = sourceHeight / 2

  return detections
    .map(detection => {
      const box = detection?.box || detection?.detection?.box
      if (!box) return null

      const centerX = box.x + (box.width / 2)
      const centerY = box.y + (box.height / 2)
      const area = box.width * box.height
      const distance = Math.hypot(centerX - frameCenterX, centerY - frameCenterY)
      const score = area - (distance * 0.6)

      return { detection, box, score }
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0] || null
}

const VERIFICATION_BURST_FRAMES = 8
const VERIFICATION_BURST_INTERVAL_MS = 70

function getSafeDecisionMessage(decisionCode) {
  switch (decisionCode) {
    case 'blocked_no_reliable_match':
      return { name: 'Not recognized', detail: 'Face could not be matched reliably.' }
    case 'blocked_ambiguous_match':
      return { name: 'Ambiguous match', detail: 'Face is too close to multiple enrolled employees.' }
    case 'blocked_recent_duplicate':
      return { name: 'Already recorded', detail: 'Attendance already recorded recently.' }
    case 'blocked_day_complete':
      return { name: 'Day complete', detail: 'Full attendance for today is already recorded. See you tomorrow.' }
    case 'blocked_liveness_failed':
      return { name: 'Liveness check failed', detail: 'Move slightly and try again.' }
    case 'blocked_missing_gps':
      return { name: 'Attendance blocked', detail: 'GPS unavailable — ensure location is enabled.' }
    case 'blocked_geofence':
      return { name: 'Attendance blocked', detail: 'Device is outside the assigned office geofence.' }
    case 'blocked_rate_limited':
      return { name: 'Attendance blocked', detail: 'Too many attempts. Wait a moment and try again.' }
    case 'blocked_inactive':
      return { name: 'Attendance blocked', detail: 'Employee account is inactive.' }
    case 'blocked_pending_approval':
      return { name: 'Pending approval', detail: 'Enrollment is awaiting admin approval.' }
    case 'blocked_missing_office_config':
      return { name: 'Attendance blocked', detail: 'Assigned office is not configured correctly.' }
    case 'blocked_no_candidate_office':
    case 'blocked_wrong_office_context':
      return { name: 'Attendance blocked', detail: 'Current location does not match the assigned office.' }
    case 'blocked_index_building':
      return { name: 'System not ready', detail: 'Attendance index is still building. Try again in a minute.' }
    default:
      return { name: 'Attendance blocked', detail: 'Could not process attendance. Please try again or contact an administrator.' }
  }
}

function formatDebugDetail(debug) {
  if (!debug) return ''
  const parts = []
  if (debug.source) parts.push(`src ${debug.source}`)
  if (Number.isFinite(debug.bestDistance)) parts.push(`best ${debug.bestDistance.toFixed(3)}`)
  if (Number.isFinite(debug.threshold)) parts.push(`th ${debug.threshold.toFixed(3)}`)
  if (Number.isFinite(debug.secondDistance)) parts.push(`2nd ${debug.secondDistance.toFixed(3)}`)
  if (Number.isFinite(debug.candidateCount)) parts.push(`cand ${debug.candidateCount}`)
  return parts.join(' | ')
}

export default function KioskView({
  camera,
  modelsReady,
  workspaceReady,
  locationState,
  onLogAttendance,
  errorMessage,
}) {
  const [clock, setClock] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [kioskState, setKioskState] = useState('idle')
  const [currentMatch, setCurrentMatch] = useState(null)
  const [capturedFrameUrl, setCapturedFrameUrl] = useState(null)
  const [flashKey, setFlashKey] = useState(0)
  const [alertState, setAlertState] = useState(null)
  const [alertDebug, setAlertDebug] = useState('')
  const [, setLastMeaningfulFailure] = useState('')

  // resumeKey: incrementing this triggers the scan loop useEffect to restart startLoop().
  // This is the fix for the kiosk freeze bug: when pausedRef is set true during verification,
  // the self-rescheduling scan loop exits. scheduleResume() was resetting pausedRef but not
  // restarting the loop. Now incrementing resumeKey causes the useEffect to re-run →
  // stopLoop() → startLoop(). Works for both the success path and the failure path.
  const [resumeKey, setResumeKey] = useState(0)

  const playAudioCue = useAudioCue()

  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const confirmRef = useRef(0)
  const confirmedTimer = useRef(null)
  const unknownTimer = useRef(null)
  const resumeTimerRef = useRef(null)
  const previousStateRef = useRef('idle')
  const attemptCooldownUntilRef = useRef(0)
  const faceLossTimerRef = useRef(null)
  const pausedRef = useRef(false)

  const stopLoop = useCallback(() => {
    if (scanRef.current) {
      window.clearTimeout(scanRef.current)
      scanRef.current = null
    }
    if (faceLossTimerRef.current) {
      window.clearTimeout(faceLossTimerRef.current)
      faceLossTimerRef.current = null
    }
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
  }, [])

  const wait = useCallback(duration => new Promise(resolve => {
    window.setTimeout(resolve, duration)
  }), [])

  const pauseScanning = useCallback(() => {
    pausedRef.current = true
    stopLoop()
    camera.clearOverlay()
  }, [camera, stopLoop])

  const scheduleResume = useCallback((delay = KIOSK_ATTEMPT_COOLDOWN_MS) => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)

    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null
      pausedRef.current = false
      confirmRef.current = 0
      setCapturedFrameUrl(null)
      setCurrentMatch(null)
      setAlertState(null)
      setAlertDebug('')
      setKioskState('idle')
      camera.clearOverlay()
      // Increment resumeKey to trigger the scan loop useEffect to restart startLoop().
      // Without this, pausedRef resets to false but the self-rescheduling loop is already
      // dead — nothing calls scheduleNext again. This is the freeze fix.
      setResumeKey(k => k + 1)
    }, delay)
  }, [camera])

  const showAlertAndResume = useCallback((message, delay = 2200, debug = '') => {
    setAlertState(message)
    setAlertDebug(debug)
    scheduleResume(delay)
  }, [scheduleResume])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      setClock(formatTime(now))
      setDateStr(formatDate(now))
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [])

  const drawOverlay = useCallback((detection, sourceWidth, sourceHeight) => {
    const video = camera.videoRef.current
    const overlay = camera.overlayRef.current

    if (!overlay || !video) return

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    const scaleX = sourceWidth ? width / sourceWidth : 1
    const scaleY = sourceHeight ? height / sourceHeight : 1
    overlay.width = width
    overlay.height = height

    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    const box = detection?.detection?.box
    if (!box) return

    drawBracketBox(ctx, box, '#22c55e', 'FACE READY', null, scaleX, scaleY)
  }, [camera])

  const captureBestVerificationFrame = useCallback(async () => {
    let bestCapture = null
    const landmarksBuffer = []

    for (let attempt = 0; attempt < VERIFICATION_BURST_FRAMES; attempt += 1) {
      const canvas = camera.captureImageData({
        maxWidth: PREVIEW_MAX_DIMENSION,
        maxHeight: PREVIEW_MAX_DIMENSION,
      })
      const detections = await detectWithDescriptors(canvas)
      const primary = selectPrimaryFace(detections, canvas.width, canvas.height)
      if (primary?.detection?.landmarks) {
        landmarksBuffer.push(primary.detection.landmarks.positions)
      }
      const primaryBox = primary?.box
      const frameArea = Math.max(1, canvas.width * canvas.height)
      const boxArea = primaryBox ? primaryBox.width * primaryBox.height : 0
      const score = detections.length + (boxArea / frameArea)

      if (detections.length && (!bestCapture || score > bestCapture.score)) {
        bestCapture = { canvas, detections, score }
      }

      if (attempt < VERIFICATION_BURST_FRAMES - 1) await wait(VERIFICATION_BURST_INTERVAL_MS)
    }

    return { ...bestCapture, landmarks: landmarksBuffer }
  }, [camera, wait])

  const runScan = useCallback(async () => {
    if (busyRef.current || pausedRef.current || !camera.camOn || !modelsReady) return

    busyRef.current = true

    try {
      const canvas = camera.captureImageData({
        maxWidth: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
        maxHeight: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
      })
      const detections = await detectFaceBoxes(canvas, {
        allowEnhancedRetry: false,
        minConfidence: 0.55,
      })
      const primary = selectPrimaryFace(detections, canvas.width, canvas.height)
      const primaryDetection = primary?.detection || null

      if (!primaryDetection) {
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

        busyRef.current = false
        return
      }

      if (faceLossTimerRef.current) {
        window.clearTimeout(faceLossTimerRef.current)
        faceLossTimerRef.current = null
      }

      window.clearTimeout(unknownTimer.current)
      unknownTimer.current = null

      drawOverlay({ detection: { box: primary.box } }, canvas.width, canvas.height)
      confirmRef.current += 1

      if (!confirmedTimer.current) setKioskState('scanning')

      if (confirmRef.current >= CONFIRM_FRAMES && Date.now() >= attemptCooldownUntilRef.current) {
        const now = Date.now()
        attemptCooldownUntilRef.current = now + KIOSK_ATTEMPT_COOLDOWN_MS
        pausedRef.current = true
        setKioskState('verifying')
        camera.clearOverlay()

        const bestCapture = await captureBestVerificationFrame()
        if (!bestCapture) {
          setCapturedFrameUrl(null)
          setKioskState('unknown')
          showAlertAndResume('No reliable face match was found.')
          confirmRef.current = 0
          return
        }

        setCapturedFrameUrl(bestCapture.canvas.toDataURL('image/jpeg', 0.82))
        const verificationDetections = bestCapture.detections
        const primaryVerification = selectPrimaryFace(
          verificationDetections,
          bestCapture.canvas.width,
          bestCapture.canvas.height,
        )

        if (verificationDetections.length > 1) {
          setKioskState('blocked')
          showAlertAndResume('Multiple faces detected. One employee at a time.', 2400)
          confirmRef.current = 0
          return
        }

        if (!primaryVerification?.detection?.descriptor) {
          setKioskState('unknown')
          showAlertAndResume('No reliable face match was found.')
          confirmRef.current = 0
          return
        }

        const coordinates = locationState?.coords || null
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
            landmarks: bestCapture.landmarks || [],
            timestamp: timing.timestamp,
            dateKey: timing.dateKey,
            dateLabel: timing.dateLabel,
            date: timing.date,
            time: timing.time,
            latitude: coordinates?.latitude ?? null,
            longitude: coordinates?.longitude ?? null,
            descriptor: Array.from(primaryVerification.detection.descriptor),
          })

          if (result.entry) {
            setLastMeaningfulFailure('')
            setFlashKey(value => value + 1)
            setCurrentMatch({
              name: result.entry.name || 'Attendance recorded',
              confidence: result.entry.confidence ?? 0,
              officeName: result.entry.officeName || null,
              employeeId: result.entry.employeeId || null,
              time: result.entry.time || timing.time,
              timestamp: Number(result.entry.timestamp ?? timing.timestamp),
              action: result.entry.action || '',
              detail: `${result.entry.action === 'checkout' ? 'Check-out' : 'Check-in'} recorded`,
            })
            setKioskState('confirmed')
            setAlertState(null)
            attendanceAccepted = true
          } else {
            setKioskState('unknown')
            showAlertAndResume('No reliable face match was found.')
          }
        } catch (error) {
          const latestDebug = formatDebugDetail(error?.debug)
          if (error?.decisionCode === 'blocked_no_reliable_match') {
            setKioskState('unknown')
            showAlertAndResume('No reliable face match was found.', 2600, latestDebug)
          } else {
            throw error
          }
        }

        confirmRef.current = 0

        if (attendanceAccepted) {
          window.clearTimeout(confirmedTimer.current)
          confirmedTimer.current = window.setTimeout(() => {
            confirmedTimer.current = null
            scheduleResume(250)
          }, CONFIRMED_HOLD_MS)
        }
      }
    } catch (error) {
      attemptCooldownUntilRef.current = Date.now() + KIOSK_ATTEMPT_COOLDOWN_MS
      confirmRef.current = 0
      const decisionCode = error.decisionCode || ''
      const safeDecision = getSafeDecisionMessage(decisionCode)

      if (decisionCode === 'blocked_no_reliable_match' || decisionCode === 'blocked_ambiguous_match') {
        if (!confirmedTimer.current && !unknownTimer.current) {
          unknownTimer.current = window.setTimeout(() => {
            setKioskState(decisionCode === 'blocked_ambiguous_match' ? 'blocked' : 'unknown')
            setLastMeaningfulFailure(safeDecision.detail)
            setCurrentMatch({
              name: safeDecision.name,
              confidence: 0,
              detail: safeDecision.detail,
            })
            confirmRef.current = 0
            unknownTimer.current = null
          }, UNKNOWN_DEBOUNCE_MS)
        }
      } else if (decisionCode === 'blocked_recent_duplicate') {
        setKioskState('blocked')
        setLastMeaningfulFailure(safeDecision.detail)
        setCurrentMatch({
          name: error.entry?.name || safeDecision.name,
          confidence: error.entry?.confidence ?? 0,
          officeName: error.entry?.officeName,
          detail: safeDecision.detail,
        })
      } else {
        setKioskState('blocked')
        setLastMeaningfulFailure(safeDecision.detail)
        setCurrentMatch({
          name: safeDecision.name,
          confidence: 0,
          detail: safeDecision.detail,
        })
      }
      showAlertAndResume(safeDecision.detail, 2600, formatDebugDetail(error?.debug))
    } finally {
      busyRef.current = false
    }
  }, [camera, captureBestVerificationFrame, drawOverlay, modelsReady, onLogAttendance, scheduleResume, setAlertState, showAlertAndResume])

  const startLoop = useCallback(() => {
    if (scanRef.current) return

    const scheduleNext = (delay = 0) => {
      scanRef.current = window.setTimeout(async () => {
        scanRef.current = null
        await runScan()

        if (!pausedRef.current) {
          scheduleNext(SCAN_INTERVAL_MS)
        }
      }, delay)
    }

    pausedRef.current = false
    scheduleNext()
  }, [runScan])

  // resumeKey is included in deps: incrementing it (from scheduleResume) causes this
  // effect to re-run, which calls stopLoop() then startLoop() — restarting the scan loop
  // after any failure or success that paused it. This is the kiosk freeze fix.
  useEffect(() => {
    if (!workspaceReady || !modelsReady || !camera.camOn) return () => {}
    stopLoop()
    startLoop()
    return stopLoop
  }, [camera.camOn, modelsReady, resumeKey, startLoop, stopLoop, workspaceReady])

  useEffect(() => {
    const previous = previousStateRef.current
    if (previous === kioskState) return

    if (kioskState === 'confirmed') playAudioCue('success')
    if ((kioskState === 'blocked' || kioskState === 'unknown') && previous !== 'blocked' && previous !== 'unknown') {
      playAudioCue('notify')
    }

    previousStateRef.current = kioskState
  }, [kioskState, playAudioCue])

  const isConfirmed = kioskState === 'confirmed'
  const isUnknown = kioskState === 'unknown'
  const isBlocked = kioskState === 'blocked'
  const showSuccessScreen = Boolean(isConfirmed && currentMatch)
  const locationBadgeLabel = locationState?.ready
    ? 'Location ready'
    : locationState?.bypassed
      ? 'WFH fallback'
      : 'Location pending'

  return (
    <AppShell
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
      onBeforeNavigate={pauseScanning}
    >
      <div className="page-frame min-h-[calc(100dvh-8.25rem)] xl:min-h-[calc(100dvh-10.5rem)]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`relative min-h-[calc(100dvh-8.25rem)] overflow-hidden rounded-[1.4rem] border border-black/5 shadow-glow sm:rounded-[1.75rem] xl:min-h-[calc(100dvh-10.5rem)] ${showSuccessScreen ? 'bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),rgba(255,255,255,0.96))]' : 'bg-black'}`}
        >
          {showSuccessScreen ? (
            <div className="absolute inset-0 z-[6] flex items-center justify-center px-4 py-6 sm:px-6">
              <div className="w-full max-w-xl rounded-[2rem] border border-black/5 bg-white/85 px-6 py-8 text-center shadow-2xl backdrop-blur sm:px-10 sm:py-10">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700/90">
                  {currentMatch.detail || 'Attendance recorded'}
                </div>
                <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
                  {getGreeting(currentMatch.timestamp || Date.now())}
                </h2>
                <div className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
                  {currentMatch.name}
                </div>
                <div className="mt-2 text-sm text-muted sm:text-base">
                  {currentMatch.officeName || 'Unassigned office'}
                </div>

                <div className="mt-7 grid gap-3 rounded-[1.5rem] border border-black/5 bg-stone-50 p-5 text-left sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Time</div>
                    <div className="mt-2 font-display text-2xl text-ink">{currentMatch.time || formatTime(currentMatch.timestamp || Date.now())}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Employee ID</div>
                    <div className="mt-2 text-lg font-semibold text-ink">{currentMatch.employeeId || '--'}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <video ref={camera.setVideoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
              {capturedFrameUrl ? (
                <img alt="Verification frame" className="absolute inset-0 z-[1] h-full w-full object-cover" src={capturedFrameUrl} />
              ) : null}
              <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
              <canvas ref={camera.overlayRef} className="absolute inset-0 z-[2] h-full w-full" />

              <div className="absolute inset-0 z-[3] bg-gradient-to-b from-black/35 via-transparent to-black/25" />
              {kioskState === 'scanning' ? <div className="absolute inset-0 z-[3] border-2 border-navy/80 shadow-[inset_0_0_60px_rgba(12,108,88,0.25)]" /> : null}
              {isConfirmed ? <div key={flashKey} className="absolute inset-0 z-[3] bg-emerald-400/20 animate-pulse" /> : null}
              {isBlocked || isUnknown ? <div className="absolute inset-0 z-[3] bg-red-500/10" /> : null}

              <div className="absolute right-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-right shadow-lg backdrop-blur sm:right-5 sm:top-5 sm:px-5 sm:py-3">
                <div className="font-display text-lg leading-none text-white sm:text-3xl">{clock}</div>
                <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-100/88 sm:text-xs">{dateStr}</div>
              </div>
              <div className="absolute left-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-left shadow-lg backdrop-blur sm:left-5 sm:top-5 sm:px-5 sm:py-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100/92 sm:text-xs">{locationBadgeLabel}</div>
                <div className="mt-1 text-xs text-slate-100/92 sm:text-sm">{locationState?.status || 'Checking location'}</div>
              </div>

              {!camera.camOn ? (
                <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
                  <div className="text-5xl opacity-60">◈</div>
                  <div className="text-sm font-medium">{camera.camError || 'Camera idle'}</div>
                </div>
              ) : null}
            </>
          )}
          {alertState ? (
            <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/40 px-4 sm:px-6">
              <div className="w-full max-w-sm rounded-[1.25rem] bg-white px-5 py-5 text-center shadow-2xl sm:rounded-[1.5rem] sm:px-6 sm:py-6">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-warn">Scan result</div>
                <div className="mt-3 text-base font-semibold text-ink sm:text-lg">{alertState}</div>
                {alertDebug ? (
                  <div className="mt-3 rounded-[0.9rem] bg-stone-100 px-3 py-2 text-xs text-muted">{alertDebug}</div>
                ) : null}
              </div>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="absolute inset-x-3 bottom-3 z-[4] rounded-2xl bg-red-50/95 px-4 py-3 text-sm text-warn shadow-lg backdrop-blur sm:inset-x-5 sm:bottom-5">
              {errorMessage}
            </div>
          ) : null}
        </motion.section>
      </div>
    </AppShell>
  )
}
