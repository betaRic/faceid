'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectFaceBoxes, detectSingleDescriptor } from '../lib/face-api'
import { DETECTION_MAX_DIMENSION, PREVIEW_MAX_DIMENSION, REGISTRATION_SCAN_INTERVAL_MS } from '../lib/config'
import BrandMark from './BrandMark'
import { useAudioCue } from '../hooks/useAudioCue'
import AppShell from './AppShell'

const MIN_SAMPLES = 3
const BURST_CAPTURE_ATTEMPTS = 7
const BURST_CAPTURE_INTERVAL_MS = 90

const STEPS = [
  { id: 'capture', number: '1', title: 'Capture face', description: 'Automatic burst capture starts when the face is ready.' },
  { id: 'review', number: '2', title: 'Review photo', description: 'Retake the image if the preview is unclear.' },
  { id: 'details', number: '3', title: 'Employee details', description: 'Enter employee ID, name, and assigned office.' },
  { id: 'complete', number: '4', title: 'Enrollment saved', description: 'Continue with another sample or a new employee.' },
]

export default function RegisterView({
  camera,
  persons,
  offices,
  onEnrollPerson,
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
  const [step, setStep] = useState('capture')
  const [lastSavedSummary, setLastSavedSummary] = useState(null)
  const playAudioCue = useAudioCue()

  const autoRef = useRef(null)
  const nameRef = useRef(null)
  const busyRef = useRef(false)
  const previewRef = useRef(null)
  const captureAttemptRef = useRef(false)

  const selectedOffice = offices.find(office => office.id === officeId) || null
  const existingPerson = useMemo(
    () => persons.find(person => person.employeeId === employeeId.trim()),
    [employeeId, persons],
  )
  const existingSamples = existingPerson?.sampleCount ?? 0

  const showToast = useCallback((message, duration = 3500) => {
    setToast(message)
    window.setTimeout(() => setToast(null), duration)
  }, [])

  useEffect(() => {
    previewRef.current = previewUrl
  }, [previewUrl])

  const stopDetect = useCallback(() => {
    if (autoRef.current) {
      window.clearInterval(autoRef.current)
      autoRef.current = null
    }
  }, [])

  const wait = useCallback(duration => new Promise(resolve => {
    window.setTimeout(resolve, duration)
  }), [])

  const drawBox = useCallback((det, sourceWidth, sourceHeight) => {
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

    if (!det) return

    const { x, y, width: rawWidth, height: rawHeight } = det.detection.box
    const boxX = x * scaleX
    const boxY = y * scaleY
    const boxWidth = rawWidth * scaleX
    const boxHeight = rawHeight * scaleY
    const corner = Math.min(boxWidth, boxHeight) * 0.2

    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 3

    ;[
      [[boxX, boxY + corner], [boxX, boxY], [boxX + corner, boxY]],
      [[boxX + boxWidth - corner, boxY], [boxX + boxWidth, boxY], [boxX + boxWidth, boxY + corner]],
      [[boxX + boxWidth, boxY + boxHeight - corner], [boxX + boxWidth, boxY + boxHeight], [boxX + boxWidth - corner, boxY + boxHeight]],
      [[boxX + corner, boxY + boxHeight], [boxX, boxY + boxHeight], [boxX, boxY + boxHeight - corner]],
    ].forEach(points => {
      ctx.beginPath()
      points.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    })
  }, [camera])

  const captureFace = useCallback(async () => {
    captureAttemptRef.current = true
    let bestCapture = null

    try {
      for (let attempt = 0; attempt < BURST_CAPTURE_ATTEMPTS; attempt += 1) {
        const canvas = camera.captureImageData({
          maxWidth: PREVIEW_MAX_DIMENSION,
          maxHeight: PREVIEW_MAX_DIMENSION,
        })
        const faceResult = await detectSingleDescriptor(canvas)

        if (faceResult) {
          const previewUrl = canvas.toDataURL('image/jpeg', 0.85)
          const detectionBox = faceResult.detection?.box
          const detectionScore = Number(faceResult.detection?.score || 0)
          const frameArea = Math.max(1, canvas.width * canvas.height)
          const boxArea = detectionBox ? detectionBox.width * detectionBox.height : 0
          const centeredness = detectionBox
            ? 1 - (
              Math.hypot(
                (detectionBox.x + (detectionBox.width / 2)) - (canvas.width / 2),
                (detectionBox.y + (detectionBox.height / 2)) - (canvas.height / 2),
              ) / Math.hypot(canvas.width / 2, canvas.height / 2)
            )
            : 0
          const score = detectionScore + (boxArea / frameArea) + Math.max(0, centeredness)

          if (!bestCapture || score > bestCapture.score) {
            bestCapture = {
              faceResult,
              previewUrl,
              score,
            }
          }
        }

        if (attempt < BURST_CAPTURE_ATTEMPTS - 1) await wait(BURST_CAPTURE_INTERVAL_MS)
      }

      if (!bestCapture) {
        setFaceFound(false)
        setStatusMsg('Scanning for face...')
        startDetect()
        showToast('No face detected. Reposition and try again.')
        return
      }

      const { faceResult, previewUrl } = bestCapture

      setPendingDesc(faceResult.descriptor)
      setPreviewUrl(previewUrl)
      camera.clearOverlay()
      setStatusMsg('Best frame captured. Review the preview before continuing.')
      playAudioCue('notify')
      setStep('review')
    } finally {
      captureAttemptRef.current = false
    }
  }, [camera, playAudioCue, showToast, wait])

  const startDetect = useCallback(() => {
    stopDetect()
    captureAttemptRef.current = false
    setStep('capture')
    setStatusMsg(modelsReady ? 'Align face with the camera.' : 'Loading recognition models...')

    const runDetection = async () => {
      if (busyRef.current || !camera.camOn || previewRef.current || !modelsReady || captureAttemptRef.current) return

      busyRef.current = true
      try {
        const canvas = camera.captureImageData({
          maxWidth: DETECTION_MAX_DIMENSION,
          maxHeight: DETECTION_MAX_DIMENSION,
        })
        const detections = await detectFaceBoxes(canvas)
        const result = detections[0] || null
        setFaceFound(Boolean(result))
        drawBox(result ? { detection: { box: result.box || result.detection?.box } } : null, canvas.width, canvas.height)

        if (!result) {
          setStatusMsg('Scanning for face...')
          return
        }

        stopDetect()
        setStatusMsg('Capturing burst frames...')
        await captureFace()
      } catch {
        setStatusMsg('Camera scan interrupted')
      } finally {
        busyRef.current = false
      }
    }

    if (!modelsReady) return

    runDetection()
    autoRef.current = window.setInterval(runDetection, REGISTRATION_SCAN_INTERVAL_MS)
  }, [camera, captureFace, drawBox, modelsReady, stopDetect])

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
      showToast('Capture a face first')
      return
    }

    const trimmed = name.trim()
    const existing = persons.find(person => person.employeeId === employeeId.trim())
    const sampleCount = (existing?.sampleCount ?? 0) + 1

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

  const resetForCapture = useCallback(async () => {
    setPendingDesc(null)
    setPreviewUrl(null)
    setFaceFound(false)
    setLastSavedSummary(null)
    camera.clearOverlay()
    try {
      await camera.start()
    } catch {
      setStatusMsg('Camera unavailable')
      return
    }
    startDetect()
  }, [camera, startDetect])

  const handleRetake = useCallback(() => {
    resetForCapture()
  }, [resetForCapture])

  const handleNewPerson = useCallback(() => {
    setName('')
    setEmployeeId('')
    setOfficeId(offices[0]?.id || '')
    resetForCapture()
  }, [offices, resetForCapture])

  const handleAddAnotherSample = useCallback(() => {
    resetForCapture()
  }, [resetForCapture])

  const stepIndex = STEPS.findIndex(item => item.id === step)

  return (
    <AppShell
      actions={(
        <div className="w-full rounded-full bg-white px-4 py-2.5 text-center text-sm font-semibold text-ink shadow-sm sm:w-auto">
          {persons.length} enrolled
        </div>
      )}
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
    >
      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[1.1rem] bg-brand-dark px-5 py-3 text-center text-sm font-medium text-white shadow-xl sm:w-auto sm:rounded-full">
          {toast}
        </div>
      ) : null}

      <div className="page-frame flex flex-col gap-4 xl:min-h-[calc(100dvh-10.75rem)]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="rounded-[1.5rem] border border-black/5 bg-white/80 p-3 shadow-glow backdrop-blur sm:p-4"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

        <div className="grid min-h-0 flex-1 gap-4">
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
            className="flex min-h-0 min-w-0 flex-col gap-4 rounded-[1.5rem] border border-black/5 bg-white/80 p-3 shadow-glow backdrop-blur sm:p-4"
          >
            <div className="flex flex-col gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Enrollment workspace</span>
                <h2 className="mt-1 font-display text-xl text-ink sm:text-2xl">{STEPS[stepIndex]?.title}</h2>
              </div>
              <div className="max-w-full rounded-[1rem] bg-white px-4 py-2 text-sm font-semibold text-brand-dark shadow-sm sm:max-w-[22rem] sm:rounded-full">
                {statusMsg}
              </div>
            </div>

            {step === 'capture' ? (
              <section className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_300px]">
                <div className="min-h-0 overflow-hidden rounded-[1.6rem] border border-black/5 bg-black shadow-glow">
                  <div className="relative h-full min-h-[280px] sm:min-h-[320px] xl:min-h-[460px]">
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

                    <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
                      <span className={`rounded-full px-4 py-2 text-sm font-semibold backdrop-blur ${faceFound ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/15 text-stone-100'}`}>
                        {faceFound ? 'Face ready' : 'Waiting for face'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <InfoCard
                    title="Camera"
                    text={!modelsReady ? 'Loading recognition models before capture begins.' : 'Keep the face centered while the system selects the best frame from the burst.'}
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
              <section className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-h-0 overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-100">
                  {previewUrl ? (
                    <img alt="Captured preview" className="h-full min-h-[320px] w-full object-cover xl:min-h-[460px]" src={previewUrl} />
                  ) : (
                    <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-muted xl:min-h-[460px]">
                      No preview available yet.
                    </div>
                  )}
                </div>

                <div className="grid content-start gap-3">
                  <div className="grid gap-3">
                    <button
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark sm:rounded-full"
                      onClick={goToDetails}
                      type="button"
                    >
                      Continue to details
                    </button>
                    <button
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 sm:rounded-full"
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
              <section className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid content-start gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
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
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 sm:rounded-full"
                      onClick={() => setStep('review')}
                      type="button"
                    >
                      Back to review
                    </button>
                    <button
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-full"
                      disabled={!pendingDesc || !name.trim() || !employeeId.trim() || !officeId}
                      onClick={handleRegister}
                      type="button"
                    >
                      Save enrollment
                    </button>
                  </div>
                </div>

                <div className="grid content-start gap-3">
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
                      title="Existing record"
                      text={`${existingPerson.name} currently has ${existingSamples} sample(s) under ${existingPerson.officeName}.`}
                    />
                  ) : (
                    <InfoCard
                      title="Record"
                      text="New employee."
                    />
                  )}
                </div>
              </section>
            ) : null}

            {step === 'complete' ? (
              <section className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
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

                <div className="grid content-start gap-3">
                  <button
                    className="inline-flex w-full items-center justify-center rounded-[1rem] bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark sm:rounded-full"
                    onClick={handleAddAnotherSample}
                    type="button"
                  >
                    Add another sample
                  </button>
                  <button
                    className="inline-flex w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 sm:rounded-full"
                    onClick={handleNewPerson}
                    type="button"
                  >
                    Enroll new employee
                  </button>
                </div>
              </section>
            ) : null}
          </motion.section>
        </div>
      </div>
    </AppShell>
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
    <div className={`rounded-[1.1rem] border px-3 py-3 ${complete ? 'border-emerald-200 bg-emerald-50' : active ? 'border-brand/30 bg-brand/8' : 'border-black/5 bg-stone-50'}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${complete ? 'bg-emerald-500 text-white' : active ? 'bg-brand text-white' : 'bg-white text-muted'}`}>
          {number}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="hidden text-xs leading-5 text-muted sm:block">{description}</div>
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
