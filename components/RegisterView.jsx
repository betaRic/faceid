'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PERSON_APPROVAL_PENDING } from '../lib/person-approval'
import { OVAL_CAPTURE_ASPECT_RATIO } from '../lib/biometrics/oval-capture'
import { ENROLLMENT_MIN_SAMPLES } from '../lib/biometrics/enrollment-burst'
import { DUPLICATE_FACE_THRESHOLD, DISTANCE_THRESHOLD_KIOSK } from '../lib/config'
import { useAudioCue } from '../hooks/useAudioCue'
import { useEnrollmentCapture, CAPTURE_PHASES, classifyPose } from '../hooks/useEnrollmentCapture'
import { findClosestPerson } from '../lib/biometrics/descriptor-utils'
import AppShell from './AppShell'

const STEPS = [
  { id: 'capture', number: '1', title: 'Capture face', description: '3-angle guided capture.' },
  { id: 'review', number: '2', title: 'Review photo', description: 'Retake if unclear.' },
  { id: 'details', number: '3', title: 'Employee details', description: 'ID, name, office.' },
  { id: 'complete', number: '4', title: 'Complete', description: 'Add samples or enroll another.' },
]

const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

function PoseArcIndicator({ yaw, poseOk, phaseType, sideAYw }) {
  if (phaseType === null || phaseType === undefined) return null

  const isCenterPhase = phaseType === 'center'

  let leftFill = 0
  let rightFill = 0

  if (yaw !== null) {
    if (isCenterPhase) {
      const deviation = Math.min(1, Math.abs(yaw) / 0.25) * 0.5
      leftFill = deviation
      rightFill = deviation
    } else {
      if (yaw > 0) {
        rightFill = Math.min(1, (yaw - 0.08) / 0.20)
      } else {
        leftFill = Math.min(1, (-yaw - 0.08) / 0.20)
      }
    }
  }

  const color = poseOk
    ? 'bg-emerald-400'
    : yaw !== null && Math.abs(yaw) > 0.06
      ? 'bg-amber-400'
      : 'bg-white/30'

  return (
    <div className="flex items-center gap-1">
      <div className="h-1 w-8 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-all duration-150 ${color}`}
          style={{ width: `${leftFill * 100}%`, marginLeft: 'auto' }}
        />
      </div>
      <div className={`h-2 w-2 rounded-full border transition-all duration-150 ${
        poseOk ? 'border-emerald-400 bg-emerald-400' : 'border-white/50 bg-transparent'
      }`} />
      <div className="h-1 w-8 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-all duration-150 ${color}`}
          style={{ width: `${rightFill * 100}%` }}
        />
      </div>
    </div>
  )
}

