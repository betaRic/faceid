'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { detectFaceBoxes, detectWithDescriptors } from '../lib/face-api'
import {
  CONFIRM_FRAMES,
  SCAN_INTERVAL_MS,
  CONFIRMED_HOLD_MS,
  UNKNOWN_DEBOUNCE_MS,
  DETECTION_MAX_DIMENSION,
  PREVIEW_MAX_DIMENSION,
  KIOSK_ATTEMPT_COOLDOWN_MS,
  KIOSK_FACE_LOSS_GRACE_MS,
} from '../lib/config'
import { useAudioCue } from '../hooks/useAudioCue'
import AppShell from './AppShell'

const pad = value => String(value).padStart(2, '0')

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const hours = date.getHours()
  return `${pad(hours % 12 || 12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${hours >= 12 ? 'PM' : 'AM'}`
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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

function getCurrentPositionWithOptions(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not available on this device'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      ...options,
    })
  })
}

const GPS_CACHE_TTL_MS = 30 * 1000
const GPS_REFRESH_INTERVAL_MS = 15 * 1000

function getCachedPositionCoordinates(cacheRef) {
  const cached = cacheRef.current
  if (!cached) return null
  if (Date.now() - cached.timestamp > GPS_CACHE_TTL_MS) return null

  return {
    latitude: cached.latitude,
    longitude: cached.longitude,
  }
}

function getSafeDecisionMessage(decisionCode) {
  switch (decisionCode) {
    case 'blocked_no_reliable_match':
      return {
        name: 'Not recognized',
        detail: 'Face could not be matched reliably.',
      }
    case 'blocked_ambiguous_match':
      return {
        name: 'Ambiguous match',
        detail: 'Face is too close to multiple enrolled employees.',
      }
    case 'blocked_recent_duplicate':
      return {
        name: 'Attendance already recorded',
        detail: 'Attendance already recorded recently.',
      }
    case 'blocked_missing_gps':
      return {
        name: 'Attendance blocked',
        detail: 'GPS unavailable - ensure location is enabled.',
      }
    case 'blocked_geofence':
      return {
        name: 'Attendance blocked',
        detail: 'Device is outside the assigned office geofence.',
      }
    case 'blocked_rate_limited':
      return {
        name: 'Attendance blocked',
        detail: 'Too many attempts. Wait a moment and try again.',
      }
    case 'blocked_inactive':
      return {
        name: 'Attendance blocked',
        detail: 'Employee account is inactive.',
      }
    case 'blocked_missing_office_config':
      return {
        name: 'Attendance blocked',
        detail: 'Assigned office is not configured correctly.',
      }
    case 'blocked_no_candidate_office':
    case 'blocked_wrong_office_context':
      return {
        name: 'Attendance blocked',
        detail: 'Current location does not match the assigned office context.',
      }
    default:
      return {
        name: 'Attendance blocked',
        detail: 'Attendance could not be processed. Please try again or contact an administrator.',
      }
  }
}

