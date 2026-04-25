'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PERSON_APPROVAL_PENDING } from '../lib/person-approval'
import { ENROLLMENT_MIN_SAMPLES } from '../lib/biometrics/enrollment-burst'
import { checkEnrollmentDuplicate } from '../lib/data-store'
import { useAudioCue } from '../hooks/useAudioCue'
import { useEnrollmentCapture } from '../hooks/useEnrollmentCapture'
import AppShell from './AppShell'
import CompleteStep from './register/CompleteStep'
import CaptureStep from './register/CaptureStep'
import DetailsStep from './register/DetailsStep'
import ReviewStep from './register/ReviewStep'
import RegisterStepRail from './register/RegisterStepRail'

const STEPS = [
  { id: 'details', number: '1', title: 'Employee details', description: 'Name, ID, and assigned office.' },
  { id: 'capture', number: '2', title: 'Capture face', description: '4-angle guided capture.' },
  { id: 'review', number: '3', title: 'Review and submit', description: 'Retake if unclear, then submit.' },
  { id: 'complete', number: '4', title: 'Complete', description: 'Add samples or enroll another.' },
]

export default function RegisterView({
  camera,
  offices,
  onEnrollPerson,
  modelsReady,
  workspaceReady,
  errorMessage,
  onBack,
  manageOwnCamera = false,
}) {
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [employeeIdError, setEmployeeIdError] = useState('')
  const [position, setPosition] = useState('')
  const [officeId, setOfficeId] = useState(offices[0]?.id || '')
  const [divisionId, setDivisionId] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pendingDescriptors, setPendingDescriptors] = useState([])
  const [captureMetadata, setCaptureMetadata] = useState(null)
  const [step, setStep] = useState('details')
  const [captureFeedback, setCaptureFeedback] = useState(null)
  const [burstSummary, setBurstSummary] = useState(null)
  const [lastSavedSummary, setLastSavedSummary] = useState(null)
  const [duplicateReviewHint, setDuplicateReviewHint] = useState(null)
  const [savingEnrollment, setSavingEnrollment] = useState(false)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [toast, setToast] = useState(null)

  const playAudioCue = useAudioCue()
  const nameRef = useRef(null)

  const {
    capturePhase,
    faceFound,
    statusMsg,
    currentYaw,
    poseOk,
    faceSizeGuidance,
    startDetect,
    stopDetect,
    resetCapture,
  } = useEnrollmentCapture(camera)

  const selectedOffice = offices.find(office => office.id === officeId) || null
  const isRegionalOffice = String(selectedOffice?.officeType || '') === 'Regional Office'
  const pendingSampleCount = pendingDescriptors.length
  const stepIndex = STEPS.findIndex(item => item.id === step)
  const currentStep = STEPS[stepIndex] || STEPS[0]
  const detailsReady = Boolean(
    name.trim() && employeeId.trim() && position.trim() && officeId
    && (!isRegionalOffice || divisionId),
  )

  useEffect(() => {
    if (!officeId && offices[0]?.id) {
      setOfficeId(offices[0].id)
    }
  }, [officeId, offices])

  useEffect(() => {
    if (!selectedOffice) return
    const divisions = Array.isArray(selectedOffice.divisions) ? selectedOffice.divisions : []
    if (!isRegionalOffice && divisionId) {
      setDivisionId('')
      return
    }
    if (isRegionalOffice && divisionId && !divisions.some(d => d.id === divisionId)) {
      setDivisionId('')
    }
  }, [selectedOffice, isRegionalOffice, divisionId])

  useEffect(() => {
    if (!manageOwnCamera) return () => {}

    let active = true

    if (step === 'capture') {
      if (!camera.camOn) {
        camera.start().catch(() => {
          if (!active) return
        })
      }
    } else if (camera.camOn) {
      camera.stop()
    }

    return () => {
      active = false
    }
  }, [camera, manageOwnCamera, step])

  function showToast(message, duration = 3500) {
    setToast(message)
    window.setTimeout(() => setToast(null), duration)
  }

  function handleEmployeeIdChange(value) {
    const sanitized = value.replace(/[^A-Za-z0-9-]/g, '')
    setEmployeeId(sanitized)
    setEmployeeIdError(value !== sanitized ? 'Only letters, numbers, and dashes (-)' : '')
  }

  const clearPendingCapture = useCallback(() => {
    setPreviewUrl(null)
    setPendingDescriptors([])
    setCaptureMetadata(null)
    setCaptureFeedback(null)
    setBurstSummary(null)
    setDuplicateReviewHint(null)
    resetCapture()
    camera.clearOverlay()
  }, [camera, resetCapture])

  const handleRetake = useCallback(() => {
    clearPendingCapture()
    setStep('capture')
  }, [clearPendingCapture])

  const handleCaptureComplete = useCallback(async (result) => {
    setCheckingDuplicate(true)
    try {
      const duplicateCheck = await checkEnrollmentDuplicate(result.descriptors)
      if (duplicateCheck.duplicate) {
        setDuplicateReviewHint(null)
        setPendingDescriptors([])
        setCaptureMetadata(null)
        setPreviewUrl(null)
        setCaptureFeedback(null)
        setBurstSummary(null)
        playAudioCue('error')
        showToast(duplicateCheck.message || 'Duplicate enrollment blocked.', 5000)
        resetCapture()
        camera.clearOverlay()
        setStep('capture')
        return
      }

      if (duplicateCheck.reviewRequired) {
        setDuplicateReviewHint({
          status: 'required',
          message: duplicateCheck.message || 'Similarity review required.',
        })
        showToast(
          duplicateCheck.message || 'A similar face was found. The submission can continue, but it will be flagged for admin review.',
          5000,
        )
      } else {
        setDuplicateReviewHint(null)
      }

      setPendingDescriptors(result.descriptors)
      setCaptureMetadata(result.captureMetadata || null)
      setPreviewUrl(result.previewUrl)
      setCaptureFeedback(result.qualitySummary)
      setBurstSummary(result.burstSummary)
      playAudioCue('notify')
      setStep('review')
    } catch (error) {
      setDuplicateReviewHint(null)
      showToast(error?.message || 'Failed to verify duplicate enrollment', 5000)
      setPendingDescriptors([])
      setCaptureMetadata(null)
      setPreviewUrl(null)
      setCaptureFeedback(null)
      setBurstSummary(null)
      resetCapture()
      camera.clearOverlay()
      setStep('capture')
    } finally {
      setCheckingDuplicate(false)
    }
  }, [camera, playAudioCue, resetCapture])

  useEffect(() => {
    if (!workspaceReady || !modelsReady || !camera.camOn || step !== 'capture') return () => {}

    startDetect(handleCaptureComplete, modelsReady)

    return stopDetect
  }, [camera.camOn, handleCaptureComplete, modelsReady, startDetect, step, stopDetect, workspaceReady])

  const handleContinueFromDetails = useCallback(() => {
    if (!name.trim()) {
      showToast('Enter the employee name')
      nameRef.current?.focus()
      return
    }
    if (!employeeId.trim()) {
      showToast('Enter the employee ID')
      return
    }
    if (!position.trim()) {
      showToast('Enter the employee position')
      return
    }
    if (!officeId) {
      showToast('Select the assigned office')
      return
    }
    if (isRegionalOffice && !divisionId) {
      showToast('Select the division or unit for Regional Office staff')
      return
    }

    if (pendingSampleCount > 0 && previewUrl) {
      setStep('review')
      return
    }

    setStep('capture')
  }, [employeeId, name, officeId, position, isRegionalOffice, divisionId, pendingSampleCount, previewUrl])

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
    if (!position.trim()) {
      showToast('Enter the employee position')
      return
    }
    if (isRegionalOffice && !divisionId) {
      showToast('Select the division or unit for Regional Office staff')
      return
    }
    if (pendingSampleCount === 0) {
      showToast('Capture a face first')
      return
    }

    setSavingEnrollment(true)
    let result = null

    try {
      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      result = await onEnrollPerson(
        {
          name: name.trim(),
          employeeId: employeeId.trim(),
          position: position.trim(),
          officeId,
          officeName: selectedOffice?.name || 'Unassigned',
          divisionId: isRegionalOffice ? divisionId : '',
          captureMetadata,
          ...(storageBucket ? { photoDataUrl: previewUrl } : {}),
        },
        pendingDescriptors,
      )
    } catch (error) {
      showToast(error.message || 'Failed to save enrollment')
      setSavingEnrollment(false)
      return
    }

    setSavingEnrollment(false)

    const savedCount = Number(result?.savedSampleCount || pendingSampleCount || 1)
    const totalCount = Number(result?.sampleCount || savedCount)
    const approvalStatus = result?.approvalStatus || PERSON_APPROVAL_PENDING
    setLastSavedSummary({
      name: name.trim(),
      employeeId: employeeId.trim(),
      officeName: selectedOffice?.name || 'Unassigned',
      sampleCount: totalCount,
      savedSampleCount: savedCount,
      remaining: Math.max(0, ENROLLMENT_MIN_SAMPLES - totalCount),
      approvalStatus,
      duplicateReviewRequired: Boolean(result?.duplicateReviewRequired),
      duplicateReviewStatus: String(result?.duplicateReviewStatus || 'clear'),
      message: result?.message || '',
    })
    setStep('complete')
    playAudioCue('success')
  }, [captureMetadata, employeeId, name, officeId, position, isRegionalOffice, divisionId, onEnrollPerson, pendingDescriptors, pendingSampleCount, previewUrl, selectedOffice, playAudioCue])

  const handleNewPerson = useCallback(() => {
    setName('')
    setEmployeeId('')
    setPosition('')
    setOfficeId(offices[0]?.id || '')
    setDivisionId('')
    clearPendingCapture()
    setLastSavedSummary(null)
    setStep('details')
    window.setTimeout(() => nameRef.current?.focus(), 80)
  }, [clearPendingCapture, offices])

  return (
    <AppShell
      fitViewport
      actions={(
        <div className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm">
          Enrollment
        </div>
      )}
      contentClassName="min-h-0 flex flex-col px-3 py-3 sm:px-5 lg:px-8"
      showFooter={step !== 'capture'}
    >
      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[1.1rem] bg-navy-dark px-5 py-3 text-center text-sm font-medium text-white shadow-xl sm:w-auto sm:rounded-full">
          {toast}
        </div>
      ) : null}

      {savingEnrollment || checkingDuplicate ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.8rem] border border-black/5 bg-white px-6 py-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy/10">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-ink">
              {checkingDuplicate ? 'Checking duplicate face' : 'Saving enrollment'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {checkingDuplicate ? 'Comparing this capture against enrolled staff…' : 'Submitting to server…'}
            </p>
          </div>
        </div>
      ) : null}

      {step === 'capture' ? (
        <CaptureStep
          camera={camera}
          capturePhase={capturePhase}
          currentYaw={currentYaw}
          employeeId={employeeId}
          errorMessage={errorMessage}
          faceFound={faceFound}
          faceSizeGuidance={faceSizeGuidance}
          name={name}
          onBack={() => setStep('details')}
          onExit={onBack}
          poseOk={poseOk}
          selectedOffice={selectedOffice}
          statusMsg={statusMsg}
        />
      ) : (
        <div className="page-frame flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35 }}
            className="shrink-0 rounded-[1.5rem] border border-black/5 bg-white/80 p-3 shadow-glow"
          >
            <RegisterStepRail activeStep={step} stepIndex={stepIndex} steps={STEPS} />
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
                <h2 className="mt-0.5 font-display text-xl text-ink sm:text-2xl">{currentStep.title}</h2>
              </div>
              {burstSummary ? (
                <div className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  burstSummary.genuinelyDiverse
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {burstSummary.keptCount} samples
                  {burstSummary.genuinelyDiverse ? ' · Diverse angles ✓' : ' · Single angle — retake recommended'}
                </div>
              ) : null}
            </div>

            {step === 'details' ? (
              <DetailsStep
                detailsReady={detailsReady}
                divisionId={divisionId}
                employeeId={employeeId}
                employeeIdError={employeeIdError}
                name={name}
                nameRef={nameRef}
                officeId={officeId}
                offices={offices}
                position={position}
                onBack={onBack}
                onContinue={handleContinueFromDetails}
                onDivisionChange={setDivisionId}
                onEmployeeIdChange={handleEmployeeIdChange}
                onNameChange={setName}
                onOfficeChange={setOfficeId}
                onPositionChange={setPosition}
                onRetake={handleRetake}
                pendingSampleCount={pendingSampleCount}
                previewUrl={previewUrl}
              />
            ) : null}

            {step === 'review' ? (
              <ReviewStep
                burstSummary={burstSummary}
                captureFeedback={captureFeedback}
                detailsReady={detailsReady}
                duplicateReviewHint={duplicateReviewHint}
                onEditDetails={() => setStep('details')}
                onRetake={handleRetake}
                onSubmit={handleRegister}
                pendingSampleCount={pendingSampleCount}
                previewUrl={previewUrl}
                savingEnrollment={savingEnrollment}
              />
            ) : null}

            {step === 'complete' ? (
              <CompleteStep
                lastSavedSummary={lastSavedSummary}
                onAddAnotherSample={handleRetake}
                onEnrollNewPerson={handleNewPerson}
              />
            ) : null}
          </motion.div>
        </div>
      )}
    </AppShell>
  )
}
