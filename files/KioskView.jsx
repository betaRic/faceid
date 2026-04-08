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

const pad = v => String(v).padStart(2, '0')

function formatTime(ts) {
  const d = new Date(ts)
  const h = d.getHours()
  return `${pad(h % 12 || 12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${h >= 12 ? 'PM' : 'AM'}`
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function drawBracketBox(ctx, box, color, label, confidence, scaleX = 1, scaleY = 1) {
  const x = box.x * scaleX
  const y = box.y * scaleY
  const w = box.width * scaleX
  const h = box.height * scaleY
  const c = Math.min(w, h) * 0.18

  ctx.strokeStyle = color
  ctx.lineWidth = 3

  ;[
    [[x, y + c], [x, y], [x + c, y]],
    [[x + w - c, y], [x + w, y], [x + w, y + c]],
    [[x + w, y + h - c], [x + w, y + h], [x + w - c, y + h]],
    [[x + c, y + h], [x, y + h], [x, y + h - c]],
  ].forEach(pts => {
    ctx.beginPath()
    pts.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) })
    ctx.stroke()
  })

  if (!label) return
  ctx.font = 'bold 13px "Outfit", sans-serif'
  const text = confidence != null ? `${label} ${(confidence * 100).toFixed(0)}%` : label
  const tw = ctx.measureText(text).width + 16
  ctx.fillStyle = `${color}cc`
  ctx.fillRect(x, y - 30, tw, 28)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, x + 8, y - 10)
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
    })
  })
}

const stateConfig = {
  idle: { label: 'Ready — face the camera', color: 'text-muted', ring: false, flash: false },
  scanning: { label: 'Scanning…', color: 'text-brand-dark', ring: true, flash: false },
  liveness: { label: 'Liveness check', color: 'text-amber-700', ring: false, flash: false },
  confirmed: { label: 'Attendance logged', color: 'text-emerald-700', ring: false, flash: true },
  unknown: { label: 'Not recognized', color: 'text-warn', ring: false, flash: false },
  blocked: { label: 'Blocked', color: 'text-warn', ring: false, flash: false },
}