export default function KioskView({
  camera,
  modelsReady,
  onLogAttendance,
  errorMessage,
}) {
  const [clock, setClock] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [kioskState, setKioskState] = useState('idle')
  const [, setCurrentMatch] = useState(null)
  const [capturedFrameUrl, setCapturedFrameUrl] = useState(null)
  const [flashKey, setFlashKey] = useState(0)
  const [alertState, setAlertState] = useState(null)
  const [, setLastMeaningfulFailure] = useState('')
  const playAudioCue = useAudioCue()

  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const confirmRef = useRef(0)
  const confirmedTimer = useRef(null)
  const unknownTimer = useRef(null)
  const resumeTimerRef = useRef(null)
  const previousStateRef = useRef('idle')
  const cachedPositionRef = useRef(null)
  const gpsRefreshPendingRef = useRef(false)
  const attemptCooldownUntilRef = useRef(0)
  const faceLossTimerRef = useRef(null)
  const pausedRef = useRef(false)

  const stopLoop = useCallback(() => {
    if (scanRef.current) {
      window.clearInterval(scanRef.current)
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

  const scheduleResume = useCallback((delay = KIOSK_ATTEMPT_COOLDOWN_MS) => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)

    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null
      pausedRef.current = false
      confirmRef.current = 0
      setCapturedFrameUrl(null)
      setCurrentMatch(null)
      setAlertState(null)
      setKioskState('idle')
      camera.clearOverlay()
    }, delay)
  }, [camera])

  const showAlertAndResume = useCallback((message, delay = 2200) => {
    setAlertState(message)
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

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined

    let active = true

    const refreshPosition = async () => {
      if (gpsRefreshPendingRef.current) return

      gpsRefreshPendingRef.current = true

      try {
        const position = await getCurrentPositionWithOptions({
          timeout: 5000,
          maximumAge: GPS_CACHE_TTL_MS,
        })

        if (!active) return

        cachedPositionRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now(),
        }
      } catch {
        // Keep the last known good position; scan flow will treat stale or missing cache as unavailable.
      } finally {
        gpsRefreshPendingRef.current = false
      }
    }

    refreshPosition()
    const interval = window.setInterval(refreshPosition, GPS_REFRESH_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(interval)
    }
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

  const runScan = useCallback(async () => {
    if (busyRef.current || pausedRef.current || !camera.camOn || !modelsReady) return

    busyRef.current = true

    try {
      const canvas = camera.captureImageData({
        maxWidth: DETECTION_MAX_DIMENSION,
        maxHeight: DETECTION_MAX_DIMENSION,
      })
      const detections = await detectFaceBoxes(canvas)
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

        const verificationCanvas = camera.captureImageData({
          maxWidth: PREVIEW_MAX_DIMENSION,
          maxHeight: PREVIEW_MAX_DIMENSION,
        })
        setCapturedFrameUrl(verificationCanvas.toDataURL('image/jpeg', 0.82))

        const verificationDetections = await detectWithDescriptors(verificationCanvas)
        if (!verificationDetections.length) {
          setKioskState('unknown')
          showAlertAndResume('No reliable face match was found.')
          confirmRef.current = 0
          return
        }

        const coordinates = getCachedPositionCoordinates(cachedPositionRef)
        const acceptedEntries = []
        let noReliableMatchSeen = false

        for (let index = 0; index < verificationDetections.length; index += 1) {
          const detection = verificationDetections[index]

          try {
            const result = await onLogAttendance({
              id: `${now}-${index}`,
              name: '',
              employeeId: '',
              officeId: '',
              officeName: '',
              attendanceMode: '',
              geofenceStatus: '',
              confidence: 0,
              timestamp: now + index,
              date: new Date(now).toLocaleDateString('en-PH'),
              time: formatTime(now + index),
              latitude: coordinates?.latitude ?? null,
              longitude: coordinates?.longitude ?? null,
              descriptor: Array.from(detection.descriptor),
            })

            if (result.entry) acceptedEntries.push(result.entry)
          } catch (error) {
            if (error?.decisionCode === 'blocked_no_reliable_match') {
              noReliableMatchSeen = true
            }
          }
        }

        if (acceptedEntries.length) {
          setLastMeaningfulFailure('')
          setFlashKey(value => value + 1)
          setCurrentMatch({
            name: `${acceptedEntries.length} employee${acceptedEntries.length > 1 ? 's' : ''} recorded`,
            confidence: 0,
            officeName: null,
            detail: acceptedEntries.map(entry => entry.name).join(', '),
          })
          setKioskState('confirmed')
          setAlertState(null)
        } else if (noReliableMatchSeen) {
          setKioskState('unknown')
          showAlertAndResume('No reliable face match was found.')
        } else {
          setKioskState('unknown')
          showAlertAndResume('No reliable face match was found.')
        }

        confirmRef.current = 0

        window.clearTimeout(confirmedTimer.current)
        confirmedTimer.current = window.setTimeout(() => {
          confirmedTimer.current = null
          scheduleResume(250)
        }, CONFIRMED_HOLD_MS)
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
      showAlertAndResume(safeDecision.detail)
    } finally {
      busyRef.current = false
    }
  }, [camera, drawOverlay, modelsReady, onLogAttendance, scheduleResume, setAlertState, showAlertAndResume])

  const startLoop = useCallback(() => {
    if (scanRef.current) return
    scanRef.current = window.setInterval(runScan, SCAN_INTERVAL_MS)
  }, [runScan])

  useEffect(() => {
    camera.start().then(() => startLoop())
    return () => stopLoop()
  }, [camera, startLoop, stopLoop])

  useEffect(() => {
    if (!modelsReady) return
    stopLoop()
    startLoop()
    return stopLoop
  }, [modelsReady, startLoop, stopLoop])

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
  const showStabilityGuide = !capturedFrameUrl && !isConfirmed && !isBlocked && !isUnknown

  return (
    <AppShell
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
    >
      <div className="page-frame xl:min-h-[calc(100dvh-10.5rem)]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative min-h-[calc(100dvh-10.5rem)] overflow-hidden rounded-[1.75rem] border border-black/5 bg-black shadow-glow"
        >
          <video ref={camera.videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          {capturedFrameUrl ? (
            <img alt="Captured verification frame" className="absolute inset-0 z-[1] h-full w-full object-cover" src={capturedFrameUrl} />
          ) : null}
          <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
          <canvas ref={camera.overlayRef} className="absolute inset-0 z-[2] h-full w-full" />

          <div className="absolute inset-0 z-[3] bg-gradient-to-b from-black/35 via-transparent to-black/25" />
          {kioskState === 'scanning' ? <div className="absolute inset-0 z-[3] border-2 border-brand/80 shadow-[inset_0_0_60px_rgba(12,108,88,0.25)]" /> : null}
          {isConfirmed ? <div key={flashKey} className="absolute inset-0 z-[3] bg-emerald-400/20 animate-pulse" /> : null}
          {isBlocked || isUnknown ? <div className="absolute inset-0 z-[3] bg-red-500/10" /> : null}

          {showStabilityGuide ? (
            <div className="absolute inset-0 z-[4] flex items-center justify-center pointer-events-none">
              <div className="relative h-[22rem] w-[16rem] max-h-[58vh] max-w-[70vw] rounded-[3rem] border border-white/55 bg-white/6 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_80px_rgba(255,255,255,0.08)] backdrop-blur-[1px]">
                <div className="absolute inset-x-6 top-10 h-20 rounded-[999px] border border-white/35" />
                <div className="absolute left-1/2 top-[6.6rem] h-7 w-7 -translate-x-1/2 rounded-full border border-white/35" />
                <div className="absolute inset-x-[2.35rem] bottom-12 h-[8.75rem] rounded-[2.25rem] border border-white/28" />
                <div className="absolute -left-px -top-px h-14 w-14 rounded-tl-[3rem] border-l-2 border-t-2 border-white/85" />
                <div className="absolute -right-px -top-px h-14 w-14 rounded-tr-[3rem] border-r-2 border-t-2 border-white/85" />
                <div className="absolute -bottom-px -left-px h-14 w-14 rounded-bl-[3rem] border-b-2 border-l-2 border-white/85" />
                <div className="absolute -bottom-px -right-px h-14 w-14 rounded-br-[3rem] border-b-2 border-r-2 border-white/85" />
              </div>
            </div>
          ) : null}

          <div className="absolute right-5 top-5 z-[4] rounded-full bg-white/92 px-5 py-3 text-right shadow-lg backdrop-blur">
            <div className="font-display text-2xl text-ink sm:text-3xl">{clock}</div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{dateStr}</div>
          </div>

          {showStabilityGuide ? (
            <div className="absolute inset-x-5 bottom-5 z-[4] flex justify-center">
              <div className="rounded-full bg-white/90 px-5 py-3 text-center shadow-lg backdrop-blur">
                <div className="text-sm font-semibold text-ink">{camera.camOn ? 'Hold still for capture' : 'Stand inside the frame'}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{camera.camOn ? 'Automatic scan will start when your face is steady' : 'Kiosk will guide capture automatically'}</div>
              </div>
            </div>
          ) : null}

          {!camera.camOn ? (
            <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
              <div className="text-5xl opacity-60">◈</div>
              <div className="text-sm font-medium">{camera.camError || 'Camera idle'}</div>
            </div>
          ) : null}
          {alertState ? (
            <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/40 px-6">
              <div className="w-full max-w-sm rounded-[1.5rem] bg-white px-6 py-6 text-center shadow-2xl">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-warn">Scan result</div>
                <div className="mt-3 text-lg font-semibold text-ink">{alertState}</div>
              </div>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="absolute inset-x-5 bottom-5 z-[4] rounded-2xl bg-red-50/95 px-4 py-3 text-sm text-warn shadow-lg backdrop-blur">
              {errorMessage}
            </div>
          ) : null}
        </motion.section>
      </div>
    </AppShell>
  )
}
