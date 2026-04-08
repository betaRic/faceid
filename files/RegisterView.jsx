'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectSingleDescriptor } from '../lib/face-api'
import { DETECTION_MAX_DIMENSION, FACE_COLORS, PREVIEW_MAX_DIMENSION } from '../lib/config'
import {
  analyzeLiveness, createLivenessTracker, hasLivenessTrackerPassed,
  isLivenessChallengePassed, pickLivenessChallenge, updateLivenessTracker,
} from '../lib/liveness'
import { evaluateDetectionQuality } from '../lib/biometric-quality'
import BrandMark from './BrandMark'
import { useAudioCue } from '../hooks/useAudioCue'
import AppShell from './AppShell'

const MIN_SAMPLES = 3

const STEPS = [
  { id: 'capture', label: 'Capture', description: 'Automatic face capture with liveness' },
  { id: 'review', label: 'Review', description: 'Check the captured photo' },
  { id: 'details', label: 'Details', description: 'Enter employee information' },
  { id: 'complete', label: 'Done', description: 'Enrollment saved' },
]

export default function RegisterView({
  camera, persons, offices, onEnrollPerson, onDeletePerson,
  modelsReady, dataStatus, errorMessage, onBack,
}) {
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [officeId, setOfficeId] = useState(offices[0]?.id || '')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pendingDesc, setPendingDesc] = useState(null)
  const [faceFound, setFaceFound] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Starting camera…')
  const [toast, setToast] = useState(null)
  const [livenessChallenge, setLivenessChallenge] = useState(() => pickLivenessChallenge('any'))
  const [livenessPassed, setLivenessPassed] = useState(false)
  const [step, setStep] = useState('capture')
  const [lastSaved, setLastSaved] = useState(null)
  const [showRoster, setShowRoster] = useState(false)
  const playAudioCue = useAudioCue()

  const autoRef = useRef(null)
  const nameRef = useRef(null)
  const busyRef = useRef(false)
  const livenessTrackerRef = useRef(createLivenessTracker())

  const selectedOffice = offices.find(o => o.id === officeId) || null
  const existingPerson = useMemo(() => persons.find(p => p.employeeId === employeeId.trim()), [employeeId, persons])
  const stepIndex = STEPS.findIndex(s => s.id === step)

  const showToast = useCallback((msg, dur = 3500) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), dur)
  }, [])

  const stopDetect = useCallback(() => {
    if (autoRef.current) { window.clearInterval(autoRef.current); autoRef.current = null }
  }, [])

  const resetLiveness = useCallback(() => {
    livenessTrackerRef.current = createLivenessTracker()
    setLivenessChallenge(pickLivenessChallenge('any'))
    setLivenessPassed(false)
  }, [])

  const wait = useCallback(ms => new Promise(r => window.setTimeout(r, ms)), [])

  const drawBox = useCallback((det, sw, sh) => {
    const video = camera.videoRef.current
    const overlay = camera.overlayRef.current
    if (!overlay || !video || !det) return
    const w = video.videoWidth || 640
    const h = video.videoHeight || 480
    overlay.width = w; overlay.height = h
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    const { x, y, width: bw, height: bh } = det.detection.box
    const sx = sw ? w / sw : 1
    const sy = sh ? h / sh : 1
    const bx = x * sx, by = y * sy, bW = bw * sx, bH = bh * sy
    const c = Math.min(bW, bH) * 0.2
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3
    ;[[[bx, by + c], [bx, by], [bx + c, by]], [[bx + bW - c, by], [bx + bW, by], [bx + bW, by + c]],
      [[bx + bW, by + bH - c], [bx + bW, by + bH], [bx + bW - c, by + bH]], [[bx + c, by + bH], [bx, by + bH], [bx, by + bH - c]]
    ].forEach(pts => { ctx.beginPath(); pts.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) }); ctx.stroke() })
  }, [camera])

  const captureFace = useCallback(async () => {
    let best = null
    for (let i = 0; i < 3; i++) {
      const canvas = camera.captureImageData({ maxWidth: PREVIEW_MAX_DIMENSION, maxHeight: PREVIEW_MAX_DIMENSION })
      const result = await detectSingleDescriptor(canvas)
      if (result) {
        const q = evaluateDetectionQuality(result, canvas.width, canvas.height, canvas)
        if (!best || q.score > best.quality.score) best = { result, quality: q, previewUrl: canvas.toDataURL('image/jpeg', 0.85) }
        if (q.ok) break
      }
      if (i < 2) await wait(120)
    }
    if (!best) { showToast('No face detected. Try again.'); return }
    const { result, quality, previewUrl } = best
    if (!quality.ok) { setStatusMsg(quality.reason); showToast(quality.reason); return }
    setPendingDesc(result.descriptor)
    setPreviewUrl(previewUrl)
    camera.clearOverlay()
    setStatusMsg('Face captured. Review before continuing.')
    playAudioCue('notify')
    setStep('review')
  }, [camera, playAudioCue, showToast, wait])

  const startDetect = useCallback(() => {
    stopDetect(); resetLiveness(); setStep('capture')
    setStatusMsg('Align face with camera and complete liveness check…')
    autoRef.current = window.setInterval(async () => {
      if (busyRef.current || !camera.camOn || previewUrl || !modelsReady) return
      busyRef.current = true
      try {
        const canvas = camera.captureImageData({ maxWidth: DETECTION_MAX_DIMENSION, maxHeight: DETECTION_MAX_DIMENSION })
        const result = await detectSingleDescriptor(canvas)
        setFaceFound(Boolean(result))
        drawBox(result || null, canvas.width, canvas.height)
        if (!result) { setLivenessPassed(false); setStatusMsg('Scanning for face…'); return }
        const q = evaluateDetectionQuality(result, canvas.width, canvas.height, canvas)
        if (!q.ok) { setStatusMsg(q.reason); return }
        const liveness = analyzeLiveness(result)
        livenessTrackerRef.current = updateLivenessTracker(livenessTrackerRef.current, liveness)
        const passed = isLivenessChallengePassed(livenessChallenge.id, liveness) || hasLivenessTrackerPassed(livenessChallenge.id, livenessTrackerRef.current)
        if (!livenessPassed && passed) { setLivenessPassed(true); setStatusMsg('Liveness confirmed. Capturing…') }
        if (!livenessPassed && !passed) { setStatusMsg(`${livenessChallenge.label} to continue…`); return }
        stopDetect(); await captureFace()
      } catch { setStatusMsg('Scan interrupted') } finally { busyRef.current = false }
    }, 500)
  }, [camera, captureFace, drawBox, livenessChallenge.id, livenessPassed, modelsReady, previewUrl, resetLiveness, stopDetect])

  useEffect(() => { camera.start().then(() => startDetect()); return () => stopDetect() }, [camera, startDetect, stopDetect])

  const handleRegister = useCallback(async () => {
    if (!name.trim()) { showToast('Enter employee name'); nameRef.current?.focus(); return }
    if (!employeeId.trim()) { showToast('Enter employee ID'); return }
    if (!officeId) { showToast('Select assigned office'); return }
    if (!pendingDesc) { showToast('Face capture required'); return }
    const trimmed = name.trim()
    const existing = persons.find(p => p.employeeId === employeeId.trim())
    const sampleCount = (existing?.sampleCount ?? 0) + 1
    try {
      await onEnrollPerson({ name: trimmed, employeeId: employeeId.trim(), officeId, officeName: selectedOffice?.name || 'Unassigned' }, pendingDesc)
    } catch (err) { showToast(err.message || 'Failed to save'); setStep('details'); return }
    const remaining = Math.max(0, MIN_SAMPLES - sampleCount)
    setLastSaved({ name: trimmed, employeeId: employeeId.trim(), officeName: selectedOffice?.name || 'Unassigned', sampleCount, remaining })
    setStep('complete')
    setStatusMsg(remaining > 0 ? `${remaining} more sample(s) recommended.` : 'Enrollment saved.')
    playAudioCue('success')
    showToast(remaining > 0 ? `Sample ${sampleCount} saved. Add ${remaining} more for accuracy.` : `${trimmed} enrolled.`, 4000)
  }, [employeeId, name, officeId, onEnrollPerson, pendingDesc, persons, playAudioCue, selectedOffice, showToast])

  const handleRetake = useCallback(() => {
    setPendingDesc(null); setPreviewUrl(null); setFaceFound(false); setLastSaved(null); startDetect()
  }, [startDetect])

  const handleNewPerson = useCallback(() => {
    setName(''); setEmployeeId(''); setOfficeId(offices[0]?.id || '')
    setPendingDesc(null); setPreviewUrl(null); setFaceFound(false); setLastSaved(null); startDetect()
  }, [offices, startDetect])

  const handleDelete = useCallback(async (id, pName) => {
    if (!window.confirm(`Remove ${pName}?`)) return
    try { await onDeletePerson(id); showToast(`${pName} removed`) }
    catch (err) { showToast(err.message || 'Delete failed') }
  }, [onDeletePerson, showToast])

  return (
    <AppShell
      actions={(
        <>
          <button onClick={() => setShowRoster(v => !v)} type="button"
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-stone-50">
            {showRoster ? 'Hide' : 'Roster'} ({persons.length})
          </button>
        </>
      )}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 8, x: '-50%' }}
            className="fixed bottom-6 left-1/2 z-50 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Registration</p>
            <h1 className="font-display text-2xl text-ink">Employee Enrollment</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${step === 'capture' ? 'text-muted' : 'text-brand-dark'}`}>{statusMsg}</span>
            <button onClick={onBack} type="button"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink">
              ← Kiosk
            </button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 shrink-0">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < stepIndex ? 'bg-emerald-500 text-white' :
                i === stepIndex ? 'bg-brand text-white' :
                'bg-stone-200 text-muted'}`}>
                {i < stepIndex ? '✓' : i + 1}
              </div>
              <span className={`text-sm font-semibold ${i === stepIndex ? 'text-ink' : 'text-muted'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`h-px w-6 ${i < stepIndex ? 'bg-emerald-400' : 'bg-stone-200'}`} />}
            </div>
          ))}
        </div>

        {/* Main content: camera + form */}
        <div className={`grid gap-5 ${showRoster ? 'lg:grid-cols-[1fr_300px_260px]' : 'lg:grid-cols-[1fr_300px]'}`}>

          {/* Camera / preview / complete */}
          <div className="space-y-4">
            {(step === 'capture' || step === 'review') && (
              <div className="relative overflow-hidden rounded-2xl bg-stone-950 shadow-lg" style={{ aspectRatio: '4/3', minHeight: 280 }}>
                {step === 'capture' ? (
                  <>
                    <video ref={camera.videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
                    <canvas ref={camera.canvasRef} className="hidden" />
                    <canvas ref={camera.overlayRef} className="absolute inset-0 h-full w-full" />
                    {!camera.camOn && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-white">
                        <div className="text-4xl opacity-40">◈</div>
                        <p className="text-sm">{camera.camError || 'Camera offline'}</p>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
                      <span className={`rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-sm ${
                        faceFound ? 'bg-emerald-500/80 text-white' : 'bg-white/20 text-white'}`}>
                        {faceFound ? 'Face detected' : 'No face detected'}
                      </span>
                      <span className={`rounded-full px-4 py-1.5 text-xs font-semibold backdrop-blur-sm ${
                        livenessPassed ? 'bg-emerald-400/70 text-white' : 'bg-amber-500/70 text-white'}`}>
                        {livenessPassed ? '✓ Liveness passed' : livenessChallenge.label}
                      </span>
                    </div>
                  </>
                ) : (
                  previewUrl ? (
                    <img src={previewUrl} alt="Captured preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-stone-500">No preview</div>
                  )
                )}
              </div>
            )}

            {step === 'complete' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white text-xl">✓</div>
                <h2 className="font-display text-2xl text-ink">{lastSaved?.name}</h2>
                <div className="mt-3 space-y-1.5 text-sm text-muted">
                  <p><span className="font-semibold text-ink">ID:</span> {lastSaved?.employeeId}</p>
                  <p><span className="font-semibold text-ink">Office:</span> {lastSaved?.officeName}</p>
                  <p><span className="font-semibold text-ink">Samples:</span> {lastSaved?.sampleCount}</p>
                  {lastSaved?.remaining > 0 && (
                    <p className="text-amber-700">
                      Add {lastSaved.remaining} more sample(s) for better recognition accuracy.
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {step === 'review' && (
                <>
                  <button onClick={() => setStep('details')} type="button"
                    className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
                    Continue to Details →
                  </button>
                  <button onClick={handleRetake} type="button"
                    className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-ink">
                    Retake
                  </button>
                </>
              )}
              {step === 'complete' && (
                <>
                  <button onClick={handleNewPerson} type="button"
                    className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
                    New Employee
                  </button>
                  <button onClick={handleRetake} type="button"
                    className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-ink">
                    Add Another Sample
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Form panel */}
          <div className="space-y-4">
            {step === 'details' && (
              <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 space-y-4"
              >
                {/* Preview thumbnail */}
                {previewUrl && (
                  <img src={previewUrl} alt="Preview" className="w-full rounded-xl object-cover" style={{ maxHeight: 140 }} />
                )}

                <Field label="Full Name">
                  <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRegister() }}
                    placeholder="Enter full name"
                    className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition-all focus:border-brand/50 focus:ring-2 focus:ring-brand/10" />
                </Field>

                <Field label="Employee ID">
                  <input type="text" value={employeeId} onChange={e => setEmployeeId(e.target.value)}
                    placeholder="Enter employee ID"
                    className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition-all focus:border-brand/50 focus:ring-2 focus:ring-brand/10" />
                  {existingPerson && (
                    <p className="text-xs text-amber-700 mt-1">
                      Adding sample to {existingPerson.name} ({existingPerson.sampleCount} existing)
                    </p>
                  )}
                </Field>

                <Field label="Assigned Office">
                  <select value={officeId} onChange={e => setOfficeId(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition-all focus:border-brand/50 focus:ring-2 focus:ring-brand/10">
                    {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>

                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={handleRegister} type="button"
                    disabled={!pendingDesc || !name.trim() || !employeeId.trim() || !officeId}
                    className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40">
                    Save Enrollment
                  </button>
                  <button onClick={() => setStep('review')} type="button"
                    className="w-full rounded-full border border-black/10 bg-white py-3 text-sm font-semibold text-muted transition-colors hover:text-ink">
                    ← Back to Review
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'capture' && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Instructions</p>
                <p className="text-sm leading-relaxed text-muted">
                  Look directly at the camera. Complete the liveness check ({livenessChallenge.label.toLowerCase()}), then the system captures automatically.
                </p>
                {!modelsReady && (
                  <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    Loading recognition models…
                  </div>
                )}
                <div className="text-xs text-muted">{dataStatus}</div>
                {errorMessage && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{errorMessage}</div>}
              </div>
            )}

            {step === 'review' && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Review</p>
                <p className="text-sm leading-relaxed text-muted">
                  Check that the face is clear, well-lit, and centered. Poor samples reduce recognition accuracy. Retake if needed.
                </p>
              </div>
            )}
          </div>

          {/* Roster panel */}
          {showRoster && (
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col rounded-2xl border border-black/[0.06] bg-white/80 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Roster</p>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-dark">{persons.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-auto">
                {persons.length === 0 ? (
                  <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-black/10 text-xs text-muted">
                    No employees yet
                  </div>
                ) : (
                  persons.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-black/[0.05] bg-stone-50 px-3 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                        style={{ color: FACE_COLORS[i % FACE_COLORS.length], borderColor: FACE_COLORS[i % FACE_COLORS.length] }}>
                        {p.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-ink">{p.name}</p>
                        <p className="truncate text-[10px] text-muted">{p.employeeId} · {p.sampleCount ?? 0} samples</p>
                      </div>
                      <button onClick={() => handleDelete(p.id, p.name)} type="button"
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100">
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</span>
      {children}
    </label>
  )
}
