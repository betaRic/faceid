'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectFaceBoxes, detectSingleDescriptor } from '../lib/biometrics/human'
import { DETECTION_MAX_DIMENSION, PREVIEW_MAX_DIMENSION, REGISTRATION_SCAN_INTERVAL_MS } from '../lib/config'
import {
  ENROLLMENT_BURST_CAPTURE_ATTEMPTS,
  ENROLLMENT_BURST_CAPTURE_INTERVAL_MS,
  ENROLLMENT_MIN_SAMPLES,
  ENROLLMENT_TARGET_BURST_SAMPLES,
  scoreEnrollmentCapture,
  selectEnrollmentBurstSamples,
  summarizeEnrollmentCaptureQuality,
} from '../lib/biometrics/enrollment-burst'
import {
  getOvalCaptureRegion,
  isFaceInsideCaptureOval,
  OVAL_CAPTURE_ASPECT_RATIO,
  selectOvalReadyFace,
} from '../lib/biometrics/oval-capture'
import { PERSON_APPROVAL_PENDING } from '../lib/person-approval'
import { useAudioCue } from '../hooks/useAudioCue'
import AppShell from './AppShell'

const VIEW_RESTORE_DELAY_MS = 80
const CAPTURE_METRIC_SAMPLE_STEP = 4
const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

const STEPS = [
  { id: 'capture', number: '1', title: 'Capture face', description: 'Automatic burst capture starts when the face is ready.' },
  { id: 'review', number: '2', title: 'Review photo', description: 'Retake the image if the preview is unclear.' },
  { id: 'details', number: '3', title: 'Employee details', description: 'Enter employee ID, name, and assigned office.' },
  { id: 'complete', number: '4', title: 'Submission complete', description: 'Continue with another sample or a new employee.' },
]

