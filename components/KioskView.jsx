'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioCue } from '@/hooks/useAudioCue'
import { useKioskState } from '@/hooks/useKioskState'
import { useVerificationBurst } from '@/hooks/useVerificationBurst'
import { useKioskLoop } from '@/hooks/useKioskLoop'
import { useKioskMetrics } from '@/hooks/useKioskMetrics'
import AppShell from './AppShell'
import { useKioskClock } from '@/hooks/useKioskClock'
import KioskScanningOverlay from './kiosk/KioskScanningOverlay'
import KioskAlert from './kiosk/KioskAlert'
import KioskSuccessScreen from './kiosk/KioskSuccessScreen'
import { clearAttendanceMatch, saveAttendanceMatch } from '@/lib/attendance-match'
import { Button, Dialog, Field, Input, Select, Surface, Textarea } from '@/components/ui'

const FIELD_DUTY_REASONS = ['Official Meeting', 'Field Work', 'Training / Seminar', 'Official Travel', 'Emergency / Other']

const CLAIMED_EMPLOYEE_ID_STORAGE_KEY = 'faceattend:claimed-access-code'

function normalizeEmployeeIdInput(value) {
  return String(value || '').replace(/\D/g, '')
}

function validateEmployeeIdInput(value) {
  if (!value) return 'Access code is required.'
  if (!/^\d{4}$/.test(value)) return 'Enter exactly four digits.'
  return ''
}

