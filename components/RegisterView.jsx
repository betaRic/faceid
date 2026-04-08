'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectSingleDescriptor } from '../lib/face-api'
import { FACE_COLORS } from '../lib/config'
import { analyzeLiveness, isLivenessChallengePassed, pickLivenessChallenge } from '../lib/liveness'
import { evaluateDetectionQuality } from '../lib/biometric-quality'
import BrandMark from './BrandMark'
import { useAudioCue } from '../hooks/useAudioCue'

const MIN_SAMPLES = 3

const STEPS = [
  { id: 'capture', number: '1', title: 'Capture face', description: 'Use automatic face capture with liveness confirmation.' },
  { id: 'review', number: '2', title: 'Review photo', description: 'Retake the image if the preview is unclear.' },
  { id: 'details', number: '3', title: 'Employee details', description: 'Enter employee ID, name, and assigned office.' },
  { id: 'complete', number: '4', title: 'Enrollment saved', description: 'Continue with another sample or a new employee.' },
]

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
  const [step, setStep] = useState('capture')
  const [lastSavedSummary, setLastSavedSummary] = useState(null)
  const [showRoster, setShowRoster] = useState(false)
  const playAudioCue = useAudioCue()

  const autoRef = useRef(null)
  const nameRef = useRef(null)
  const busyRef = useRef(false)

  const selectedOffice = offices.find(office => office.id === officeId) || null
  const existingPerson = useMemo(
    () => persons.find(person => person.employeeId === employeeId.trim()),
    [employeeId, persons],
  )
  const existingSamples = existingPerson?.descriptors.length ?? 0

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

    const quality = evaluateDetectionQuality(faceResult, canvas.width, canvas.height)
    if (!quality.ok) {
      setStatusMsg(quality.reason)
      showToast(quality.reason)
      return
    }

    setPendingDesc(faceResult.descriptor)
    setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85))
    camera.clearOverlay()
    setStatusMsg('Face captured. Review the preview before continuing.')
    playAudioCue('notify')
    setStep('review')
  }, [camera, playAudioCue, showToast])

  const startDetect = useCallback(() => {
    stopDetect()
    resetLiveness()
    setStep('capture')
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

        const quality = evaluateDetectionQuality(result, canvas.width, canvas.height)
        if (!quality.ok) {
          setStatusMsg(quality.reason)
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

  const goToDetails = useCallback(() => {
    if (!previewUrl || !pendingDesc) {
      showToast('Capture a face first')
      return
    }

    setStep('details')
    setStatusMsg('Enter employee details to finish enrollment.')
    window.setTimeout(() => nameRef.current?.focus(), 100)
  }, [pendingDesc, previewUrl, showToast])

  const handleRegister = useCallback(async () => {
    if (!name.trim()) {
      showToast('Enter the employee name')
      nameRef.current?.focus()
      return
    }

    if (!employeeId.trim()) {
      showToast('Enter the employee ID')
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
      setStep('details')
      return
    }

    const remaining = Math.max(0, MIN_SAMPLES - sampleCount)
    setLastSavedSummary({
      name: trimmed,
      employeeId: employeeId.trim(),
      officeName: selectedOffice?.name || 'Unassigned',
      sampleCount,
      remaining,
    })
    setStep('complete')
    setStatusMsg(remaining > 0 ? `Enrollment saved. ${remaining} more sample(s) recommended.` : 'Enrollment saved successfully.')
    playAudioCue('success')
    showToast(
      remaining > 0
        ? `Sample ${sampleCount} saved for ${trimmed}. Add ${remaining} more for better accuracy.`
        : `${trimmed} enrolled under ${selectedOffice?.name || 'selected office'}.`,
      4000,
    )
  }, [employeeId, name, officeId, onEnrollPerson, pendingDesc, persons, playAudioCue, selectedOffice, showToast])

  const handleRetake = useCallback(() => {
    setPendingDesc(null)
    setPreviewUrl(null)
    setFaceFound(false)
    setLastSavedSummary(null)
    startDetect()
  }, [startDetect])

  const handleNewPerson = useCallback(() => {
    setName('')
    setEmployeeId('')
    setOfficeId(offices[0]?.id || '')
    setPendingDesc(null)
    setPreviewUrl(null)
    setFaceFound(false)
    setLastSavedSummary(null)
    startDetect()
  }, [offices, startDetect])

  const handleAddAnotherSample = useCallback(() => {
    setPendingDesc(null)
    setPreviewUrl(null)
    setFaceFound(false)
    setLastSavedSummary(null)
    startDetect()
  }, [startDetect])

  const handleDelete = useCallback(async (id, personName) => {
    if (!window.confirm(`Remove ${personName}?`)) return
    try {
      await onDeletePerson(id)
      showToast(`${personName} removed`)
    } catch (error) {
      showToast(error.message || 'Failed to delete person')
    }
  }, [onDeletePerson, showToast])

  const stepIndex = STEPS.findIndex(item => item.id === step)

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
            <BrandMark />
            <h1 className="mt-2 font-display text-3xl text-ink">Employee Enrollment Wizard</h1>
            <p className="mt-1 text-sm text-muted">Capture first, review second, then save employee details.</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
              onClick={() => setShowRoster(current => !current)}
              type="button"
            >
              {showRoster ? 'Hide roster' : 'Show roster'}
            </button>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm">
              {persons.length} enrolled
            </div>
          </div>
        </motion.section>

        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.38, ease: 'easeOut', delay: 0.05 }}
          className="rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur"
        >
          <div className="grid gap-3 lg:grid-cols-4">
            {STEPS.map((item, index) => (
              <WizardStep
                key={item.id}
                active={item.id === step}
                complete={index < stepIndex}
                description={item.description}
                number={item.number}
                title={item.title}
              />
            ))}
          </div>
        </motion.section>

        <div className={`grid gap-6 ${showRoster ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
            className="flex min-w-0 flex-col gap-4 rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Current step</span>
                <h2 className="mt-2 font-display text-3xl text-ink">{STEPS[stepIndex]?.title}</h2>
              </div>
              <div className="rounded-full bg-brand/10 px-4 py-2 text-sm font-semibold text-brand-dark">
                {statusMsg}
              </div>
            </div>

            {step === 'capture' ? (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_320px]">
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
                      <span className={`rounded-full px-4 py-2 text-sm font-semibold backdrop-blur ${faceFound ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/15 text-stone-100'}`}>
                        {faceFound ? 'Face detected' : 'No face'}
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

                <div className="grid gap-4">
                  <InfoCard
                    title="How this works"
                    text="The wizard waits for a detected face and a simple liveness action, then captures automatically. No manual photo button is needed."
                  />
                  <InfoCard
                    title="Camera note"
                    text={!modelsReady ? 'Loading recognition models before capture begins.' : 'Use the front camera in normal lighting. The user does not need to be perfectly still.'}
                    tone={!modelsReady ? 'warn' : 'default'}
                  />
                  <InfoCard
                    title="Storage"
                    text={errorMessage ? `${dataStatus}. ${errorMessage}` : dataStatus}
                    tone={errorMessage ? 'warn' : 'default'}
                  />
                </div>
              </section>
            ) : null}

            {step === 'review' ? (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-stone-100">
                  {previewUrl ? (
                    <img alt="Captured preview" className="h-full min-h-[420px] w-full object-cover" src={previewUrl} />
                  ) : (
                    <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-muted">
                      No preview available yet.
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  <InfoCard
                    title="Review"
                    text="Check if the face is clear, centered, and usable. If it looks weak, retake before saving details."
                  />
                  <div className="grid gap-3">
                    <button
                      className="inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                      onClick={goToDetails}
                      type="button"
                    >
                      Continue to details
                    </button>
                    <button
                      className="inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                      onClick={handleRetake}
                      type="button"
                    >
                      Retake capture
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {step === 'details' ? (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="grid gap-4 rounded-[1.75rem] border border-black/5 bg-stone-50 p-5">
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

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      className="inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                      onClick={() => setStep('review')}
                      type="button"
                    >
                      Back to review
                    </button>
                    <button
                      className="inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!pendingDesc || !name.trim() || !employeeId.trim() || !officeId}
                      onClick={handleRegister}
                      type="button"
                    >
                      Save enrollment
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  <section className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-white">
                    {previewUrl ? (
                      <img alt="Preview" className="h-auto w-full object-cover" src={previewUrl} />
                    ) : (
                      <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm text-muted">
                        Capture preview unavailable.
                      </div>
                    )}
                  </section>

                  {existingPerson ? (
                    <InfoCard
                      title="Existing employee"
                      text={`${existingPerson.name} currently has ${existingSamples} sample(s) under ${existingPerson.officeName}.`}
                    />
                  ) : (
                    <InfoCard
                      title="New employee"
                      text="This employee ID does not exist yet in the current roster."
                    />
                  )}
                </div>
              </section>
            ) : null}

            {step === 'complete' ? (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-6">
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
                    Enrollment saved
                  </span>
                  <h3 className="mt-4 font-display text-3xl text-ink">{lastSavedSummary?.name}</h3>
                  <div className="mt-3 space-y-2 text-sm text-muted">
                    <p><strong className="text-ink">Employee ID:</strong> {lastSavedSummary?.employeeId}</p>
                    <p><strong className="text-ink">Office:</strong> {lastSavedSummary?.officeName}</p>
                    <p><strong className="text-ink">Sample count:</strong> {lastSavedSummary?.sampleCount}</p>
                    <p><strong className="text-ink">Recommended remaining:</strong> {lastSavedSummary?.remaining}</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <button
                    className="inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                    onClick={handleAddAnotherSample}
                    type="button"
                  >
                    Add another sample
                  </button>
                  <button
                    className="inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                    onClick={handleNewPerson}
                    type="button"
                  >
                    Enroll new employee
                  </button>
                </div>
              </section>
            ) : null}
          </motion.section>

          {showRoster ? (
            <motion.aside
              animate={{ opacity: 1, x: 0 }}
              initial={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}
              className="flex min-h-0 flex-col rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur"
            >
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
            </motion.aside>
          ) : null}
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

function WizardStep({ active, complete, number, title, description }) {
  return (
    <div className={`rounded-[1.35rem] border px-4 py-4 ${complete ? 'border-emerald-200 bg-emerald-50' : active ? 'border-brand/30 bg-brand/8' : 'border-black/5 bg-stone-50'}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${complete ? 'bg-emerald-500 text-white' : active ? 'bg-brand text-white' : 'bg-white text-muted'}`}>
          {number}
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="text-xs leading-5 text-muted">{description}</div>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ title, text, tone = 'default' }) {
  const toneClass = tone === 'warn'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-black/5 bg-stone-50 text-muted'

  return (
    <section className={`rounded-[1.5rem] border p-4 ${toneClass}`}>
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">{title}</h3>
      <p className="mt-2 text-sm leading-7">{text}</p>
    </section>
  )
}
