'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { detectSingleDescriptor } from '../lib/face-api'
import { FACE_COLORS } from '../lib/config'
import { analyzeLiveness, isLivenessChallengePassed, pickLivenessChallenge } from '../lib/liveness'

const MIN_SAMPLES = 3

export default function RegisterView({
  camera,
  persons,
  offices,
  onEnrollPerson,
  onDeletePerson,
  modelsReady,
  dataStatus,
  errorMessage,
  onBack,
}) {
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [officeId, setOfficeId] = useState(offices[0]?.id || '')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pendingDesc, setPendingDesc] = useState(null)
  const [faceFound, setFaceFound] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Starting camera...')
  const [toast, setToast] = useState(null)
  const [livenessChallenge, setLivenessChallenge] = useState(() => pickLivenessChallenge())
  const [livenessPassed, setLivenessPassed] = useState(false)

  const autoRef = useRef(null)
  const nameRef = useRef(null)
  const busyRef = useRef(false)

  const selectedOffice = offices.find(office => office.id === officeId) || null

  const showToast = useCallback((message, duration = 3500) => {
    setToast(message)
    window.setTimeout(() => setToast(null), duration)
  }, [])

  const stopDetect = useCallback(() => {
    if (autoRef.current) {
      window.clearInterval(autoRef.current)
      autoRef.current = null
    }
  }, [])

  const resetLiveness = useCallback(() => {
    setLivenessChallenge(pickLivenessChallenge())
    setLivenessPassed(false)
  }, [])

  const drawBox = useCallback(det => {
    const video = camera.videoRef.current
    const overlay = camera.overlayRef.current

    if (!overlay || !video) return

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    overlay.width = width
    overlay.height = height

    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    if (!det) return

    const { x, y, width: boxWidth, height: boxHeight } = det.detection.box
    const corner = Math.min(boxWidth, boxHeight) * 0.2

    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 3

    ;[
      [[x, y + corner], [x, y], [x + corner, y]],
      [[x + boxWidth - corner, y], [x + boxWidth, y], [x + boxWidth, y + corner]],
      [[x + boxWidth, y + boxHeight - corner], [x + boxWidth, y + boxHeight], [x + boxWidth - corner, y + boxHeight]],
      [[x + corner, y + boxHeight], [x, y + boxHeight], [x, y + boxHeight - corner]],
    ].forEach(points => {
      ctx.beginPath()
      points.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    })
  }, [camera])

  const captureFace = useCallback(async result => {
    const canvas = camera.captureImageData()
    const faceResult = result || await detectSingleDescriptor(canvas)

    if (!faceResult) {
      showToast('No face detected. Reposition and try again.')
      return
    }

    setPendingDesc(faceResult.descriptor)
    setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85))
    camera.clearOverlay()
    setStatusMsg('Face captured automatically. Enter employee name and assigned office.')
    window.setTimeout(() => nameRef.current?.focus(), 100)
  }, [camera, showToast])

  const startDetect = useCallback(() => {
    stopDetect()
    resetLiveness()
    setStatusMsg('Align face with camera and complete the liveness check...')

    autoRef.current = window.setInterval(async () => {
      if (busyRef.current || !camera.camOn || previewUrl || !modelsReady) return

      try {
        const canvas = camera.captureImageData()
        const result = await detectSingleDescriptor(canvas)
        setFaceFound(Boolean(result))
        drawBox(result || null)

        if (!result) {
          setLivenessPassed(false)
          setStatusMsg('Scanning for face...')
          return
        }

        const liveness = analyzeLiveness(result)
        const passedChallenge = isLivenessChallengePassed(livenessChallenge.id, liveness)

        if (!livenessPassed && passedChallenge) {
          setLivenessPassed(true)
          setStatusMsg('Liveness confirmed. Capturing face...')
        }

        if (!livenessPassed && !passedChallenge) {
          setStatusMsg(`${livenessChallenge.label} to continue...`)
          return
        }

        busyRef.current = true
        stopDetect()
        await captureFace(result)
        busyRef.current = false
      } catch {
        setStatusMsg('Camera scan interrupted')
      }
    }, 500)
  }, [camera, captureFace, drawBox, livenessChallenge.id, livenessPassed, modelsReady, previewUrl, resetLiveness, stopDetect])

  useEffect(() => {
    camera.start().then(() => startDetect())
    return () => stopDetect()
  }, [camera, startDetect, stopDetect])

  const handleRegister = useCallback(async () => {
    if (!name.trim()) {
      showToast('Enter the employee name')
      nameRef.current?.focus()
      return
    }

    if (!officeId) {
      showToast('Select the assigned office')
      return
    }

    if (!pendingDesc) {
      showToast('Automatic face capture is required')
      return
    }

    const trimmed = name.trim()
    const existing = persons.find(person => person.employeeId === employeeId.trim())
    const sampleCount = (existing?.descriptors.length ?? 0) + 1

    if (!employeeId.trim()) {
      showToast('Enter the employee ID')
      return
    }

    try {
      await onEnrollPerson(
        {
          name: trimmed,
          employeeId: employeeId.trim(),
          officeId,
          officeName: selectedOffice?.name || 'Unassigned',
        },
        pendingDesc,
      )
    } catch (error) {
      showToast(error.message || 'Failed to save enrollment')
      startDetect()
      return
    }

    const remaining = MIN_SAMPLES - sampleCount
    if (remaining > 0) showToast(`Sample ${sampleCount} saved for ${trimmed}. Add ${remaining} more for better accuracy.`)
    else showToast(`${trimmed} enrolled under ${selectedOffice?.name || 'selected office'}.`, 4000)

    setPendingDesc(null)
    setPreviewUrl(null)
    setFaceFound(false)
    startDetect()
  }, [employeeId, name, officeId, onEnrollPerson, pendingDesc, persons, selectedOffice, showToast, startDetect])

  const handleRetake = useCallback(() => {
    setPendingDesc(null)
    setPreviewUrl(null)
    setFaceFound(false)
    startDetect()
  }, [startDetect])

  const handleNewPerson = useCallback(() => {
    setName('')
    setEmployeeId('')
    setOfficeId(offices[0]?.id || '')
    setPendingDesc(null)
    setPreviewUrl(null)
    setFaceFound(false)
    startDetect()
    nameRef.current?.focus()
  }, [offices, startDetect])

  const handleDelete = useCallback(async (id, personName) => {
    if (!window.confirm(`Remove ${personName}?`)) return
    try {
      await onDeletePerson(id)
      showToast(`${personName} removed`)
    } catch (error) {
      showToast(error.message || 'Failed to delete person')
    }
  }, [onDeletePerson, showToast])

  const existingPerson = persons.find(person => person.employeeId === employeeId.trim())
  const existingSamples = existingPerson?.descriptors.length ?? 0

  return (
    <main className="min-h-screen bg-hero-wash px-4 py-6 sm:px-6 lg:px-8">
      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-dark px-5 py-3 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex flex-wrap items-center gap-4 rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur"
        >
          <button
            className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
            onClick={onBack}
            type="button"
          >
            Back to kiosk
          </button>
          <div className="min-w-0">
            <div className="inline-flex rounded-full bg-brand/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">
              DILG
            </div>
            <h1 className="mt-2 font-display text-3xl text-ink">Employee Enrollment</h1>
          </div>
          <div className="ml-auto rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm">
            {persons.length} enrolled
          </div>
        </motion.section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_400px]">
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.06 }}
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

                <div className="absolute right-4 top-4 z-10">
                  <span className={`rounded-full px-4 py-2 text-sm font-semibold backdrop-blur ${previewUrl || faceFound ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/15 text-stone-100'}`}>
                    {previewUrl ? 'Captured' : faceFound ? 'Detecting' : 'No face'}
                  </span>
                </div>

                <div className="absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-2 px-4">
                  <span className="rounded-full bg-brand/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                    Automatic capture only
                  </span>
                  <span className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] backdrop-blur ${livenessPassed ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/15 text-stone-100'}`}>
                    {livenessPassed ? 'Liveness passed' : livenessChallenge.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur">
              <p className="text-sm font-medium text-ink">{statusMsg}</p>
            </div>

            {!modelsReady ? (
              <div className="rounded-[1.6rem] border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-800 shadow-glow">
                Loading recognition models...
              </div>
            ) : null}

            <div className="rounded-[1.6rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Storage</span>
                <span className="text-sm font-semibold text-ink">{dataStatus}</span>
              </div>
              {errorMessage ? <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-warn">{errorMessage}</div> : null}

              <div className="mt-5 grid gap-3">
                <Step active={!previewUrl && camera.camOn} done={Boolean(previewUrl)} number="1" text="Face camera for automatic capture" />
                <Step active={Boolean(previewUrl) && !name.trim()} done={Boolean(previewUrl) && Boolean(name.trim())} number="2" text="Enter employee name and office" />
                <Step active={Boolean(previewUrl) && Boolean(name.trim())} done={false} number="3" text={`Enroll at least ${MIN_SAMPLES} samples`} />
              </div>

              {previewUrl ? (
                <button
                  className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                  onClick={handleRetake}
                  type="button"
                >
                  Retake face
                </button>
              ) : (
                <div className="mt-5 rounded-2xl bg-brand/8 px-4 py-3 text-center text-sm text-brand-dark">
                  Capture is automatic right after face detection and liveness confirmation.
                </div>
              )}
            </div>
          </motion.section>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
            className="flex min-w-0 flex-col gap-4"
          >
            <section className="rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Capture preview</span>
              <div className="mt-4 overflow-hidden rounded-[1.35rem] border border-black/5 bg-stone-50">
                {previewUrl ? (
                  <img alt="Preview" className="h-auto w-full object-cover" src={previewUrl} />
                ) : (
                  <div className="flex min-h-[240px] items-center justify-center px-6 text-center text-sm leading-7 text-muted">
                    Look at the camera naturally. The system captures automatically after face detection and liveness confirmation.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Employee details</span>
              <div className="mt-4 grid gap-4">
                <Field label="Full name">
                  <input
                    ref={nameRef}
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    onChange={event => setName(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') handleRegister()
                    }}
                    placeholder="Enter full name"
                    type="text"
                    value={name}
                  />
                </Field>

                <Field label="Employee ID">
                  <input
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    onChange={event => setEmployeeId(event.target.value)}
                    placeholder="Enter employee ID"
                    type="text"
                    value={employeeId}
                  />
                </Field>

                <Field label="Assigned office">
                  <select
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                    onChange={event => setOfficeId(event.target.value)}
                    value={officeId}
                  >
                    {offices.map(office => (
                      <option key={office.id} value={office.id}>{office.name}</option>
                    ))}
                  </select>
                </Field>

                {name.trim() && existingPerson ? (
                  <div className="rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                    <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (existingSamples / MIN_SAMPLES) * 100)}%`,
                          background: existingSamples >= MIN_SAMPLES ? '#22c55e' : '#f59e0b',
                        }}
                      />
                    </div>
                    <div className="mt-3 text-sm leading-7 text-muted">
                      {existingSamples} / {MIN_SAMPLES} samples
                      {existingPerson.employeeId ? ` • ID: ${existingPerson.employeeId}` : ''}
                      {existingPerson.officeName ? ` • Current office: ${existingPerson.officeName}` : ''}
                    </div>
                  </div>
                ) : null}

                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!pendingDesc || !name.trim() || !employeeId.trim() || !officeId}
                  onClick={handleRegister}
                  type="button"
                >
                  Enroll employee
                </button>

                {name.trim() && existingPerson ? (
                  <button
                    className="inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                    onClick={handleNewPerson}
                    type="button"
                  >
                    Clear form
                  </button>
                ) : null}
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="font-display text-2xl text-ink">Enrolled employees</h2>
                <span className="rounded-full bg-brand/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">
                  {persons.length}
                </span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
                {persons.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted">
                    No employees enrolled yet.
                  </div>
                ) : (
                  persons.map((person, index) => (
                    <div key={person.id} className="flex items-center gap-3 rounded-[1.25rem] border border-black/5 bg-white px-4 py-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold"
                        style={{
                          color: FACE_COLORS[index % FACE_COLORS.length],
                          borderColor: FACE_COLORS[index % FACE_COLORS.length],
                        }}
                      >
                        {person.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{person.name}</div>
                        <div className="truncate text-xs uppercase tracking-[0.12em] text-muted">{person.employeeId} • {person.officeName}</div>
                        <div className="text-xs text-muted">
                          <span style={{ color: person.descriptors.length >= MIN_SAMPLES ? '#15803d' : '#d97706' }}>
                            {person.descriptors.length} sample{person.descriptors.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <button
                        className="inline-flex items-center justify-center rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-700 transition hover:bg-red-100"
                        onClick={() => handleDelete(person.id, person.name)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </motion.aside>
        </div>
      </div>
    </main>
  )
}

function Field({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      {children}
    </label>
  )
}

function Step({ active, done, number, text }) {
  return (
    <div className={`flex items-center gap-3 rounded-[1.1rem] border px-4 py-3 text-sm ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : active ? 'border-brand/25 bg-brand/8 text-brand-dark' : 'border-black/5 bg-white text-muted'}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-brand text-white' : 'bg-stone-100 text-muted'}`}>
        {number}
      </span>
      <span>{text}</span>
    </div>
  )
}