export default function KioskView({
  camera,
  modelsReady,
  workspaceReady,
  locationState,
  onLogAttendance,
  errorMessage,
}) {
  const playAudioCue = useAudioCue()
  const { recordScan, recordVerification, recordNetwork } = useKioskMetrics()
  const previousStateRef = useRef('idle')
  const resultKeyRef = useRef('')
  const [employeeIdInput, setEmployeeIdInput] = useState('')
  const [employeeIdError, setEmployeeIdError] = useState('')
  const [claimedEmployeeId, setClaimedEmployeeId] = useState('')
  const [fieldDutyOpen, setFieldDutyOpen] = useState(false)
  const [fieldDutyReason, setFieldDutyReason] = useState('')
  const [fieldDutyRemarks, setFieldDutyRemarks] = useState('')

  const {
    kioskState,
    setKioskState,
    currentMatch,
    setCurrentMatch,
    capturedFrameUrl,
    setCapturedFrameUrl,
    flashKey,
    setFlashKey,
    alertState,
    setAlertState,
    resumeKey,
    faceDistanceInfo,
    setFaceDistanceInfo,
    confirmRef,
    confirmedTimer,
    unknownTimer,
    attemptCooldownUntilRef,
    faceLossTimerRef,
    pausedRef,
    scheduleResume,
    showAlertAndResume,
    pauseScanning,
  } = useKioskState(camera)

  const { captureVerificationBurst } = useVerificationBurst(camera)

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(CLAIMED_EMPLOYEE_ID_STORAGE_KEY) || ''
      if (saved) setEmployeeIdInput(saved)
    } catch {}
  }, [])

  const { runScan, startLoop, stopLoop } = useKioskLoop({
    camera,
    modelsReady,
    locationState,
    onLogAttendance,
    setKioskState,
    setCurrentMatch,
    setCapturedFrameUrl,
    setFlashKey,
    setAlertState,
    setFaceDistanceInfo,
    confirmRef,
    confirmedTimer,
    unknownTimer,
    attemptCooldownUntilRef,
    faceLossTimerRef,
    pausedRef,
    showAlertAndResume,
    recordScan,
    recordVerification,
    recordNetwork,
    claimedEmployeeId,
    fieldDuty: fieldDutyReason && fieldDutyRemarks.trim()
      ? { requested: true, reason: fieldDutyReason, remarks: fieldDutyRemarks.trim() }
      : null,
  })

  const { clock, dateStr } = useKioskClock()

  useEffect(() => {
    clearAttendanceMatch()
  }, [])

  const handleRunScan = useCallback(() => {
    return runScan(captureVerificationBurst)
  }, [runScan, captureVerificationBurst])

  useEffect(() => {
    if (!claimedEmployeeId || !workspaceReady || !modelsReady || !camera.camOn) {
      stopLoop()
      return () => {}
    }
    stopLoop()
    startLoop(handleRunScan)
    return stopLoop
  }, [camera.camOn, claimedEmployeeId, modelsReady, resumeKey, startLoop, stopLoop, workspaceReady, handleRunScan])

  const handleEmployeeIdChange = useCallback(event => {
    setEmployeeIdInput(String(event.target.value || '').replace(/\D/g, '').slice(0, 20))
    if (employeeIdError) setEmployeeIdError('')
  }, [employeeIdError])

  const handleConfirmEmployeeId = useCallback(event => {
    event?.preventDefault?.()
    const normalized = normalizeEmployeeIdInput(employeeIdInput)
    const validation = validateEmployeeIdInput(normalized)
    if (validation) {
      setEmployeeIdError(validation)
      return
    }

    setEmployeeIdError('')
    setClaimedEmployeeId(normalized)
    try {
      window.sessionStorage.setItem(CLAIMED_EMPLOYEE_ID_STORAGE_KEY, normalized)
    } catch {}
  }, [employeeIdInput])

  const clearClaimedEmployeeId = useCallback(() => {
    setClaimedEmployeeId('')
    setEmployeeIdInput('')
    setEmployeeIdError('')
    try {
      window.sessionStorage.removeItem(CLAIMED_EMPLOYEE_ID_STORAGE_KEY)
    } catch {}
  }, [])

  const handleChangeEmployeeId = useCallback(() => {
    pauseScanning()
    clearAttendanceMatch()
    setCurrentMatch(null)
    setCapturedFrameUrl(null)
    setAlertState(null)
    setKioskState('idle')
    clearClaimedEmployeeId()
    setFieldDutyOpen(false)
    setFieldDutyReason('')
    setFieldDutyRemarks('')
    if (camera?.clearOverlay) camera.clearOverlay()
  }, [camera, clearClaimedEmployeeId, pauseScanning, setAlertState, setCapturedFrameUrl, setCurrentMatch, setKioskState])

  useEffect(() => {
    const previous = previousStateRef.current
    if (previous === kioskState) return

    if (kioskState === 'confirmed') {
      playAudioCue('success')
      if (currentMatch?.personId || currentMatch?.employeeId) {
        try {
          saveAttendanceMatch(currentMatch)
        } catch {}
      }
    }
    if (kioskState === 'blocked' && previous !== 'blocked') {
      playAudioCue('notify')
      // Save only identified people; a canonical person ID supports employees
      // whose optional Employee ID is blank.
      if (currentMatch?.personId || currentMatch?.employeeId) {
        try {
          saveAttendanceMatch(currentMatch)
        } catch {}
      }
    }
    if (kioskState === 'unknown' && previous !== 'unknown') {
      playAudioCue('notify')
      // Don't save - face was not recognized, we don't know who they are
    }
    previousStateRef.current = kioskState
  }, [currentMatch, kioskState, playAudioCue])

  const isConfirmed = kioskState === 'confirmed'
  const isUnknown = kioskState === 'unknown'
  const isBlocked = kioskState === 'blocked'
  const isReviewableBlockedState = Boolean(
    isBlocked
    && currentMatch?.resultState === 'already-recorded'
    && (currentMatch?.personId || currentMatch?.employeeId),
  )
  const showResultScreen = Boolean(currentMatch && (isConfirmed || isReviewableBlockedState))

  useEffect(() => {
    if (!showResultScreen) {
      resultKeyRef.current = ''
      return
    }

    const resultKey = `${currentMatch?.personId || currentMatch?.employeeId || ''}:${currentMatch?.timestamp || ''}:${currentMatch?.resultState || 'confirmed'}`
    if (resultKey && resultKey !== resultKeyRef.current) {
      resultKeyRef.current = resultKey
    }
  }, [currentMatch?.employeeId, currentMatch?.personId, currentMatch?.resultState, currentMatch?.timestamp, showResultScreen])

  const handleBackToKiosk = useCallback(() => {
    clearAttendanceMatch()
    clearClaimedEmployeeId()
    scheduleResume(250)
  }, [clearClaimedEmployeeId, scheduleResume])

  if (!claimedEmployeeId) {
    return (
      <AppShell
        fitViewport
        contentClassName="px-4 py-4 sm:px-6 lg:px-8"
        onBeforeNavigate={pauseScanning}
        showFooter={false}
      >
        <div className="page-frame h-full min-h-0">
          <Surface className="grid h-full min-h-0 place-items-center overflow-hidden px-4 py-6">
            <form className="grid w-full max-w-sm gap-4" onSubmit={handleConfirmEmployeeId}>
              <div className="text-center">
                <h1 className="text-3xl font-semibold text-foreground">VeriFace access code</h1>
                <p className="mt-2 text-sm text-secondary">Enter the four-digit code issued after enrollment.</p>
              </div>

              <Field error={employeeIdError} label="Four-digit access code" required>
                <Input
                  autoComplete="username"
                  autoFocus
                  className="h-14 text-center text-xl tracking-[0.08em]"
                  inputMode="numeric"
                  onChange={handleEmployeeIdChange}
                  placeholder="0000"
                  type="text"
                  value={employeeIdInput}
                />
              </Field>

              <Button className="w-full" type="submit">Continue to scan</Button>
            </form>
          </Surface>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      actions={(
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[8rem] truncate rounded-full border border-navy/10 bg-white px-3 py-1.5 text-xs font-semibold text-navy sm:inline">
            {claimedEmployeeId}
          </span>
          <Button onClick={handleChangeEmployeeId} variant="quiet">
            Change code
          </Button>
          <Button onClick={() => setFieldDutyOpen(true)} variant={fieldDutyReason && fieldDutyRemarks.trim() ? 'primary' : 'secondary'}>
            {fieldDutyReason ? 'Field Duty set' : 'Offsite / Field Duty'}
          </Button>
        </div>
      )}
      fitViewport
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
      onBeforeNavigate={pauseScanning}
      showFooter={false}
    >
      <div className="page-frame h-full min-h-0">
        <section className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-surface border border-line ${showResultScreen ? 'bg-white' : 'bg-black'}`}>
          {showResultScreen ? (
            <KioskSuccessScreen
              currentMatch={currentMatch}
              onBack={handleBackToKiosk}
            />
          ) : (
            <KioskScanningOverlay
              camera={camera}
              kioskState={kioskState}
              capturedFrameUrl={capturedFrameUrl}
              isConfirmed={isConfirmed}
              isBlocked={isBlocked}
              isUnknown={isUnknown}
              flashKey={flashKey}
              clock={clock}
              dateStr={dateStr}
              locationState={locationState}
              faceDistanceInfo={faceDistanceInfo}
              modelsReady={modelsReady}
            />
          )}
          <KioskAlert alertState={alertState} />
          {errorMessage ? (
            <div className="absolute inset-x-3 bottom-3 z-[4] rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm text-destructive sm:inset-x-5 sm:bottom-5" role="alert">
              {errorMessage}
            </div>
          ) : null}
        </section>
      </div>
      <Dialog
        open={fieldDutyOpen}
        title="Offsite / field duty"
        onClose={() => setFieldDutyOpen(false)}
        footer={(
          <>
            <Button onClick={() => setFieldDutyOpen(false)} variant="secondary">Cancel</Button>
            <Button disabled={!fieldDutyReason || !fieldDutyRemarks.trim()} onClick={() => setFieldDutyOpen(false)}>Use for scan</Button>
          </>
        )}
      >
            <p className="text-sm leading-6 text-secondary">Use only for official work outside a DILG office. Scan time and actual GPS position are recorded for HR/Admin review.</p>
            <div className="mt-4 grid gap-4">
            <Field label="Reason" required><Select value={fieldDutyReason} onChange={event => setFieldDutyReason(event.target.value)}>
              <option value="">Select reason</option>
              {FIELD_DUTY_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
            </Select></Field>
            <Field label="Remarks" hint={`${fieldDutyRemarks.length}/500 characters`} required><Textarea maxLength={500} placeholder="State the meeting, assignment, or official activity." value={fieldDutyRemarks} onChange={event => setFieldDutyRemarks(event.target.value)} /></Field>
            </div>
      </Dialog>
    </AppShell>
  )
}