function PhaseIndicator({ capturePhase, phaseProgress, poseOk, currentYaw, statusMsg }) {
  if (capturePhase < 0) return null
  const phase = CAPTURE_PHASES[capturePhase]

  return (
    <div className="absolute inset-x-0 bottom-4 z-[5] flex justify-center px-4">
      <div className="flex items-center gap-4 rounded-full border border-white/20 bg-black/60 px-5 py-2 backdrop-blur">
        <div className="flex items-center gap-1.5">
          {CAPTURE_PHASES.map((p, i) => (
            <div key={p.id} className="flex items-center">
              <div
                className={`h-2 w-2 rounded-full transition-all ${
                  i < capturePhase
                    ? 'bg-emerald-400'
                    : i === capturePhase
                      ? poseOk
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                      : 'bg-white/30'
                }`}
              />
              {i < CAPTURE_PHASES.length - 1 && (
                <div className={`w-2 h-px ${i < capturePhase ? 'bg-emerald-400' : 'bg-white/30'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="h-4 w-px bg-white/20" />
        <PoseArcIndicator
          yaw={currentYaw}
          poseOk={poseOk}
          phaseType={phase.poseType}
          sideAYw={null}
        />
        <div className="h-4 w-px bg-white/20" />
        <span className={`text-sm font-medium ${poseOk ? 'text-emerald-300' : 'text-white/80'}`}>
          {statusMsg}
        </span>
      </div>
    </div>
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
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${complete ? 'bg-emerald-500 text-white' : active ? 'bg-navy text-white' : 'bg-white text-muted'}`}>
          {complete ? '✓' : number}
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
  const cls = tone === 'warn'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-black/5 bg-stone-50 text-muted'
  return (
    <section className={`rounded-[1.5rem] border p-4 ${cls}`}>
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">{title}</h3>
      <p className="mt-2 text-sm leading-7">{text}</p>
    </section>
  )
}

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
  const [employeeIdError, setEmployeeIdError] = useState('')
  const [officeId, setOfficeId] = useState(offices[0]?.id || '')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pendingDescriptors, setPendingDescriptors] = useState([])
  const [step, setStep] = useState('capture')
  const [captureFeedback, setCaptureFeedback] = useState(null)
  const [burstSummary, setBurstSummary] = useState(null)
  const [lastSavedSummary, setLastSavedSummary] = useState(null)
  const [savingEnrollment, setSavingEnrollment] = useState(false)
  const [toast, setToast] = useState(null)
  const [duplicateError, setDuplicateError] = useState(null)

  const playAudioCue = useAudioCue()
  const nameRef = useRef(null)

  const {
    capturePhase,
    phaseProgress,
    faceFound,
    faceNeedsAlignment,
    statusMsg,
    setStatusMsg,
    currentYaw,
    poseOk,
    startDetect,
    stopDetect,
    resetCapture,
  } = useEnrollmentCapture(camera)

  const selectedOffice = offices.find(o => o.id === officeId) || null
  const existingPerson = useMemo(
    () => persons.find(p => p.employeeId === employeeId.trim()),
    [employeeId, persons],
  )
  const existingSamples = existingPerson?.sampleCount ?? 0
  const pendingSampleCount = pendingDescriptors.length
  const stepIndex = STEPS.findIndex(s => s.id === step)

  function showToast(msg, duration = 3500) {
    setToast(msg)
    window.setTimeout(() => setToast(null), duration)
  }

  function handleEmployeeIdChange(val) {
    const sanitized = val.replace(/[^A-Za-z0-9-]/g, '')
    setEmployeeId(sanitized)
    setEmployeeIdError(val !== sanitized ? 'Only letters, numbers, and dashes (-)' : '')
  }

  // ─── FIXED: Removed the early `if (persons.length === 0) return` that
  // silently killed the entire capture flow on fresh/empty systems.
  // The duplicate check is now correctly skipped when there's nothing to check,
  // and the flow always proceeds to review when a valid capture is obtained.
  useEffect(() => {
    if (!workspaceReady || !modelsReady || !camera.camOn || step !== 'capture') return () => {}

    startDetect(result => {
      // Only run duplicate check when there are persons with descriptors to compare against.
      // When the system is empty (first enrollment), skip directly to review.
      const personsWithDescriptors = persons.filter(p => p.descriptors?.length > 0)
      if (personsWithDescriptors.length > 0) {
        for (const descriptor of result.descriptors) {
          const dup = findClosestPerson(persons, '', descriptor, DUPLICATE_FACE_THRESHOLD)
          if (dup) {
            setDuplicateError(`Face already enrolled as ${dup.person.name} (${dup.person.employeeId || 'no ID'}). Duplicate not allowed.`)
            playAudioCue('notify')
            return
          }
          const close = findClosestPerson(persons, '', descriptor, DISTANCE_THRESHOLD_KIOSK)
          if (close && close.distance <= 0.50) {
            setDuplicateError(`Face resembles ${close.person.name} (${close.person.employeeId || 'no ID'}). Too similar to existing enrollment.`)
            playAudioCue('notify')
            return
          }
        }
      }

      // Always proceed here — whether the persons list is empty or not
      setDuplicateError(null)
      setPendingDescriptors(result.descriptors)
      setPreviewUrl(result.previewUrl)
      setCaptureFeedback(result.qualitySummary)
      setBurstSummary(result.burstSummary)
      playAudioCue('notify')
      setStep('review')
    }, modelsReady)

    return stopDetect
  }, [camera.camOn, modelsReady, workspaceReady, step, startDetect, stopDetect, playAudioCue, persons])

  const handleRetake = useCallback(() => {
    setDuplicateError(null)
    setPreviewUrl(null)
    setPendingDescriptors([])
    setCaptureFeedback(null)
    setBurstSummary(null)
    resetCapture()
    camera.clearOverlay()
    setStep('capture')
  }, [camera, resetCapture])

  const goToDetails = useCallback(() => {
    if (pendingSampleCount === 0) { showToast('Capture a face first'); return }
    setStep('details')
    window.setTimeout(() => nameRef.current?.focus(), 80)
  }, [pendingSampleCount])

  const handleRegister = useCallback(async () => {
    if (!name.trim()) { showToast('Enter the employee name'); nameRef.current?.focus(); return }
    if (!employeeId.trim()) { showToast('Enter the employee ID'); return }
    if (!officeId) { showToast('Select the assigned office'); return }
    if (pendingSampleCount === 0) { showToast('Capture a face first'); return }

    setSavingEnrollment(true)
    let result = null
    try {
      result = await onEnrollPerson(
        {
          name: name.trim(),
          employeeId: employeeId.trim(),
          officeId,
          officeName: selectedOffice?.name || 'Unassigned',
          photoDataUrl: previewUrl,
        },
        pendingDescriptors,
      )
    } catch (err) {
      showToast(err.message || 'Failed to save enrollment')
      setSavingEnrollment(false)
      return
    }
    setSavingEnrollment(false)

    const savedCount = Number(result?.savedSampleCount || pendingSampleCount || 1)
    const totalCount = Number(result?.sampleCount || (existingSamples + savedCount))
    const approvalStatus = result?.approvalStatus || PERSON_APPROVAL_PENDING
    setLastSavedSummary({
      name: name.trim(),
      employeeId: employeeId.trim(),
      officeName: selectedOffice?.name || 'Unassigned',
      sampleCount: totalCount,
      savedSampleCount: savedCount,
      remaining: Math.max(0, ENROLLMENT_MIN_SAMPLES - totalCount),
      approvalStatus,
    })
    setStep('complete')
    playAudioCue('success')
  }, [employeeId, existingSamples, name, officeId, onEnrollPerson, pendingDescriptors, pendingSampleCount, previewUrl, selectedOffice, playAudioCue])

  const handleNewPerson = useCallback(() => {
    setName('')
    setEmployeeId('')
    setOfficeId(offices[0]?.id || '')
    handleRetake()
  }, [offices, handleRetake])

  const captureStateLabel = !modelsReady
    ? 'Loading models…'
    : capturePhase >= 0
      ? CAPTURE_PHASES[capturePhase]?.label
      : faceFound
        ? 'Face ready — hold still'
        : faceNeedsAlignment
          ? 'Move into the oval guide'
          : 'Scanning for face…'

  const captureStateCls = capturePhase >= 0
    ? poseOk
      ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/50'
      : 'bg-blue-500/20 text-blue-100 ring-1 ring-blue-400/40'
    : faceFound
      ? 'bg-emerald-400/20 text-emerald-50 ring-1 ring-emerald-300/40'
      : faceNeedsAlignment
        ? 'bg-amber-300/16 text-amber-50 ring-1 ring-amber-300/35'
        : 'bg-white/15 text-stone-100 ring-1 ring-white/12'

  return (
    <AppShell
      actions={
        <div className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm">
          {persons.length} enrolled
        </div>
      }
      contentClassName="px-3 py-3 sm:px-5 lg:px-8 min-h-0 flex flex-col"
    >
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[1.1rem] bg-navy-dark px-5 py-3 text-center text-sm font-medium text-white shadow-xl sm:w-auto sm:rounded-full">
          {toast}
        </div>
      )}

      {savingEnrollment && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.8rem] border border-black/5 bg-white px-6 py-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy/10">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-ink">Saving enrollment</h2>
            <p className="mt-2 text-sm text-muted">Submitting to server…</p>
          </div>
        </div>
      )}

      {step === 'capture' && (
        <div className="page-frame min-h-[calc(100dvh-8.25rem)] xl:min-h-[calc(100dvh-10.5rem)]">
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35 }}
            className="relative min-h-[calc(100dvh-8.25rem)] overflow-hidden rounded-[1.4rem] border border-black/5 bg-black shadow-glow xl:min-h-[calc(100dvh-10.5rem)]"
          >
            <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top,rgba(17,133,108,0.18),transparent_40%),linear-gradient(180deg,rgba(3,10,9,0.92),rgba(8,13,12,0.96))]" />

            <div className="absolute inset-0 z-[2] flex items-center justify-center px-4 py-6">
              <div
                className="relative w-[78vw] sm:w-[54vw]"
                style={{
                  aspectRatio: String(OVAL_CAPTURE_ASPECT_RATIO),
                  maxWidth: `min(430px, calc(min(72vh, 640px) * ${OVAL_CAPTURE_ASPECT_RATIO}))`,
                }}
              >
                <div
                  className={`absolute inset-0 transition-all duration-200 ${
                    capturePhase >= 0 && poseOk
                      ? 'ring-2 ring-emerald-400/80 shadow-[0_0_50px_rgba(16,185,129,0.32)]'
                      : capturePhase >= 0
                        ? 'ring-2 ring-blue-400/60 shadow-[0_0_40px_rgba(59,130,246,0.20)]'
                        : faceFound
                          ? 'ring-2 ring-emerald-400/70'
                          : 'ring-1 ring-white/18'
                  }`}
                  style={OVAL_FRAME_STYLE}
                />
                <div className="absolute inset-[2px] overflow-hidden bg-black" style={OVAL_FRAME_STYLE}>
                  <video ref={camera.setVideoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
                  <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(0,0,0,0.1)_54%,rgba(0,0,0,0.36)_100%)]" />
                </div>
              </div>
            </div>

            <div className="absolute left-3 top-3 z-[4]">
              {onBack && (
                <button
                  className="rounded-full border border-white/20 bg-black/35 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/50"
                  onClick={onBack}
                  type="button"
                >
                  ← Kiosk
                </button>
              )}
            </div>

            {!camera.camOn && (
              <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/60 text-center text-white">
                <div className="text-5xl opacity-60">◈</div>
                <div className="text-sm">{camera.camError || 'Camera offline'}</div>
              </div>
            )}

            <PhaseIndicator
              capturePhase={capturePhase}
              phaseProgress={phaseProgress}
              poseOk={poseOk}
              currentYaw={currentYaw}
              statusMsg={statusMsg}
            />

            {errorMessage && (
              <div className="absolute inset-x-3 bottom-20 z-[5] rounded-2xl bg-red-50/95 px-4 py-3 text-sm text-warn shadow-lg">
                {errorMessage}
              </div>
            )}

            {duplicateError && (
              <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[1.1rem] bg-red-600 px-5 py-3 text-center text-sm font-medium text-white shadow-xl sm:w-auto sm:rounded-full">
                {duplicateError}
              </div>
            )}
          </motion.section>
        </div>
      )}

      {step !== 'capture' && (
        <div className="page-frame flex h-[calc(100dvh-8.25rem)] flex-col gap-3 overflow-hidden xl:h-[calc(100dvh-10.5rem)]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35 }}
            className="shrink-0 rounded-[1.5rem] border border-black/5 bg-white/80 p-3 shadow-glow"
          >
            <div className="grid gap-2 sm:grid-cols-4">
              {STEPS.map((item, idx) => (
                <WizardStep
                  key={item.id}
                  active={item.id === step}
                  complete={idx < stepIndex}
                  description={item.description}
                  number={item.number}
                  title={item.title}
                />
              ))}
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto rounded-[1.5rem] border border-black/5 bg-white/80 p-3 shadow-glow sm:p-4"
          >
            <div className="flex shrink-0 flex-col gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Enrollment</span>
                <h2 className="mt-0.5 font-display text-xl text-ink sm:text-2xl">{STEPS[stepIndex]?.title}</h2>
              </div>
              {burstSummary && (
                <div className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  burstSummary.genuinelyDiverse
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {burstSummary.keptCount} samples
                  {burstSummary.genuinelyDiverse ? ' · Diverse angles ✓' : ' · Single angle — retake recommended'}
                </div>
              )}
            </div>

            {step === 'review' && (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_300px]">
                <div className="flex min-h-[16rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950">
                  {previewUrl
                    ? <img alt="Captured" className="max-h-[min(52vh,30rem)] w-full object-contain" src={previewUrl} />
                    : <div className="text-sm text-stone-300">No preview yet.</div>
                  }
                </div>
                <div className="grid content-start gap-3">
                  <button className="btn btn-primary w-full" onClick={goToDetails} type="button">
                    Continue to details
                  </button>
                  <button className="btn btn-ghost w-full" onClick={handleRetake} type="button">
                    Retake (3-angle)
                  </button>

                  {burstSummary && !burstSummary.genuinelyDiverse && (
                    <InfoCard
                      title="Single angle detected"
                      text="The system captured similar poses for all 3 phases. For better accuracy, retake and follow the head-turn instructions."
                      tone="warn"
                    />
                  )}

                  {burstSummary && burstSummary.genuinelyDiverse && (
                    <InfoCard
                      title={`${burstSummary.keptCount} diverse samples captured`}
                      text={`${burstSummary.detectedCount} frames processed across 3 angles. Diverse poses improve recognition accuracy significantly.`}
                      tone="default"
                    />
                  )}

                  {captureFeedback && captureFeedback.tone === 'warn' && (
                    <InfoCard title={captureFeedback.title} text={captureFeedback.text} tone="warn" />
                  )}
                </div>
              </div>
            )}

            {step === 'details' && (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_280px]">
                <div className="grid content-start gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
                  <Field label="Full name">
                    <input
                      ref={nameRef}
                      className="input uppercase"
                      onChange={e => setName(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && handleRegister()}
                      placeholder="Enter full name"
                      type="text"
                      value={name}
                    />
                  </Field>
                  <Field label="Employee ID">
                    <input
                      className={`input ${employeeIdError ? 'border-amber-400' : ''}`}
                      onChange={e => handleEmployeeIdChange(e.target.value)}
                      placeholder="Enter employee ID"
                      type="text"
                      value={employeeId}
                    />
                    {employeeIdError && <p className="text-xs text-amber-600">{employeeIdError}</p>}
                  </Field>
                  <Field label="Assigned office">
                    <select className="input" onChange={e => setOfficeId(e.target.value)} value={officeId}>
                      {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button className="btn btn-ghost w-full" onClick={() => setStep('review')} type="button">
                      ← Back
                    </button>
                    <button
                      className="btn btn-primary w-full"
                      disabled={savingEnrollment || !pendingSampleCount || !name.trim() || !employeeId.trim() || !officeId}
                      onClick={handleRegister}
                      type="button"
                    >
                      {savingEnrollment ? '…' : 'Save enrollment'}
                    </button>
                  </div>
                </div>
                <div className="grid content-start gap-3">
                  <div className="flex min-h-[14rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950">
                    {previewUrl
                      ? <img alt="Preview" className="max-h-[min(36vh,22rem)] w-full object-contain" src={previewUrl} />
                      : <div className="text-sm text-stone-300">No preview.</div>
                    }
                  </div>
                  {existingPerson
                    ? <InfoCard title="Existing record" text={`${existingPerson.name} — ${existingSamples} sample(s) at ${existingPerson.officeName}.`} />
                    : <InfoCard title="New employee" text="A new record will be created pending admin approval." />
                  }
                </div>
              </div>
            )}

            {step === 'complete' && (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_280px]">
                <div className="overflow-auto rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
                  <span className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                    lastSavedSummary?.approvalStatus === PERSON_APPROVAL_PENDING
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {lastSavedSummary?.approvalStatus === PERSON_APPROVAL_PENDING ? 'Pending approval' : 'Saved'}
                  </span>
                  <h3 className="mt-4 font-display text-3xl text-ink">{lastSavedSummary?.name}</h3>
                  <div className="mt-3 space-y-2 text-sm text-muted">
                    <p><strong className="text-ink">Employee ID:</strong> {lastSavedSummary?.employeeId}</p>
                    <p><strong className="text-ink">Office:</strong> {lastSavedSummary?.officeName}</p>
                    <p><strong className="text-ink">Samples saved:</strong> {lastSavedSummary?.savedSampleCount} (3-angle)</p>
                    <p><strong className="text-ink">Total on record:</strong> {lastSavedSummary?.sampleCount}</p>
                    {lastSavedSummary?.remaining > 0 && (
                      <p><strong className="text-ink">Recommended additional:</strong> {lastSavedSummary?.remaining}</p>
                    )}
                  </div>
                </div>
                <div className="grid content-start gap-3">
                  <button className="btn btn-primary w-full" onClick={handleRetake} type="button">
                    Add another sample
                  </button>
                  <button className="btn btn-ghost w-full" onClick={handleNewPerson} type="button">
                    Enroll new employee
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AppShell>
  )
}
