'use client'

import { useState, useCallback } from 'react'
import { useEnrollmentCapture, CAPTURE_PHASES } from '@/hooks/useEnrollmentCapture'
import GuidedCapturePanel from '@/components/biometrics/GuidedCapturePanel'
import { buildEmployeeViewHeaders } from '@/lib/attendance-match'

const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

function PromptScreen({ name, onAccept, onSkip }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-white px-6 text-center">
      <div className="rounded-full bg-amber-50 p-4">
        <svg className="h-10 w-10 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-ink">Refresh Face Data</h2>
        <p className="mt-2 text-sm text-muted">
          {name}, attendance is already recorded. Your stored face data is weak legacy data, so a quick re-scan is needed to improve future recognition.
        </p>
      </div>
      <p className="text-xs text-muted">This takes about 15 seconds and uses the same guided multi-pose capture.</p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={onAccept}
          className="w-full rounded-xl bg-navy py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-navy-light"
        >
          Update now
        </button>
        <button
          onClick={onSkip}
          className="w-full rounded-xl border border-black/10 bg-white py-3 text-sm font-medium text-muted transition hover:bg-stone-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}

function CaptureScreen({ camera, capturePhase, poseOk, statusMsg, faceSizeGuidance }) {
  const phase = capturePhase >= 0 ? CAPTURE_PHASES[capturePhase] : null

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,rgba(17,133,108,0.14),transparent_38%),linear-gradient(180deg,rgba(2,8,7,0.95),rgba(5,8,8,0.98))] px-4">
      <div
        className="relative w-full max-w-[280px]"
        style={{ aspectRatio: '0.68' }}
      >
        <div
          className={`absolute inset-0 transition-all duration-300 ${
            poseOk
              ? 'ring-2 ring-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
              : 'ring-2 ring-amber-400/60'
          }`}
          style={OVAL_FRAME_STYLE}
        />
        <div className="absolute inset-[2px] overflow-hidden bg-black" style={OVAL_FRAME_STYLE}>
          <video
            ref={camera.setVideoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
        </div>
      </div>

      <GuidedCapturePanel
        className="w-full max-w-sm"
        faceSizeGuidance={faceSizeGuidance}
        phase={phase}
        phaseCount={CAPTURE_PHASES.length}
        phaseIndex={capturePhase}
        poseOk={poseOk}
        statusMsg={statusMsg}
      />
    </div>
  )
}

function SavingScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-3 border-navy border-t-transparent" />
      <p className="text-sm font-medium text-ink">Saving new face data...</p>
    </div>
  )
}

function DoneScreen({ success, message, onContinue }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-white px-6 text-center">
      {success ? (
        <div className="rounded-full bg-emerald-50 p-4">
          <svg className="h-10 w-10 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      ) : (
        <div className="rounded-full bg-red-50 p-4">
          <svg className="h-10 w-10 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      )}
      <div>
        <h2 className="font-display text-lg font-bold text-ink">
          {success ? 'Face Data Updated' : 'Update Failed'}
        </h2>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      <button
        onClick={onContinue}
        className="rounded-xl bg-navy px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-navy-light"
      >
        Continue
      </button>
    </div>
  )
}

export default function KioskReenrollFlow({ camera, currentMatch, onComplete, onSkip }) {
  const [stage, setStage] = useState('prompt') // prompt | capturing | saving | done
  const [result, setResult] = useState(null)

  const {
    capturePhase,
    poseOk,
    statusMsg,
    faceSizeGuidance,
    startDetect,
    stopDetect,
    resetCapture,
  } = useEnrollmentCapture(camera)

  const handleAccept = useCallback(() => {
    setStage('capturing')
    startDetect(async (captureResult) => {
      stopDetect()
      if (!captureResult?.descriptors?.length) {
        setResult({ success: false, message: 'Could not capture enough face data. Try again later.' })
        setStage('done')
        return
      }

      setStage('saving')
      try {
        const res = await fetch(`/api/persons/${currentMatch.personId}/reenroll`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildEmployeeViewHeaders(currentMatch),
          },
          body: JSON.stringify({
            descriptors: captureResult.descriptors,
            captureMetadata: captureResult.captureMetadata || null,
            photoDataUrl: captureResult.previewUrl || null,
          }),
        })
        const data = await res.json()
        if (data.ok) {
          setResult({
            success: true,
            message: data.message || `Saved ${data.sampleCount} face samples. Future scans will be faster.`,
            needsReenrollment: Boolean(data.needsReenrollment),
            reenrollmentReason: data.reenrollmentReason || null,
            reenrollmentMessage: data.reenrollmentMessage || '',
          })
        } else {
          setResult({ success: false, message: data.message || 'Failed to save face data.' })
        }
      } catch {
        setResult({ success: false, message: 'Network error — try again later.' })
      }
      setStage('done')
    }, true)
  }, [currentMatch, startDetect, stopDetect])

  const handleSkip = useCallback(() => {
    stopDetect()
    resetCapture()
    onSkip()
  }, [stopDetect, resetCapture, onSkip])

  const handleContinue = useCallback(() => {
    stopDetect()
    resetCapture()
    if (result?.success) {
      onComplete(result)
    } else {
      onSkip()
    }
  }, [stopDetect, resetCapture, onComplete, onSkip, result])

  if (stage === 'prompt') {
    return <PromptScreen name={currentMatch?.name || 'Employee'} onAccept={handleAccept} onSkip={handleSkip} />
  }

  if (stage === 'capturing') {
    return (
      <CaptureScreen
        camera={camera}
        capturePhase={capturePhase}
        faceSizeGuidance={faceSizeGuidance}
        poseOk={poseOk}
        statusMsg={statusMsg}
      />
    )
  }

  if (stage === 'saving') {
    return <SavingScreen />
  }

  return <DoneScreen success={result?.success} message={result?.message} onContinue={handleContinue} />
}