export default function KioskView({
  camera, persons, modelsReady, modelStatus,
  attendance, onLogAttendance, onGoRegister,
  todayLogCount, dataStatus, errorMessage,
}) {
  const [clock, setClock] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [kioskState, setKioskState] = useState('idle')
  const [currentMatch, setCurrentMatch] = useState(null)
  const [flashKey, setFlashKey] = useState(0)
  const [livenessChallenge, setLivenessChallenge] = useState(() => pickLivenessChallenge('any'))
  const [livenessPassed, setLivenessPassed] = useState(false)
  const [lastFailure, setLastFailure] = useState('')
  const playAudioCue = useAudioCue()

  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const confirmRef = useRef(0)
  const confirmedTimer = useRef(null)
  const unknownTimer = useRef(null)
  const prevStateRef = useRef('idle')
  const livenessTrackerRef = useRef(createLivenessTracker())

  const stopLoop = useCallback(() => {
    if (scanRef.current) { window.clearInterval(scanRef.current); scanRef.current = null }
  }, [])

  const resetLiveness = useCallback(() => {
    livenessTrackerRef.current = createLivenessTracker()
    setLivenessChallenge(pickLivenessChallenge('any'))
    setLivenessPassed(false)
  }, [])

  useEffect(() => {
    const tick = () => { const n = Date.now(); setClock(formatTime(n)); setDateStr(formatDate(n)) }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const drawOverlay = useCallback((dets, sw, sh) => {
    const video = camera.videoRef.current
    const overlay = camera.overlayRef.current
    if (!overlay || !video) return
    const w = video.videoWidth || 640
    const h = video.videoHeight || 480
    overlay.width = w; overlay.height = h
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    dets.forEach(det => {
      const box = det.detection?.box
      if (box) drawBracketBox(ctx, box, '#10b981', null, null, sw ? w / sw : 1, sh ? h / sh : 1)
    })
  }, [camera])

  const runScan = useCallback(async () => {
    if (busyRef.current || !camera.camOn || !modelsReady) return
    busyRef.current = true
    try {
      const canvas = camera.captureImageData({ maxWidth: DETECTION_MAX_DIMENSION, maxHeight: DETECTION_MAX_DIMENSION })
      const dets = await detectWithDescriptors(canvas)

      if (dets.length === 0) {
        if (!confirmedTimer.current) {
          window.clearTimeout(unknownTimer.current); unknownTimer.current = null
          setKioskState('idle'); setCurrentMatch(null); confirmRef.current = 0
          camera.clearOverlay(); resetLiveness()
        }
        busyRef.current = false; return
      }
      window.clearTimeout(unknownTimer.current); unknownTimer.current = null

      const primary = dets[0]
      const quality = evaluateDetectionQuality(primary, canvas.width, canvas.height, canvas)
      if (!quality.ok) {
        setKioskState('idle')
        setCurrentMatch({ name: 'Poor framing', confidence: 0, detail: quality.reason })
        busyRef.current = false; return
      }

      const liveness = analyzeLiveness(primary)
      livenessTrackerRef.current = updateLivenessTracker(livenessTrackerRef.current, liveness)
      const passed = isLivenessChallengePassed(livenessChallenge.id, liveness)
        || hasLivenessTrackerPassed(livenessChallenge.id, livenessTrackerRef.current)

      if (!livenessPassed && passed) setLivenessPassed(true)
      if (!livenessPassed && !passed) {
        setKioskState('liveness')
        setCurrentMatch({ name: 'Liveness required', confidence: 0, detail: livenessChallenge.label })
        busyRef.current = false; return
      }

      drawOverlay(dets, canvas.width, canvas.height)
      confirmRef.current += 1
      if (!confirmedTimer.current) setKioskState('scanning')

      if (confirmRef.current >= CONFIRM_FRAMES) {
        const now = Date.now()
        const position = await getCurrentPosition().catch(() => null)
        const coords = position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null

        const result = await onLogAttendance({
          id: `${now}`, name: '', employeeId: '', officeId: '', officeName: '',
          attendanceMode: '', geofenceStatus: '', confidence: 0,
          timestamp: now,
          date: new Date(now).toLocaleDateString('en-PH'),
          time: formatTime(now),
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          descriptor: Array.from(primary.descriptor),
        })

        const entry = result.entry
        if (entry) {
          setLastFailure('')
          setFlashKey(v => v + 1)
          setCurrentMatch({
            name: entry.name, confidence: entry.confidence ?? 0,
            officeName: entry.officeName,
            detail: `${entry.attendanceMode} · ${entry.geofenceStatus}`,
          })
          setKioskState('confirmed')
        }
        confirmRef.current = 0; resetLiveness()
        window.clearTimeout(confirmedTimer.current)
        confirmedTimer.current = window.setTimeout(() => {
          confirmedTimer.current = null; setKioskState('idle'); setCurrentMatch(null)
        }, CONFIRMED_HOLD_MS)
      }
    } catch (error) {
      const code = error.decisionCode || ''
      if (code === 'blocked_no_reliable_match' || code === 'blocked_ambiguous_match') {
        if (!confirmedTimer.current && !unknownTimer.current) {
          unknownTimer.current = window.setTimeout(() => {
            setKioskState(code === 'blocked_ambiguous_match' ? 'blocked' : 'unknown')
            setLastFailure(error.message || 'No reliable match.')
            setCurrentMatch({ name: code === 'blocked_ambiguous_match' ? 'Ambiguous match' : 'Not recognized', confidence: 0, detail: error.message })
            confirmRef.current = 0; unknownTimer.current = null
          }, UNKNOWN_DEBOUNCE_MS)
        }
      } else if (code === 'blocked_recent_duplicate') {
        setKioskState('blocked')
        setLastFailure(error.message || 'Recently recorded.')
        setCurrentMatch({ name: error.entry?.name || 'Already recorded', confidence: error.entry?.confidence ?? 0, officeName: error.entry?.officeName, detail: error.message })
      } else {
        setKioskState('blocked')
        setLastFailure(error.message || 'Blocked.')
        setCurrentMatch({ name: 'Attendance blocked', confidence: 0, detail: error.message || 'Location required for on-site attendance.' })
      }
      resetLiveness()
    }
    busyRef.current = false
  }, [camera, drawOverlay, livenessChallenge.id, livenessPassed, modelsReady, onLogAttendance, resetLiveness])

  const startLoop = useCallback(() => {
    if (scanRef.current) return
    scanRef.current = window.setInterval(runScan, SCAN_INTERVAL_MS)
  }, [runScan])

  useEffect(() => { camera.start().then(() => startLoop()); return () => stopLoop() }, [camera, startLoop, stopLoop])
  useEffect(() => { if (!modelsReady) return; stopLoop(); startLoop(); return stopLoop }, [modelsReady, startLoop, stopLoop])

  useEffect(() => {
    const prev = prevStateRef.current
    if (prev === kioskState) return
    if (kioskState === 'confirmed') playAudioCue('success')
    if ((kioskState === 'blocked' || kioskState === 'unknown') && prev !== 'blocked' && prev !== 'unknown') playAudioCue('notify')
    prevStateRef.current = kioskState
  }, [kioskState, playAudioCue])

  const today = new Date().toLocaleDateString('en-PH')
  const todayLogs = attendance.filter(e => e.date === today)
  const sc = stateConfig[kioskState] || stateConfig.idle
  const isConfirmed = kioskState === 'confirmed'
  const isNegative = kioskState === 'unknown' || kioskState === 'blocked'

  return (
    <AppShell
      actions={(
        <>
          <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm sm:inline">
            {todayLogCount} today
          </span>
          <button
            onClick={onGoRegister}
            type="button"
            className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
          >
            Register
          </button>
        </>
      )}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Layout: stack on mobile, side-by-side on lg */}
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">

          {/* Camera column */}
          <div className="flex flex-col gap-4">
            {/* Page header */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Kiosk</p>
                <h1 className="font-display text-2xl text-ink">{dateStr}</h1>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl tabular-nums text-ink">{clock}</p>
                <p className={`mt-0.5 text-xs font-semibold ${sc.color}`}>{sc.label}</p>
              </div>
            </div>

            {/* Camera viewport */}
            <div className={`relative overflow-hidden rounded-2xl bg-stone-950 shadow-lg transition-all duration-300 ${sc.ring ? 'ring-2 ring-brand ring-offset-2' : ''}`}
              style={{ aspectRatio: '16/10', minHeight: 300 }}>
              <video ref={camera.videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
              <canvas ref={camera.canvasRef} className="hidden" />
              <canvas ref={camera.overlayRef} className="absolute inset-0 h-full w-full" />

              {!camera.camOn && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stone-950/80 text-center text-white">
                  <svg className="h-10 w-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium">{camera.camError || 'Camera offline'}</p>
                </div>
              )}

              {/* Flash overlay */}
              {isConfirmed && (
                <motion.div
                  key={flashKey}
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-0 bg-emerald-400 pointer-events-none"
                />
              )}

              {/* Bottom pill */}
              <div className="absolute inset-x-0 bottom-4 flex justify-center">
                <span className={`rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-sm transition-colors ${
                  isConfirmed ? 'bg-emerald-500/90 text-white' :
                  isNegative ? 'bg-red-500/80 text-white' :
                  kioskState === 'liveness' ? 'bg-amber-500/80 text-white' :
                  kioskState === 'scanning' ? 'bg-brand/80 text-white' :
                  'bg-white/70 text-muted'
                }`}>
                  {isConfirmed ? '✓ Accepted' :
                   kioskState === 'liveness' ? livenessChallenge.label :
                   kioskState === 'scanning' ? 'Scanning face…' :
                   isNegative ? sc.label :
                   'Face the camera'}
                </span>
              </div>
            </div>

            {/* Status bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-black/[0.06] bg-white/70 px-4 py-3 text-xs">
              <StatusPill ok={modelsReady} label="AI" value={modelsReady ? 'Ready' : modelStatus} />
              <StatusPill ok={camera.camOn} label="Camera" value={camera.camOn ? 'Live' : 'Offline'} />
              <StatusPill ok label="Enrolled" value={`${persons.length}`} />
              <StatusPill ok label="GPS" value={typeof navigator !== 'undefined' && navigator.geolocation ? 'Available' : 'None'} />
              {errorMessage && <span className="ml-auto text-warn">{errorMessage}</span>}
            </div>
          </div>

          {/* Info column */}
          <div className="flex flex-col gap-4">
            {/* Match / identity card */}
            <motion.div
              className={`rounded-2xl border p-5 transition-colors duration-300 ${
                isConfirmed ? 'border-emerald-200 bg-emerald-50' :
                isNegative ? 'border-red-200 bg-red-50/60' :
                'border-black/[0.06] bg-white/80'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                {isConfirmed ? 'Identified' : isNegative ? 'Rejected' : 'Awaiting scan'}
              </p>

              {currentMatch ? (
                <div className="mt-3">
                  <h2 className="font-display text-2xl text-ink">{currentMatch.name}</h2>
                  {currentMatch.officeName && (
                    <p className="mt-1 text-sm text-muted">{currentMatch.officeName}</p>
                  )}
                  {currentMatch.confidence > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Match confidence</span>
                        <span className="font-semibold text-emerald-700">{(currentMatch.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${currentMatch.confidence * 100}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full rounded-full bg-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                  {currentMatch.detail && (
                    <p className={`mt-3 text-sm leading-relaxed ${isNegative ? 'text-red-700' : 'text-muted'}`}>
                      {currentMatch.detail}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Stand in front of the camera and wait for the liveness check to complete.
                </p>
              )}
            </motion.div>

            {/* Policy card */}
            <div className="rounded-2xl border border-black/[0.06] bg-white/70 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Policy</p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand/10 text-center text-[10px] leading-4 text-brand">✓</span>
                  On-site: GPS inside office radius required
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand/10 text-center text-[10px] leading-4 text-brand">✓</span>
                  WFH: allowed on designated office WFH days
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-amber-100 text-center text-[10px] leading-4 text-amber-700">!</span>
                  Identity verified server-side only
                </li>
              </ul>
              {lastFailure && (
                <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  Last failure: {lastFailure}
                </div>
              )}
            </div>

            {/* Today log */}
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg text-ink">Today's Log</h3>
                <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark">
                  {todayLogs.length}
                </span>
              </div>

              <div className="flex-1 space-y-2 overflow-auto">
                {todayLogs.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-black/10 text-sm text-muted">
                    No entries yet
                  </div>
                ) : (
                  todayLogs.slice(0, 15).map(entry => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] bg-stone-50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{entry.name}</p>
                        <p className="truncate text-xs text-muted">{entry.officeName} · {entry.attendanceMode}</p>
                      </div>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted">{entry.time}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function StatusPill({ ok, label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <span className="font-semibold uppercase tracking-widest text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  )
}
