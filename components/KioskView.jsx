'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildMatcher, detectWithDescriptors, matchDescriptor } from '../lib/face-api'
import {
  CONFIDENCE_MIN,
  CONFIRM_FRAMES,
  SCAN_INTERVAL_MS,
  COOLDOWN_MS,
  CONFIRMED_HOLD_MS,
  UNKNOWN_DEBOUNCE_MS,
} from '../lib/config'
import { analyzeLiveness, isLivenessChallengePassed, pickLivenessChallenge } from '../lib/liveness'
import { calculateDistanceMeters, getOfficeById, isOfficeWfhDay } from '../lib/offices'

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

function drawBracketBox(ctx, box, color, label, confidence) {
  const { x, y, width, height } = box
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
  offices,
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
  const [livenessChallenge, setLivenessChallenge] = useState(() => pickLivenessChallenge())
  const [livenessPassed, setLivenessPassed] = useState(false)

  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const matcherRef = useRef(null)
  const confirmRef = useRef({ name: null, count: 0 })
  const cooldownRef = useRef({})
  const confirmedTimer = useRef(null)
  const unknownTimer = useRef(null)
  const smoothConfidenceRef = useRef({})

  const stopLoop = useCallback(() => {
    if (scanRef.current) {
      window.clearInterval(scanRef.current)
      scanRef.current = null
    }
  }, [])

  const resetLiveness = useCallback(() => {
    setLivenessChallenge(pickLivenessChallenge())
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

  useEffect(() => {
    camera.start().then(() => startLoop())
    return () => stopLoop()
  }, [camera, startLoop, stopLoop])

  useEffect(() => {
    const activePersons = persons.filter(person => person.active !== false)
    matcherRef.current = activePersons.length > 0 ? buildMatcher(activePersons) : null
  }, [persons])

  const drawOverlay = useCallback((detections, matched) => {
    const video = camera.videoRef.current
    const overlay = camera.overlayRef.current

    if (!overlay || !video) return

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    overlay.width = width
    overlay.height = height

    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    detections.forEach((detection, index) => {
      const box = detection.detection?.box
      if (!box) return

      const match = matched?.[index]
      const identified = match?.identified && match.confidence >= CONFIDENCE_MIN
      const color = identified ? '#22c55e' : '#ef4444'
      const label = identified ? match.name : 'UNKNOWN'
      drawBracketBox(ctx, box, color, label, identified ? match.confidence : null)
    })
  }, [camera])

  const validateAttendance = useCallback(async matchedPerson => {
    const office = getOfficeById(matchedPerson.officeId) || offices.find(item => item.id === matchedPerson.officeId) || null
    const officeWfhToday = isOfficeWfhDay(office)

    if (officeWfhToday) {
      return {
        allowed: true,
        attendanceMode: 'WFH',
        geofenceStatus: 'WFH office day',
        office,
        distanceMeters: null,
        coordinates: null,
      }
    }

    const position = await getCurrentPosition()
    const coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }

    if (!office?.gps) {
      return {
        allowed: false,
        reason: 'Assigned office has no GPS coordinates configured',
        office,
      }
    }

    const distanceMeters = calculateDistanceMeters(coordinates, office.gps)
    const withinRadius = distanceMeters <= office.gps.radiusMeters

    if (!withinRadius) {
      return {
        allowed: false,
        reason: `Outside ${office.name} geofence`,
        office,
        distanceMeters,
        coordinates,
      }
    }

    return {
      allowed: true,
      attendanceMode: 'On-site',
      geofenceStatus: `Inside office radius (${Math.round(distanceMeters)}m)`,
      office,
      distanceMeters,
      coordinates,
    }
  }, [offices])

  const runScan = useCallback(async () => {
    if (busyRef.current || !camera.camOn || !modelsReady) return

    busyRef.current = true

    try {
      const canvas = camera.captureImageData()
      const detections = await detectWithDescriptors(canvas)

      if (detections.length === 0) {
        if (!confirmedTimer.current) {
          window.clearTimeout(unknownTimer.current)
          unknownTimer.current = null
          setKioskState('idle')
          setCurrentMatch(null)
          confirmRef.current = { name: null, count: 0 }
          camera.clearOverlay()
          resetLiveness()
        }

        busyRef.current = false
        return
      }

      window.clearTimeout(unknownTimer.current)
      unknownTimer.current = null

      const primaryDetection = detections[0]
      const liveness = analyzeLiveness(primaryDetection)
      const passedChallenge = isLivenessChallengePassed(livenessChallenge.id, liveness)

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

      let bestMatch = null
      const matched = await Promise.all(detections.map(async detection => {
        const match = await matchDescriptor(matcherRef.current, detection.descriptor)
        if (match?.identified && match.confidence >= CONFIDENCE_MIN) {
          if (!bestMatch || match.confidence > bestMatch.confidence) bestMatch = match
        }
        return match
      }))

      drawOverlay(detections, matched)

      if (!bestMatch) {
        if (!confirmedTimer.current && !unknownTimer.current) {
          unknownTimer.current = window.setTimeout(() => {
            setKioskState('unknown')
            setCurrentMatch(null)
            confirmRef.current = { name: null, count: 0 }
            unknownTimer.current = null
          }, UNKNOWN_DEBOUNCE_MS)
        }

        busyRef.current = false
        return
      }

      const matchedPerson = persons.find(person => person.name === bestMatch.name && person.active !== false)
      if (!matchedPerson) {
        setKioskState('blocked')
        setCurrentMatch({
          name: bestMatch.name,
          confidence: bestMatch.confidence,
          detail: 'Employee record is inactive or missing',
        })
        busyRef.current = false
        return
      }

      const previous = smoothConfidenceRef.current[bestMatch.name] ?? bestMatch.confidence
      const smoothed = previous * 0.6 + bestMatch.confidence * 0.4
      smoothConfidenceRef.current[bestMatch.name] = smoothed

      if (confirmRef.current.name === bestMatch.name) confirmRef.current.count += 1
      else confirmRef.current = { name: bestMatch.name, count: 1 }

      if (!confirmedTimer.current) setKioskState('scanning')

      if (confirmRef.current.count >= CONFIRM_FRAMES) {
        const name = bestMatch.name
        const now = Date.now()
        const lastLog = cooldownRef.current[name] || 0

        if (now - lastLog > COOLDOWN_MS) {
          const validation = await validateAttendance(matchedPerson)

          if (!validation.allowed) {
            setKioskState('blocked')
            setCurrentMatch({
              name,
              confidence: smoothed,
              officeName: matchedPerson.officeName,
              detail: validation.reason,
            })
            confirmRef.current = { name: null, count: 0 }
            busyRef.current = false
            return
          }

          cooldownRef.current[name] = now

          await onLogAttendance({
            id: `${now}_${name}`,
            name,
            employeeId: matchedPerson.employeeId,
            officeId: matchedPerson.officeId,
            officeName: matchedPerson.officeName,
            attendanceMode: validation.attendanceMode,
            geofenceStatus: validation.geofenceStatus,
            confidence: smoothed,
            timestamp: now,
            date: new Date(now).toLocaleDateString('en-PH'),
            time: formatTime(now),
            latitude: validation.coordinates?.latitude ?? null,
            longitude: validation.coordinates?.longitude ?? null,
          })

          setFlashKey(value => value + 1)
          setCurrentMatch({
            name,
            confidence: smoothed,
            officeName: matchedPerson.officeName,
            detail: `${validation.attendanceMode} • ${validation.geofenceStatus}`,
          })
        }

        setKioskState('confirmed')
        confirmRef.current = { name: null, count: 0 }
        resetLiveness()

        window.clearTimeout(confirmedTimer.current)
        confirmedTimer.current = window.setTimeout(() => {
          confirmedTimer.current = null
          setKioskState('idle')
          setCurrentMatch(null)
        }, CONFIRMED_HOLD_MS)
      }
    } catch (error) {
      setKioskState('blocked')
      setCurrentMatch({
        name: 'Attendance blocked',
        confidence: 0,
        detail: error.message || 'Location permission is required for on-site attendance',
      })
      resetLiveness()
    }

    busyRef.current = false
  }, [camera, drawOverlay, livenessChallenge.id, livenessPassed, modelsReady, offices, onLogAttendance, persons, resetLiveness, validateAttendance])

  const startLoop = useCallback(() => {
    if (scanRef.current) return
    scanRef.current = window.setInterval(runScan, SCAN_INTERVAL_MS)
  }, [runScan])

  useEffect(() => {
    if (!modelsReady) return
    stopLoop()
    startLoop()
    return stopLoop
  }, [modelsReady, startLoop, stopLoop])

  const today = new Date().toLocaleDateString('en-PH')
  const todayLog = attendance.filter(entry => entry.date === today)
  const isConfirmed = kioskState === 'confirmed'
  const isUnknown = kioskState === 'unknown'
  const isBlocked = kioskState === 'blocked'
  const isLiveness = kioskState === 'liveness'

  return (
    <main className="min-h-screen bg-hero-wash px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="overflow-hidden rounded-[1.9rem] border border-black/5 bg-black shadow-glow">
            <div className="relative aspect-[4/5] min-h-[420px] sm:aspect-video xl:aspect-[4/3]">
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
                  {isConfirmed
                    ? 'Attendance logged'
                    : isUnknown
                      ? 'Not recognized'
                      : isBlocked
                        ? 'Attendance blocked'
                        : isLiveness
                          ? livenessChallenge.label
                        : kioskState === 'scanning'
                          ? 'Scanning face'
                          : 'Please face the camera'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-[1.6rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur">
            <StatusDot ok={modelsReady} />
            <StatusItem label="AI engine" value={modelStatus} />
            <StatusItem label="Storage" value={dataStatus} />
            <StatusItem label="Enrolled" value={`${persons.length}`} />
            <StatusItem label="Today" value={`${todayLogCount} logs`} />
            <div className="ml-auto">
              <button
                className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
                onClick={onGoRegister}
                type="button"
              >
                Open registration
              </button>
            </div>
          </div>
        </motion.section>

        <motion.aside
          animate={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
          className="flex min-w-0 flex-col gap-4"
        >
          <section className="rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
            <div className="inline-flex rounded-full bg-brand/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">
              DILG Region XII
            </div>
            <h1 className="mt-4 font-display text-3xl leading-tight text-ink">GPS Face Attendance</h1>
            <p className="mt-2 text-sm leading-7 text-muted">Shared office scanning for assigned employees only.</p>

            <div className="mt-6 rounded-[1.5rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white to-accent/10 p-5 text-center">
              <div className="font-display text-5xl leading-none text-ink">{clock}</div>
              <div className="mt-2 text-sm text-muted">{dateStr}</div>
              <div className={`mt-4 inline-flex rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${livenessPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-white/80 text-brand-dark'}`}>
                {livenessPassed ? 'Liveness passed' : livenessChallenge.label}
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recognition</span>
              <span className="text-sm font-semibold text-ink">{modelsReady ? 'Ready' : 'Loading models'}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Policy</span>
              <span className="text-sm font-semibold text-ink">One office per employee</span>
            </div>
            {errorMessage ? <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-warn">{errorMessage}</div> : null}
            <p className="mt-4 text-sm leading-7 text-muted">
              On-site attendance requires GPS inside the assigned office radius. Outside radius is blocked unless the
              office is on WFH for today.
            </p>
          </section>

          <section className={`rounded-[1.75rem] border p-5 shadow-glow backdrop-blur ${isConfirmed ? 'border-emerald-500/25 bg-emerald-50/85' : isUnknown || isBlocked ? 'border-red-500/20 bg-red-50/85' : 'border-black/5 bg-white/80'}`}>
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

          <section className="flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
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
    </main>
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