export default function RegisterView({
  camera,
  persons,
  offices,
  onEnrollPerson,
  modelsReady,
  workspaceReady,
  errorMessage,
  onBack,
}) {
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [officeId, setOfficeId] = useState(offices[0]?.id || '')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pendingDescriptors, setPendingDescriptors] = useState([])
  const [faceFound, setFaceFound] = useState(false)
  const [faceNeedsAlignment, setFaceNeedsAlignment] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Preparing biometric workspace...')
  const [toast, setToast] = useState(null)
  const [step, setStep] = useState('capture')
  const [lastSavedSummary, setLastSavedSummary] = useState(null)
  const [captureFeedback, setCaptureFeedback] = useState(null)
  const [burstSummary, setBurstSummary] = useState(null)
  const [savingEnrollment, setSavingEnrollment] = useState(false)
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
  const pendingSampleCount = pendingDescriptors.length
  const captureStateLabel = !modelsReady
    ? 'Loading recognition models'
    : faceFound
      ? 'Face detected'
      : faceNeedsAlignment
        ? 'Align inside oval'
        : 'Waiting for face'
  const captureStateClassName = faceFound
    ? 'bg-emerald-400/20 text-emerald-50 ring-1 ring-emerald-300/40'
    : faceNeedsAlignment
      ? 'bg-amber-300/16 text-amber-50 ring-1 ring-amber-300/35'
      : 'bg-white/15 text-stone-100 ring-1 ring-white/12'

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

  const captureFace = useCallback(async () => {
    captureAttemptRef.current = true
    const captures = []

    try {
      for (let attempt = 0; attempt < ENROLLMENT_BURST_CAPTURE_ATTEMPTS; attempt += 1) {
        if (attempt === 0) {
          setStatusMsg(`Capturing burst frames (1/${ENROLLMENT_BURST_CAPTURE_ATTEMPTS})...`)
        } else {
          setStatusMsg(`Capturing burst frames (${attempt + 1}/${ENROLLMENT_BURST_CAPTURE_ATTEMPTS})...`)
        }
        const canvas = camera.captureImageData({
          maxWidth: PREVIEW_MAX_DIMENSION,
          maxHeight: PREVIEW_MAX_DIMENSION,
        })
        const croppedCanvas = buildOvalCaptureCanvas(canvas)
        const faceResult = await detectSingleDescriptor(croppedCanvas)

        if (faceResult && isFaceInsideCaptureOval(faceResult.detection?.box, croppedCanvas.width, croppedCanvas.height)) {
          captures.push(buildBurstCaptureCandidate(croppedCanvas, faceResult, attempt))
        }

        if (attempt < ENROLLMENT_BURST_CAPTURE_ATTEMPTS - 1) await wait(ENROLLMENT_BURST_CAPTURE_INTERVAL_MS)
      }

      if (captures.length === 0) {
        setFaceFound(false)
        setStatusMsg('Scanning for face...')
        startDetect()
        showToast('No face detected. Reposition and try again.')
        return
      }

      const selectedCaptures = selectEnrollmentBurstSamples(captures, {
        maxSamples: ENROLLMENT_TARGET_BURST_SAMPLES,
      })
      const primaryCapture = selectedCaptures[0]
      const qualitySummary = summarizeEnrollmentCaptureQuality(primaryCapture.metrics)

      setPendingDescriptors(selectedCaptures.map(capture => capture.descriptor))
      setPreviewUrl(primaryCapture.previewUrl)
      setCaptureFeedback(qualitySummary)
      setBurstSummary({
        keptCount: selectedCaptures.length,
        detectedCount: captures.length,
      })
      camera.clearOverlay()
      setStatusMsg(
        qualitySummary.tone === 'warn'
          ? `Captured ${selectedCaptures.length} usable sample(s). Improve lighting if possible before saving.`
          : `Captured ${selectedCaptures.length} usable sample(s). Review the preview before continuing.`,
      )
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
        const croppedCanvas = buildOvalCaptureCanvas(canvas)
        const detections = await detectFaceBoxes(croppedCanvas)
        const result = selectOvalReadyFace(detections, croppedCanvas.width, croppedCanvas.height)
        setFaceFound(Boolean(result))
        setFaceNeedsAlignment(Boolean(!result && detections.length))

        if (!result) {
          setStatusMsg(detections.length ? 'Move inside the oval to start capture.' : 'Scanning for face...')
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
  }, [camera, captureFace, modelsReady, stopDetect])

  useEffect(() => {
    if (!workspaceReady || !modelsReady || !camera.camOn) return () => {}

    startDetect()
    return () => stopDetect()
  }, [camera.camOn, modelsReady, startDetect, stopDetect, workspaceReady])

  const goToDetails = useCallback(() => {
    if (!previewUrl || pendingSampleCount === 0) {
      showToast('Capture a face first')
      return
    }

    setStep('details')
    setStatusMsg('Enter employee details to finish enrollment.')
    window.setTimeout(() => nameRef.current?.focus(), 100)
  }, [pendingSampleCount, previewUrl, showToast])

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

    if (pendingSampleCount === 0) {
      showToast('Capture a face first')
      return
    }

    const trimmed = name.trim()
    const existing = persons.find(person => person.employeeId === employeeId.trim())
    let result = null

    try {
      setSavingEnrollment(true)
      setStatusMsg('Saving enrollment...')
      result = await onEnrollPerson(
        {
          name: trimmed,
          employeeId: employeeId.trim(),
          officeId,
          officeName: selectedOffice?.name || 'Unassigned',
          photoDataUrl: previewUrl,
        },
        pendingDescriptors,
      )
    } catch (error) {
      showToast(error.message || 'Failed to save enrollment')
      setStep('details')
      return
    } finally {
      setSavingEnrollment(false)
    }

    const savedSampleCount = Number(result?.savedSampleCount || pendingSampleCount || 1)
    const sampleCount = Number(result?.sampleCount || ((existing?.sampleCount ?? 0) + savedSampleCount))
    const remaining = Math.max(0, ENROLLMENT_MIN_SAMPLES - sampleCount)
    const approvalStatus = result?.approvalStatus || PERSON_APPROVAL_PENDING
    setLastSavedSummary({
      name: trimmed,
      employeeId: employeeId.trim(),
      officeName: selectedOffice?.name || 'Unassigned',
      sampleCount,
      savedSampleCount,
      remaining,
      approvalStatus,
    })
    setStep('complete')
    setStatusMsg(
      approvalStatus === PERSON_APPROVAL_PENDING
        ? `Enrollment submitted with ${savedSampleCount} sample(s) for admin approval.`
        : remaining > 0
          ? `Enrollment saved with ${savedSampleCount} sample(s). ${remaining} more sample(s) recommended.`
          : `Enrollment saved with ${savedSampleCount} sample(s).`,
    )
    playAudioCue('success')
    showToast(
      approvalStatus === PERSON_APPROVAL_PENDING
        ? `${trimmed} was submitted with ${savedSampleCount} sample(s) for approval. Attendance stays blocked until an admin approves the record.`
        : remaining > 0
          ? `${savedSampleCount} sample(s) saved for ${trimmed}. Add ${remaining} more for better accuracy.`
          : `${trimmed} enrolled with ${sampleCount} sample(s) under ${selectedOffice?.name || 'selected office'}.`,
      4000,
    )
  }, [employeeId, name, officeId, onEnrollPerson, pendingDescriptors, pendingSampleCount, persons, playAudioCue, selectedOffice, showToast])

  const resetForCapture = useCallback(async () => {
    stopDetect()
    setStep('capture')
    setPendingDescriptors([])
    setPreviewUrl(null)
    setFaceFound(false)
    setFaceNeedsAlignment(false)
    setLastSavedSummary(null)
    setCaptureFeedback(null)
    setBurstSummary(null)
    setStatusMsg('Preparing camera...')
    camera.clearOverlay()

    try {
      await wait(VIEW_RESTORE_DELAY_MS)
    } catch {
      setStatusMsg('Camera unavailable')
      return
    }
    startDetect()
  }, [camera, startDetect, stopDetect, wait])

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
      contentClassName="px-3 py-3 sm:px-5 lg:px-8 xl:overflow-hidden"
    >
      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[1.1rem] bg-navy-dark px-5 py-3 text-center text-sm font-medium text-white shadow-xl sm:w-auto sm:rounded-full">
          {toast}
        </div>
      ) : null}
      {savingEnrollment ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.8rem] border border-black/5 bg-white px-6 py-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy/10 text-navy-dark">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </div>
            <h2 className="mt-4 font-display text-2xl text-ink">
              Saving enrollment
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              Submitting the employee profile and biometric sample to the protected server route.
            </p>
          </div>
        </div>
      ) : null}

      {step === 'capture' ? (
        <div className="page-frame min-h-[calc(100dvh-8.25rem)] xl:min-h-[calc(100dvh-10.5rem)]">
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative min-h-[calc(100dvh-8.25rem)] overflow-hidden rounded-[1.4rem] border border-black/5 bg-black shadow-glow sm:rounded-[1.75rem] xl:min-h-[calc(100dvh-10.5rem)]"
          >
            <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top,rgba(17,133,108,0.18),transparent_40%),linear-gradient(180deg,rgba(3,10,9,0.92),rgba(8,13,12,0.96))]" />

            <div className="absolute inset-0 z-[2] flex items-center justify-center px-4 py-6 sm:px-6">
              <div
                className="relative w-[78vw] sm:w-[54vw]"
                style={{
                  aspectRatio: String(OVAL_CAPTURE_ASPECT_RATIO),
                  maxWidth: `min(430px, calc(min(72vh, 640px) * ${OVAL_CAPTURE_ASPECT_RATIO}))`,
                }}
              >
                <div
                  className={`absolute inset-0 shadow-[0_30px_80px_rgba(0,0,0,0.38)] transition-all duration-200 ${faceFound ? 'ring-2 ring-emerald-400/70 shadow-[0_0_0_1px_rgba(74,222,128,0.15),0_30px_80px_rgba(0,0,0,0.38),0_0_50px_rgba(16,185,129,0.24)]' : 'ring-1 ring-white/18'}`}
                  style={OVAL_FRAME_STYLE}
                />
                <div
                  className="absolute inset-[2px] overflow-hidden bg-black"
                  style={OVAL_FRAME_STYLE}
                >
                  <video ref={camera.setVideoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
                  <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(0,0,0,0.1)_54%,rgba(0,0,0,0.36)_100%)]" />
                </div>
              </div>
            </div>

            <div className="absolute left-3 top-3 z-[4] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 sm:left-5 sm:top-5">
              {onBack ? (
                <button
                  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-black/35 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/50"
                  onClick={onBack}
                  type="button"
                >
                  Back to kiosk
                </button>
              ) : null}
            </div>

            <div className="absolute right-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/14 bg-black/60 px-3.5 py-2 text-right shadow-lg backdrop-blur sm:right-5 sm:top-5 sm:rounded-[1.1rem] sm:px-5 sm:py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/90">Workspace status</div>
              <div className="mt-1 text-sm font-medium text-white/95 sm:text-base">{statusMsg}</div>
            </div>

            {!camera.camOn ? (
              <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
                <div className="text-5xl opacity-60">◈</div>
                <div className="text-sm font-medium">{camera.camError || 'Camera offline'}</div>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="absolute inset-x-3 bottom-3 z-[5] rounded-2xl bg-red-50/95 px-4 py-3 text-sm leading-7 text-warn shadow-lg backdrop-blur sm:inset-x-5 sm:bottom-5 sm:max-w-md">
                {errorMessage}
              </div>
            ) : null}

            <div className="absolute inset-x-0 bottom-5 z-[4] flex justify-center px-4">
              <span className={`rounded-full px-5 py-3 text-sm font-semibold backdrop-blur ${captureStateClassName}`}>
                {captureStateLabel}
              </span>
            </div>

          </motion.section>
        </div>
      ) : (
        <div className="page-frame flex min-h-[calc(100dvh-8.5rem)] flex-col gap-3 overflow-hidden xl:min-h-[calc(100dvh-10.5rem)]">
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="shrink-0 rounded-[1.5rem] border border-black/5 bg-white/80 p-3 shadow-glow backdrop-blur sm:p-4"
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
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden rounded-[1.5rem] border border-black/5 bg-white/80 p-3 shadow-glow backdrop-blur sm:p-4"
            >
            <div className="flex flex-col gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Enrollment workspace</span>
                <h2 className="mt-1 font-display text-xl text-ink sm:text-2xl">{STEPS[stepIndex]?.title}</h2>
              </div>
              <div className="max-w-full rounded-[1rem] bg-white px-4 py-2 text-sm font-semibold text-navy-dark shadow-sm sm:max-w-[22rem] sm:rounded-full">
                {statusMsg}
              </div>
            </div>

            {step === 'review' ? (
              <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-h-[18rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950 px-4 py-4 lg:min-h-0">
                  {previewUrl ? (
                    <img
                      alt="Captured preview"
                      className="max-h-[min(52vh,30rem)] w-full object-contain"
                      src={previewUrl}
                    />
                  ) : (
                    <div className="flex min-h-[18rem] items-center justify-center px-6 text-center text-sm text-stone-300 lg:min-h-0">
                      No preview available yet.
                    </div>
                  )}
                </div>

                <div className="grid content-start gap-3">
                  <div className="grid gap-3">
                    <button
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark sm:rounded-full"
                      disabled={savingEnrollment}
                      onClick={goToDetails}
                      type="button"
                    >
                      Continue to details
                    </button>
                    <button
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full"
                      disabled={savingEnrollment}
                      onClick={handleRetake}
                      type="button"
                    >
                      Retake capture
                    </button>
                  </div>
                  {burstSummary ? (
                    <InfoCard
                      title="Burst kept"
                      text={`${burstSummary.keptCount} distinct sample(s) selected from ${burstSummary.detectedCount} detected burst frame(s).`}
                      tone={captureFeedback?.tone || 'default'}
                    />
                  ) : null}
                  {captureFeedback ? (
                    <InfoCard
                      title={captureFeedback.title}
                      text={captureFeedback.text}
                      tone={captureFeedback.tone}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}

            {step === 'details' ? (
              <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid min-h-0 content-start gap-4 overflow-auto rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
                  <Field label="Full name">
                    <input
                      ref={nameRef}
                      className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm uppercase text-ink outline-none transition focus:border-navy"
                      onChange={event => setName(event.target.value.toUpperCase())}
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
                      className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
                      onChange={event => setEmployeeId(event.target.value)}
                      placeholder="Enter employee ID"
                      type="text"
                      value={employeeId}
                    />
                  </Field>

                  <Field label="Assigned office">
                    <select
                      className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
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
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full"
                      disabled={savingEnrollment}
                      onClick={() => setStep('review')}
                      type="button"
                    >
                      Back to review
                    </button>
                    <button
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-full"
                      disabled={savingEnrollment || pendingSampleCount === 0 || !name.trim() || !employeeId.trim() || !officeId}
                      onClick={handleRegister}
                      type="button"
                    >
                      {savingEnrollment ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Saving...
                        </>
                      ) : 'Save enrollment'}
                    </button>
                  </div>
                </div>

                <div className="grid min-h-0 content-start gap-3">
                  <section className="flex min-h-[15rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950 px-4 py-4">
                    {previewUrl ? (
                      <img alt="Preview" className="max-h-[min(38vh,24rem)] w-full object-contain" src={previewUrl} />
                    ) : (
                      <div className="flex min-h-[15rem] items-center justify-center px-6 text-center text-sm text-stone-300">
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
                  {burstSummary ? (
                    <InfoCard
                      title="Prepared samples"
                      text={`${burstSummary.keptCount} burst sample(s) are ready to save for this submission.`}
                      tone={captureFeedback?.tone || 'default'}
                    />
                  ) : null}
                  {captureFeedback ? (
                    <InfoCard
                      title={captureFeedback.title}
                      text={captureFeedback.text}
                      tone={captureFeedback.tone}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}

            {step === 'complete' ? (
              <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="overflow-auto rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
                  <span className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                    lastSavedSummary?.approvalStatus === PERSON_APPROVAL_PENDING
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {lastSavedSummary?.approvalStatus === PERSON_APPROVAL_PENDING ? 'Pending admin approval' : 'Enrollment saved'}
                  </span>
                  <h3 className="mt-4 font-display text-3xl text-ink">{lastSavedSummary?.name}</h3>
                  <div className="mt-3 space-y-2 text-sm text-muted">
                    <p><strong className="text-ink">Employee ID:</strong> {lastSavedSummary?.employeeId}</p>
                    <p><strong className="text-ink">Office:</strong> {lastSavedSummary?.officeName}</p>
                    <p><strong className="text-ink">Saved this burst:</strong> {lastSavedSummary?.savedSampleCount}</p>
                    <p><strong className="text-ink">Sample count:</strong> {lastSavedSummary?.sampleCount}</p>
                    <p><strong className="text-ink">Recommended remaining:</strong> {lastSavedSummary?.remaining}</p>
                  </div>
                </div>

                <div className="grid content-start gap-3">
                  {captureFeedback ? (
                    <InfoCard
                      title={captureFeedback.title}
                      text={captureFeedback.text}
                      tone={captureFeedback.tone}
                    />
                  ) : null}
                  <button
                    className="inline-flex w-full items-center justify-center rounded-[1rem] bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full"
                    disabled={savingEnrollment}
                    onClick={handleAddAnotherSample}
                    type="button"
                  >
                    Add another sample
                  </button>
                  <button
                    className="inline-flex w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full"
                    disabled={savingEnrollment}
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
      )}
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
    <div className={`rounded-[1.1rem] border px-3 py-3 ${complete ? 'border-emerald-200 bg-emerald-50' : active ? 'border-navy/30 bg-navy/8' : 'border-black/5 bg-stone-50'}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${complete ? 'bg-emerald-500 text-white' : active ? 'bg-navy text-white' : 'bg-white text-muted'}`}>
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

function buildBurstCaptureCandidate(canvas, faceResult, attempt) {
  const metrics = measureCaptureMetrics(canvas, faceResult)

  return {
    attempt,
    descriptor: Array.from(faceResult?.descriptor || []),
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    metrics,
    score: scoreEnrollmentCapture(metrics),
  }
}

function measureCaptureMetrics(canvas, faceResult) {
  const detectionBox = faceResult?.detection?.box
  const detectionScore = Number(faceResult?.detection?.score || 0)
  const frameWidth = Math.max(1, Number(canvas?.width || 0))
  const frameHeight = Math.max(1, Number(canvas?.height || 0))
  const frameArea = frameWidth * frameHeight
  const boxWidth = Math.max(1, Number(detectionBox?.width || frameWidth))
  const boxHeight = Math.max(1, Number(detectionBox?.height || frameHeight))
  const boxArea = boxWidth * boxHeight
  const centeredness = detectionBox
    ? 1 - (
      Math.hypot(
        (detectionBox.x + (detectionBox.width / 2)) - (frameWidth / 2),
        (detectionBox.y + (detectionBox.height / 2)) - (frameHeight / 2),
      ) / Math.max(1, Math.hypot(frameWidth / 2, frameHeight / 2))
    )
    : 0

  const ctx = canvas?.getContext?.('2d', { willReadFrequently: true })
  if (!ctx) {
    return {
      detectionScore,
      faceAreaRatio: boxArea / frameArea,
      centeredness: Math.max(0, centeredness),
      brightness: 0,
      contrast: 0,
      sharpness: 0,
    }
  }

  const left = clampMetric(Math.floor(Number(detectionBox?.x || 0)), 0, frameWidth - 1)
  const top = clampMetric(Math.floor(Number(detectionBox?.y || 0)), 0, frameHeight - 1)
  const right = clampMetric(Math.ceil(Number((detectionBox?.x || 0) + (detectionBox?.width || frameWidth))), left + 1, frameWidth)
  const bottom = clampMetric(Math.ceil(Number((detectionBox?.y || 0) + (detectionBox?.height || frameHeight))), top + 1, frameHeight)
  const sampleWidth = Math.max(1, right - left)
  const sampleHeight = Math.max(1, bottom - top)
  const imageData = ctx.getImageData(left, top, sampleWidth, sampleHeight).data

  let brightnessTotal = 0
  let brightnessSquaredTotal = 0
  let brightnessCount = 0
  let sharpnessTotal = 0
  let sharpnessCount = 0

  for (let y = 0; y < sampleHeight; y += CAPTURE_METRIC_SAMPLE_STEP) {
    for (let x = 0; x < sampleWidth; x += CAPTURE_METRIC_SAMPLE_STEP) {
      const index = ((y * sampleWidth) + x) * 4
      const luminance = rgbToLuminance(
        imageData[index],
        imageData[index + 1],
        imageData[index + 2],
      )

      brightnessTotal += luminance
      brightnessSquaredTotal += luminance * luminance
      brightnessCount += 1

      if (x + CAPTURE_METRIC_SAMPLE_STEP < sampleWidth) {
        const nextIndex = ((y * sampleWidth) + (x + CAPTURE_METRIC_SAMPLE_STEP)) * 4
        sharpnessTotal += Math.abs(luminance - rgbToLuminance(
          imageData[nextIndex],
          imageData[nextIndex + 1],
          imageData[nextIndex + 2],
        ))
        sharpnessCount += 1
      }

      if (y + CAPTURE_METRIC_SAMPLE_STEP < sampleHeight) {
        const nextIndex = (((y + CAPTURE_METRIC_SAMPLE_STEP) * sampleWidth) + x) * 4
        sharpnessTotal += Math.abs(luminance - rgbToLuminance(
          imageData[nextIndex],
          imageData[nextIndex + 1],
          imageData[nextIndex + 2],
        ))
        sharpnessCount += 1
      }
    }
  }

  const brightness = brightnessCount ? (brightnessTotal / brightnessCount) : 0
  const variance = brightnessCount
    ? Math.max(0, (brightnessSquaredTotal / brightnessCount) - (brightness * brightness))
    : 0

  return {
    detectionScore,
    faceAreaRatio: boxArea / frameArea,
    centeredness: Math.max(0, centeredness),
    brightness,
    contrast: Math.sqrt(variance),
    sharpness: sharpnessCount ? (sharpnessTotal / sharpnessCount) : 0,
  }
}

function rgbToLuminance(red, green, blue) {
  return (
    (0.2126 * Number(red || 0))
    + (0.7152 * Number(green || 0))
    + (0.0722 * Number(blue || 0))
  )
}

function clampMetric(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function buildOvalCaptureCanvas(sourceCanvas) {
  const region = getOvalCaptureRegion(sourceCanvas?.width, sourceCanvas?.height, OVAL_CAPTURE_ASPECT_RATIO)
  const canvas = document.createElement('canvas')
  canvas.width = region.width
  canvas.height = region.height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return sourceCanvas

  ctx.drawImage(
    sourceCanvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  )

  return canvas
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


