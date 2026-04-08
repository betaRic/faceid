import React, { useEffect, useRef, useState, useCallback } from 'react'
import { detectWithDescriptors, buildMatcher, matchDescriptor } from '../localFaceApi'
import {
  CONFIDENCE_MIN, CONFIRM_FRAMES, SCAN_INTERVAL_MS,
  COOLDOWN_MS, CONFIRMED_HOLD_MS, UNKNOWN_DEBOUNCE_MS
} from '../config'

const PAD = n => String(n).padStart(2, '0')
function fmtTime(ts) {
  const d = new Date(ts), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds()
  return `${PAD(h % 12 || 12)}:${PAD(m)}:${PAD(s)} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
}

function drawBracketBox(ctx, box, color, label, conf) {
  const { x, y, width: w, height: h } = box
  const cs = Math.min(w, h) * 0.18
  ctx.strokeStyle = color; ctx.lineWidth = 3
  ;[
    [[x, y+cs],[x,y],[x+cs,y]],
    [[x+w-cs,y],[x+w,y],[x+w,y+cs]],
    [[x+w,y+h-cs],[x+w,y+h],[x+w-cs,y+h]],
    [[x+cs,y+h],[x,y+h],[x,y+h-cs]],
  ].forEach(pts => {
    ctx.beginPath()
    pts.forEach(([px,py],i) => i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py))
    ctx.stroke()
  })
  if (label) {
    ctx.font = 'bold 14px "Share Tech Mono", monospace'
    const text = label + (conf != null ? `  ${(conf*100).toFixed(0)}%` : '')
    const tw = ctx.measureText(text).width + 16
    ctx.fillStyle = color + 'cc'
    ctx.fillRect(x, y - 30, tw, 28)
    ctx.fillStyle = '#000'
    ctx.fillText(text, x + 8, y - 10)
  }
}

export default function KioskView({
  camera, persons, modelsReady, modelStatus,
  attendance, onLogAttendance, onGoRegister
}) {
  const [clock, setClock]           = useState('')
  const [dateStr, setDateStr]       = useState('')
  const [kioskState, setKioskState] = useState('idle')
  const [currentMatch, setCurrentMatch] = useState(null)
  const [flashKey, setFlashKey]     = useState(0)

  const scanRef         = useRef(null)
  const busyRef         = useRef(false)
  const matcherRef      = useRef(null)
  const confirmRef      = useRef({ name: null, count: 0 })
  const cooldownRef     = useRef({})
  const confirmedTimer  = useRef(null)  // holds the 4-second "keep confirmed" timer
  const unknownTimer    = useRef(null)  // debounce before showing "unknown"
  const smoothConfRef   = useRef({})    // { [name]: smoothed confidence (EMA) }

  // Clock
  useEffect(() => {
    const tick = () => { setClock(fmtTime(Date.now())); setDateStr(fmtDate(Date.now())) }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])

  // Start camera on mount
  useEffect(() => {
    camera.start().then(() => startLoop())
    return () => stopLoop()
  }, [])

  // Rebuild matcher when persons change
  useEffect(() => {
    matcherRef.current = persons.length > 0 ? buildMatcher(persons) : null
  }, [persons])

  const drawOverlay = useCallback((detections, matched) => {
    const v = camera.videoRef.current, oc = camera.overlayRef.current
    if (!oc || !v) return
    const vw = v.videoWidth || 640, vh = v.videoHeight || 480
    oc.width = vw; oc.height = vh
    const ctx = oc.getContext('2d')
    ctx.clearRect(0, 0, vw, vh)
    detections.forEach((det, i) => {
      const box = det.detection?.box
      if (!box) return
      const m = matched?.[i]
      const identified = m?.identified && m.confidence >= CONFIDENCE_MIN
      const color = identified ? '#00ff88' : '#ff4455'
      const label = identified ? m.name : 'UNKNOWN'
      drawBracketBox(ctx, box, color, label, identified ? m.confidence : null)
    })
  }, [camera])

  const runScan = useCallback(async () => {
    if (busyRef.current || !camera.camOn || !modelsReady) return
    busyRef.current = true
    try {
      const canvas = camera.captureImageData()
      const detections = await detectWithDescriptors(canvas)

      if (detections.length === 0) {
        // Only flip to idle if we're not in a hold period
        if (!confirmedTimer.current) {
          clearTimeout(unknownTimer.current)
          unknownTimer.current = null
          setKioskState('idle')
          setCurrentMatch(null)
          confirmRef.current = { name: null, count: 0 }
          camera.clearOverlay()
        }
        busyRef.current = false
        return
      }

      // Clear any pending unknown debounce — a face is present
      clearTimeout(unknownTimer.current)
      unknownTimer.current = null

      // Match all detected faces
      let bestMatch = null
      const matched = detections.map(det => {
        const m = matchDescriptor(matcherRef.current, det.descriptor)
        if (m?.identified && m.confidence >= CONFIDENCE_MIN) {
          if (!bestMatch || m.confidence > bestMatch.confidence) bestMatch = m
        }
        return m
      })

      drawOverlay(detections, matched)

      if (!bestMatch) {
        // Debounce "unknown" — only show if still unrecognized after a short wait
        if (!confirmedTimer.current && !unknownTimer.current) {
          unknownTimer.current = setTimeout(() => {
            setKioskState('unknown')
            setCurrentMatch(null)
            confirmRef.current = { name: null, count: 0 }
            unknownTimer.current = null
          }, UNKNOWN_DEBOUNCE_MS)
        }
        busyRef.current = false
        return
      }

      // Exponential moving average for confidence (smooths jitter)
      const prev = smoothConfRef.current[bestMatch.name] ?? bestMatch.confidence
      const smoothed = prev * 0.6 + bestMatch.confidence * 0.4
      smoothConfRef.current[bestMatch.name] = smoothed

      // Consecutive-frame confirmation
      const cr = confirmRef.current
      if (cr.name === bestMatch.name) { cr.count++ }
      else { confirmRef.current = { name: bestMatch.name, count: 1 } }

      if (!confirmedTimer.current) {
        setKioskState('scanning')
      }

      if (confirmRef.current.count >= CONFIRM_FRAMES) {
        const name = bestMatch.name
        const now = Date.now()
        const lastLog = cooldownRef.current[name] || 0

        if (now - lastLog > COOLDOWN_MS) {
          cooldownRef.current[name] = now
          onLogAttendance({
            id: `${now}_${name}`,
            name,
            confidence: smoothed,
            timestamp: now,
            date: new Date(now).toLocaleDateString('en-PH'),
            time: fmtTime(now),
          })
          setFlashKey(k => k + 1)
        }

        setCurrentMatch({ name, confidence: smoothed })
        setKioskState('confirmed')
        confirmRef.current = { name: null, count: 0 }

        // Hold "confirmed" card for CONFIRMED_HOLD_MS then fade back
        clearTimeout(confirmedTimer.current)
        confirmedTimer.current = setTimeout(() => {
          confirmedTimer.current = null
          setKioskState('idle')
          setCurrentMatch(null)
        }, CONFIRMED_HOLD_MS)
      }
    } catch (e) {
      console.error('scan error', e)
    }
    busyRef.current = false
  }, [camera, modelsReady, drawOverlay, onLogAttendance])

  const startLoop = useCallback(() => {
    if (scanRef.current) return
    scanRef.current = setInterval(runScan, SCAN_INTERVAL_MS)
  }, [runScan])

  const stopLoop = () => { clearInterval(scanRef.current); scanRef.current = null }

  useEffect(() => {
    if (!modelsReady) return
    stopLoop(); startLoop()
    return stopLoop
  }, [modelsReady, startLoop])

  const todayStr = new Date().toLocaleDateString('en-PH')
  const todayLog = attendance.filter(e => e.date === todayStr)
  const isConfirmed = kioskState === 'confirmed'
  const isUnknown   = kioskState === 'unknown'
  const isIdle      = kioskState === 'idle'

  return (
    <div className="kiosk-root">
      <div className="kiosk-cam-col">
        <div className="kiosk-cam-wrap">
          <video ref={camera.videoRef} playsInline muted className="kiosk-video" />
          <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
          <canvas ref={camera.overlayRef} className="kiosk-overlay" />

          {!camera.camOn && (
            <div className="cam-offline">
              <div className="cam-offline-icon">◈</div>
              <div>Camera Offline</div>
            </div>
          )}

          {kioskState === 'scanning' && <div className="scan-ring" />}
          {isConfirmed && <div key={flashKey} className="confirm-flash" />}

          <div className="k-corner tl" /><div className="k-corner tr" />
          <div className="k-corner bl" /><div className="k-corner br" />

          <div className="cam-prompt">
            {isIdle      && <span className="prompt-idle">◈  PLEASE FACE THE CAMERA</span>}
            {kioskState === 'scanning' && <span className="prompt-scanning">◈  SCANNING…</span>}
            {isConfirmed && <span className="prompt-ok">✓  IDENTITY CONFIRMED</span>}
            {isUnknown   && <span className="prompt-fail">✗  NOT RECOGNIZED</span>}
          </div>
        </div>

        <div className="sys-bar">
          <span className={`sys-dot ${modelsReady ? 'ok' : 'warn'}`} />
          <span className="sys-label">AI ENGINE</span>
          <span className="sys-val">{modelStatus.toUpperCase()}</span>
          <span className="sys-sep">|</span>
          <span className="sys-label">ENROLLED</span>
          <span className="sys-val">{persons.length}</span>
          <span className="sys-sep">|</span>
          <span className="sys-label">TODAY</span>
          <span className="sys-val">{todayLog.length} LOGS</span>
          <span className="sys-spacer" />
          <button className="admin-btn" onClick={onGoRegister}>⊕ ENROLL</button>
        </div>
      </div>

      <div className="kiosk-info-col">
        <div className="info-header">
          <div className="info-badge">DILG</div>
          <div className="info-org">General Santos City</div>
          <div className="info-sys">ATTENDANCE SYSTEM</div>
        </div>

        <div className="info-clock-block">
          <div className="info-clock">{clock}</div>
          <div className="info-date">{dateStr}</div>
        </div>

        <div className={`id-card ${isConfirmed ? 'id-ok' : isUnknown ? 'id-fail' : 'id-idle'}`}>
          {isConfirmed && currentMatch ? (
            <>
              <div className="id-label">EMPLOYEE IDENTIFIED</div>
              <div className="id-name">{currentMatch.name}</div>
              <div className="id-conf">
                <div className="id-conf-bar-bg">
                  <div className="id-conf-bar" style={{ width: (currentMatch.confidence * 100) + '%' }} />
                </div>
                <span>{(currentMatch.confidence * 100).toFixed(1)}% MATCH</span>
              </div>
              <div className="id-welcome">ATTENDANCE LOGGED  ✓</div>
            </>
          ) : isUnknown ? (
            <>
              <div className="id-label">UNRECOGNIZED</div>
              <div className="id-name id-unknown-name">NOT IN DATABASE</div>
              <div className="id-hint">Please see the admin to register.</div>
            </>
          ) : (
            <>
              <div className="id-label">AWAITING SCAN</div>
              <div className="id-name id-standby">STAND IN FRONT<br/>OF THE CAMERA</div>
            </>
          )}
        </div>

        <div className="log-panel">
          <div className="log-title">
            TODAY'S ATTENDANCE
            <span className="log-count">{todayLog.length}</span>
          </div>
          <div className="log-list">
            {todayLog.length === 0
              ? <div className="log-empty">No entries yet today</div>
              : todayLog.slice(0, 12).map(e => (
                <div key={e.id} className="log-row">
                  <div className="log-name">{e.name}</div>
                  <div className="log-time">{e.time}</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}