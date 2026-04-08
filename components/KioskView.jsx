'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { detectWithDescriptors } from '../lib/face-api'
import {
  CONFIRM_FRAMES,
  SCAN_INTERVAL_MS,
  CONFIRMED_HOLD_MS,
  UNKNOWN_DEBOUNCE_MS,
  DETECTION_MAX_DIMENSION,
} from '../lib/config'
import {
  analyzeLiveness,
  createLivenessTracker,
  hasLivenessTrackerPassed,
  isLivenessChallengePassed,
  pickLivenessChallenge,
  updateLivenessTracker,
} from '../lib/liveness'
import { evaluateDetectionQuality } from '../lib/biometric-quality'
import BrandMark from './BrandMark'
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

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not available on this device'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })
  })
}

export default function KioskView({
  camera,
  persons,
  modelsReady,
  modelStatus,
  attendance,
  onLogAttendance,
  onGoRegister,
  todayLogCount,
  dataStatus,
  errorMessage,
}) {
  const [clock, setClock] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [kioskState, setKioskState] = useState('idle')
  const [currentMatch, setCurrentMatch] = useState(null)
  const [flashKey, setFlashKey] = useState(0)
  const [livenessChallenge, setLivenessChallenge] = useState(() => pickLivenessChallenge('any'))
  const [livenessPassed, setLivenessPassed] = useState(false)
  const [lastMeaningfulFailure, setLastMeaningfulFailure] = useState('')
  const playAudioCue = useAudioCue()

  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const confirmRef = useRef(0)
  const confirmedTimer = useRef(null)
  const unknownTimer = useRef(null)
  const previousStateRef = useRef('idle')
  const livenessTrackerRef = useRef(createLivenessTracker())

  const stopLoop = useCallback(() => {
    if (scanRef.current) {
      window.clearInterval(scanRef.current)
      scanRef.current = null
    }
  }, [])

  const resetLiveness = useCallback(() => {
    livenessTrackerRef.current = createLivenessTracker()
    setLivenessChallenge(pickLivenessChallenge('any'))
    setLivenessPassed(false)
  }, [])

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

  const drawOverlay = useCallback((detections, sourceWidth, sourceHeight) => {
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

    detections.forEach((detection, index) => {
      const box = detection.detection?.box
      if (!box) return

      drawBracketBox(ctx, box, '#22c55e', 'FACE READY', null, scaleX, scaleY)
    })
  }, [camera])

  const runScan = useCallback(async () => {
    if (busyRef.current || !camera.camOn || !modelsReady) return

    busyRef.current = true

    try {
      const canvas = camera.captureImageData({
        maxWidth: DETECTION_MAX_DIMENSION,
        maxHeight: DETECTION_MAX_DIMENSION,
      })
      const detections = await detectWithDescriptors(canvas)

      if (detections.length === 0) {
        if (!confirmedTimer.current) {
          window.clearTimeout(unknownTimer.current)
          unknownTimer.current = null
          setKioskState('idle')
          setCurrentMatch(null)
          confirmRef.current = 0
          camera.clearOverlay()
          resetLiveness()
        }

        busyRef.current = false
        return
      }

      window.clearTimeout(unknownTimer.current)
      unknownTimer.current = null

      const primaryDetection = detections[0]
      const primaryQuality = evaluateDetectionQuality(primaryDetection, canvas.width, canvas.height, canvas)
      if (!primaryQuality.ok) {
        setKioskState('idle')
        setLastMeaningfulFailure(primaryQuality.reason)
        setCurrentMatch({
          name: 'Face quality too weak',
          confidence: 0,
          detail: primaryQuality.reason,
        })
        busyRef.current = false
        return
      }

      const liveness = analyzeLiveness(primaryDetection)
      livenessTrackerRef.current = updateLivenessTracker(livenessTrackerRef.current, liveness)
      const passedChallenge = isLivenessChallengePassed(livenessChallenge.id, liveness)
        || hasLivenessTrackerPassed(livenessChallenge.id, livenessTrackerRef.current)

      if (!livenessPassed && passedChallenge) {
        setLivenessPassed(true)
      }

      if (!livenessPassed && !passedChallenge) {
        setKioskState('liveness')
        setCurrentMatch({
          name: 'Liveness required',
          confidence: 0,
          detail: livenessChallenge.label,
        })
        busyRef.current = false
        return
      }

      drawOverlay(detections, canvas.width, canvas.height)
      confirmRef.current += 1

      if (!confirmedTimer.current) setKioskState('scanning')

      if (confirmRef.current >= CONFIRM_FRAMES) {
        const now = Date.now()
        const position = await getCurrentPosition().catch(() => null)
        const coordinates = position
          ? {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }
          : null

        const result = await onLogAttendance({
          id: `${now}`,
          name: '',
          employeeId: '',
          officeId: '',
          officeName: '',
          attendanceMode: '',
          geofenceStatus: '',
          confidence: 0,
          timestamp: now,
          date: new Date(now).toLocaleDateString('en-PH'),
          time: formatTime(now),
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          descriptor: Array.from(primaryDetection.descriptor),
        })

        const acceptedEntry = result.entry
        if (acceptedEntry) {
          setLastMeaningfulFailure('')
          setFlashKey(value => value + 1)
          setCurrentMatch({
            name: acceptedEntry.name,
            confidence: acceptedEntry.confidence ?? 0,
            officeName: acceptedEntry.officeName,
            detail: `${acceptedEntry.attendanceMode} • ${acceptedEntry.geofenceStatus}`,
          })
          setKioskState('confirmed')
        }

        confirmRef.current = 0
        resetLiveness()

        window.clearTimeout(confirmedTimer.current)
        confirmedTimer.current = window.setTimeout(() => {
          confirmedTimer.current = null
          setKioskState('idle')
          setCurrentMatch(null)
        }, CONFIRMED_HOLD_MS)
      }
    } catch (error) {
      const decisionCode = error.decisionCode || ''
      if (decisionCode === 'blocked_no_reliable_match' || decisionCode === 'blocked_ambiguous_match') {
        if (!confirmedTimer.current && !unknownTimer.current) {
          unknownTimer.current = window.setTimeout(() => {
            setKioskState(decisionCode === 'blocked_ambiguous_match' ? 'blocked' : 'unknown')
            setLastMeaningfulFailure(error.message || 'Face could not be matched reliably.')
            setCurrentMatch({
              name: decisionCode === 'blocked_ambiguous_match' ? 'Ambiguous match' : 'Not recognized',
              confidence: 0,
              detail: error.message || 'Face could not be matched reliably.',
            })
            confirmRef.current = 0
            unknownTimer.current = null
          }, UNKNOWN_DEBOUNCE_MS)
        }
      } else if (decisionCode === 'blocked_recent_duplicate') {
        setKioskState('blocked')
        setLastMeaningfulFailure(error.message || 'Attendance already recorded recently.')
        setCurrentMatch({
          name: error.entry?.name || 'Attendance already recorded',
          confidence: error.entry?.confidence ?? 0,
          officeName: error.entry?.officeName,
          detail: error.message || 'Attendance already recorded recently.',
        })
      } else {
        setKioskState('blocked')
        setLastMeaningfulFailure(error.message || 'Attendance is blocked right now.')
        setCurrentMatch({
          name: 'Attendance blocked',
          confidence: 0,
          detail: error.message || 'Location permission is required for on-site attendance',
        })
      }
      resetLiveness()
    }

    busyRef.current = false
  }, [camera, drawOverlay, livenessChallenge.id, livenessPassed, modelsReady, onLogAttendance, resetLiveness])

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

  const today = new Date().toLocaleDateString('en-PH')
  const todayLog = attendance.filter(entry => entry.date === today)
  const isConfirmed = kioskState === 'confirmed'
  const isUnknown = kioskState === 'unknown'
  const isBlocked = kioskState === 'blocked'
  const isLiveness = kioskState === 'liveness'
  const locationAvailable = typeof navigator !== 'undefined' && Boolean(navigator.geolocation)

  return (
    <AppShell
      actions={(
        <>
          <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm">
            {todayLogCount} logs today
          </div>
          <button
            className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
            onClick={onGoRegister}
            type="button"
          >
            Open registration
          </button>
        </>
      )}
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:h-[calc(100vh-8.8rem)]">
        <section className="grid gap-4 rounded-[1.5rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <div className="min-w-0">
            <BrandMark />
            <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">Shared kiosk attendance workspace.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              Fast scan, minimal motion, blunt operator feedback. This page should work like a kiosk, not like a brochure.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <QuickInfoCard label="Clock" value={clock} detail={dateStr} />
            <QuickInfoCard label="Liveness" value={livenessPassed ? 'Passed' : 'Required'} detail={livenessPassed ? 'Ready to accept scan' : livenessChallenge.label} />
            <QuickInfoCard label="Storage" value={firebaseEnabledLabel(dataStatus)} detail={dataStatus} />
          </div>
        </section>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_380px]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex min-h-0 min-w-0 flex-col gap-4 rounded-[1.5rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 px-4 py-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Kiosk workspace</span>
              <h2 className="mt-1 font-display text-2xl text-ink">Live capture</h2>
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-dark shadow-sm">
              {isConfirmed
                ? 'Attendance logged'
                : isUnknown
                  ? 'Not recognized'
                  : isBlocked
                    ? 'Blocked'
                    : isLiveness
                      ? livenessChallenge.label
                      : kioskState === 'scanning'
                        ? 'Scanning face'
                        : 'Please face the camera'}
            </div>
          </div>

          <div className="min-h-0 overflow-hidden rounded-[1.6rem] border border-black/5 bg-black shadow-glow">
            <div className="relative h-full min-h-[360px] xl:min-h-[520px]">
              <video ref={camera.videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
              <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
              <canvas ref={camera.overlayRef} className="absolute inset-0 h-full w-full" />

              {!camera.camOn ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
                  <div className="text-5xl opacity-60">◈</div>
                  <div className="text-sm font-medium">{camera.camError || 'Camera offline'}</div>
                </div>
              ) : null}

              {kioskState === 'scanning' ? <div className="absolute inset-0 border-2 border-brand/80 shadow-[inset_0_0_60px_rgba(12,108,88,0.25)]" /> : null}
              {isConfirmed ? <div key={flashKey} className="absolute inset-0 bg-emerald-400/20 animate-pulse" /> : null}

              <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
                <span className={`rounded-full px-4 py-2 text-sm font-semibold backdrop-blur ${isConfirmed ? 'bg-emerald-400/20 text-emerald-100' : isUnknown || isBlocked ? 'bg-red-500/20 text-red-100' : kioskState === 'scanning' || isLiveness ? 'bg-brand/25 text-white' : 'bg-white/15 text-stone-100'}`}>
                  {isBlocked ? 'Attendance blocked' : isUnknown ? 'Not recognized' : isConfirmed ? 'Accepted' : isLiveness ? livenessChallenge.label : 'Capture in progress'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
            <StatusDot ok={modelsReady} />
            <StatusItem label="AI engine" value={modelStatus} />
            <StatusItem label="Storage" value={dataStatus} />
            <StatusItem label="Enrolled" value={`${persons.length}`} />
            <StatusItem label="Today" value={`${todayLogCount} logs`} />
            <StatusItem label="Camera" value={camera.camOn ? 'Ready' : 'Offline'} />
            <StatusItem label="Location" value={locationAvailable ? 'Available' : 'Unavailable'} />
          </div>
        </motion.section>

        <motion.aside
          animate={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
          className="flex min-h-0 min-w-0 flex-col gap-4"
        >
          <section className="rounded-[1.5rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Decision context</span>
              <span className="text-sm font-semibold text-ink">{modelsReady ? 'Ready' : 'Loading models'}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Policy</span>
              <span className="text-sm font-semibold text-ink">One office per employee</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Last failure</span>
              <span className="text-right text-sm font-semibold text-ink">{lastMeaningfulFailure || 'None'}</span>
            </div>
            {errorMessage ? <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-warn">{errorMessage}</div> : null}
            <p className="mt-4 text-sm leading-7 text-muted">
              On-site attendance requires GPS inside the assigned office radius. Outside radius is blocked unless the
              office is on WFH for today.
            </p>
          </section>

          <section className={`rounded-[1.5rem] border p-5 shadow-glow backdrop-blur ${isConfirmed ? 'border-emerald-500/25 bg-emerald-50/85' : isUnknown || isBlocked ? 'border-red-500/20 bg-red-50/85' : 'border-black/5 bg-white/80'}`}>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {isBlocked ? 'Attendance blocked' : isUnknown ? 'Unrecognized' : currentMatch ? 'Employee identified' : 'Awaiting scan'}
            </span>

            {currentMatch ? (
              <>
                <h2 className="mt-3 font-display text-3xl leading-tight text-ink">{currentMatch.name}</h2>
                {currentMatch.officeName ? <p className="mt-2 text-sm text-muted">{currentMatch.officeName}</p> : null}
                {currentMatch.confidence ? (
                  <div className="mt-4 space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${currentMatch.confidence * 100}%` }} />
                    </div>
                    <div className="text-sm font-medium text-emerald-700">{(currentMatch.confidence * 100).toFixed(1)}% match</div>
                  </div>
                ) : null}
                <p className={`mt-4 text-sm leading-7 ${isBlocked ? 'text-warn' : 'text-muted'}`}>{currentMatch.detail}</p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-7 text-muted">Stand in front of the camera and wait for the scan to confirm.</p>
            )}
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-display text-2xl text-ink">Today's attendance</h2>
              <span className="rounded-full bg-brand/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">
                {todayLog.length}
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
              {todayLog.length === 0 ? (
                <div className="rounded-[1.25rem] border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted">
                  No entries yet today.
                </div>
              ) : (
                todayLog.slice(0, 12).map(entry => (
                  <div key={entry.id} className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-black/5 bg-white px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{entry.name}</div>
                      <div className="truncate text-xs uppercase tracking-[0.12em] text-muted">
                        {entry.officeName} • {entry.attendanceMode}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-muted">{entry.time}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </motion.aside>
      </div>
      </div>
    </AppShell>
  )
}

function StatusDot({ ok }) {
  return <span className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
}

function StatusItem({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  )
}

function QuickInfoCard({ label, value, detail }) {
  return (
    <div className="rounded-[1.2rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white/90 to-accent/10 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">{label}</div>
      <div className="mt-2 font-display text-2xl text-ink">{value}</div>
      <div className="mt-1 text-sm text-muted">{detail}</div>
    </div>
  )
}

function firebaseEnabledLabel(status) {
  if (status.toLowerCase().includes('firebase')) return 'Firebase'
  if (status.toLowerCase().includes('local')) return 'Local'
  return 'Storage'
}
