'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBiometricRuntime } from '@/components/BiometricRuntimeProvider'
import { CAPTURE_PHASES, useEnrollmentCapture } from '@/hooks/useEnrollmentCapture'
import { areModelsReady, loadModels } from '@/lib/biometrics/human'
import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'

const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

function InfoCard({ title, text, tone = 'default' }) {
  const cls = tone === 'warn'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-black/5 bg-stone-50 text-muted'

  return (
    <section className={`rounded-[1.25rem] border p-4 ${cls}`}>
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">{title}</h3>
      <p className="mt-2 text-sm leading-7">{text}</p>
    </section>
  )
}

export default function EmployeeReenrollPanel({ person, onBack, onComplete }) {
  const runtime = useBiometricRuntime()
  const { camera, workspaceReady, modelsReady, modelStatus, runtimeError, retry } = runtime
  
  const startCamera = camera.start
  const stopCamera = camera.stop
  const camOn = camera.camOn
  const camError = camera.camError
  const setVideoRef = camera.setVideoRef
  const canvasRef = camera.canvasRef

  const [workspaceState, setWorkspaceState] = useState('loading')
  const [captureResult, setCaptureResult] = useState(null)
  const [saveError, setSaveError] = useState('')

  const {
    capturePhase,
    phaseProgress,
    faceFound,
    faceNeedsAlignment,
    statusMsg,
    currentYaw,
    poseOk,
    sideAYaw,
    startDetect,
    stopDetect,
    resetCapture,
  } = useEnrollmentCapture(camera)

  useEffect(() => {
    if (workspaceReady) {
      setWorkspaceState('capture')
    } else if (runtimeError) {
      setWorkspaceState('error')
    } else if (modelsReady && !camOn) {
      setWorkspaceState('waiting')
    } else if (!modelsReady) {
      setWorkspaceState('loading')
    }
  }, [workspaceReady, modelsReady, camOn, runtimeError])

  useEffect(() => {
    if (!workspaceReady) return () => {}

    const timer = setTimeout(() => {
      startDetect(result => {
        setCaptureResult(result)
        setSaveError('')
        setWorkspaceState('review')
      }, true)
    }, 500)

    return () => {
      clearTimeout(timer)
      stopDetect()
    }
  }, [workspaceReady, startDetect, stopDetect])

  const handleRetake = useCallback(() => {
    stopDetect()
    resetCapture()
    setCaptureResult(null)
    setSaveError('')
    setWorkspaceState('capture')
  }, [resetCapture])

  const handleSave = useCallback(async () => {
    if (!captureResult?.descriptors?.length) return

    setSaveError('')
    setWorkspaceState('saving')
    try {
      const response = await fetch(`/api/persons/${person.id}/reenroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descriptors: captureResult.descriptors,
          ...(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? { photoDataUrl: captureResult.previewUrl || null } : {}),
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setSaveError(payload?.message || 'Failed to save face data.')
        setWorkspaceState('review')
        return
      }

      onComplete({
        sampleCount: Number(payload?.sampleCount || captureResult.descriptors.length),
        message: payload?.message || '',
      })
    } catch (error) {
      setSaveError(error?.message || 'Failed to save face data.')
      setWorkspaceState('review')
    }
  }, [captureResult, onComplete, person.id])

  const captureStateLabel = useMemo(() => {
    if (capturePhase >= 0) return CAPTURE_PHASES[capturePhase]?.label || 'Capturing'
    if (faceFound) return 'Face ready'
    if (faceNeedsAlignment) return 'Move into the oval'
    return 'Scanning for face'
  }, [capturePhase, faceFound, faceNeedsAlignment])

  if (workspaceState === 'booting') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[1.4rem] border border-black/5 bg-stone-50 p-6">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-navy border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-ink">Loading biometric workspace...</p>
          <p className="mt-1 text-xs text-muted">Starting models and camera for live re-enrollment.</p>
        </div>
      </div>
    )
  }

  if (workspaceState === 'error') {
    return (
      <div className="grid min-h-0 flex-1 content-center gap-4 rounded-[1.4rem] border border-red-200 bg-red-50 p-6 text-center">
        <div>
          <h3 className="text-lg font-bold text-red-900">Biometric workspace failed</h3>
          <p className="mt-2 text-sm text-red-700">{runtimeError || 'Could not start camera or models.'}</p>
        </div>
        <div className="flex justify-center gap-3">
          <button
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone-50"
            onClick={onBack}
            type="button"
          >
            Back
          </button>
          <button
            className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark"
            onClick={retry}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (workspaceState === 'waiting') {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-[1.5rem] border border-black/5 bg-stone-50 p-6">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-navy border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-ink">Starting camera...</p>
          <p className="mt-1 text-xs text-muted">{modelStatus}</p>
        </div>
      </div>
    )
  }

  if (workspaceState === 'review' || workspaceState === 'saving') {
    const burstSummary = captureResult?.burstSummary
    const qualitySummary = captureResult?.qualitySummary

    return (
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-h-[20rem] items-center justify-center overflow-hidden rounded-[1.4rem] border border-black/5 bg-stone-950">
          {captureResult?.previewUrl ? (
            <img
              alt={`Captured face for ${person.name}`}
              className="max-h-[min(64vh,34rem)] w-full object-contain"
              src={captureResult.previewUrl}
            />
          ) : (
            <div className="text-sm text-stone-300">No preview available.</div>
          )}
        </div>

        <div className="grid content-start gap-3">
          <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Live re-enrollment</div>
            <h3 className="mt-2 text-xl font-bold text-ink">{person.name}</h3>
            <p className="mt-1 text-sm text-muted">{person.employeeId} · {person.officeName}</p>
          </div>

          {burstSummary && (
            <InfoCard
              title={burstSummary.genuinelyDiverse ? 'Capture quality good' : 'Retake recommended'}
              text={
                burstSummary.genuinelyDiverse
                  ? `${burstSummary.keptCount} diverse samples captured across the 3-angle flow.`
                  : 'The capture completed, but the angles were too similar. Retake for cleaner biometric separation.'
              }
              tone={burstSummary.genuinelyDiverse ? 'default' : 'warn'}
            />
          )}

          {qualitySummary?.tone === 'warn' && (
            <InfoCard title={qualitySummary.title} text={qualitySummary.text} tone="warn" />
          )}

          {saveError && (
            <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          )}

          <div className="grid gap-3 pt-1">
            <button
              className="rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50"
              disabled={workspaceState === 'saving'}
              onClick={handleSave}
              type="button"
            >
              {workspaceState === 'saving' ? 'Saving face data...' : 'Save live re-enrollment'}
            </button>
            <button
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:opacity-50"
              disabled={workspaceState === 'saving'}
              onClick={handleRetake}
              type="button"
            >
              Retake capture
            </button>
            <button
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-muted transition hover:bg-stone-50 disabled:opacity-50"
              disabled={workspaceState === 'saving'}
              onClick={onBack}
              type="button"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-[40rem] gap-4 lg:grid-cols-[1fr_300px]">
      <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-[1.4rem] border border-black/5 bg-black shadow-glow">
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
              className={`absolute inset-0 shadow-[0_30px_80px_rgba(0,0,0,0.38)] transition-all duration-300 ${
                capturePhase >= 0 && poseOk
                  ? 'ring-2 ring-emerald-400/80 shadow-[0_0_50px_rgba(16,185,129,0.32)]'
                  : capturePhase >= 0
                    ? 'ring-2 ring-blue-400/60 shadow-[0_0_40px_rgba(59,130,246,0.20)]'
                    : faceFound
                      ? 'ring-2 ring-emerald-400/70 shadow-[0_0_30px_rgba(16,185,129,0.24)]'
                      : 'ring-1 ring-white/18'
              }`}
              style={OVAL_FRAME_STYLE}
            />
            <div className="absolute inset-[2px] overflow-hidden bg-black" style={OVAL_FRAME_STYLE}>
              <video
                ref={setVideoRef}
                playsInline
                muted
                autoPlay
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(0,0,0,0.1)_54%,rgba(0,0,0,0.36)_100%)]" />
            </div>
          </div>
        </div>

        {!camOn && (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/60 text-center text-white">
            <div className="text-5xl opacity-60">◈</div>
            <div className="text-sm">{camError || 'Camera offline'}</div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-4 z-[5] flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-full border border-white/20 bg-black/60 px-5 py-2 backdrop-blur">
            <div className="flex items-center gap-1.5">
              {CAPTURE_PHASES.map((phase, index) => (
                <div key={phase.id} className="flex items-center">
                  <div
                    className={`h-2 w-2 rounded-full transition-all ${
                      index < capturePhase
                        ? 'bg-emerald-400'
                        : index === capturePhase
                          ? poseOk
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                          : 'bg-white/30'
                    }`}
                  />
                  {index < CAPTURE_PHASES.length - 1 && (
                    <div className={`h-px w-2 ${index < capturePhase ? 'bg-emerald-400' : 'bg-white/30'}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="h-4 w-px bg-white/20" />
            <span className={`text-sm font-medium ${poseOk ? 'text-emerald-300' : 'text-white/80'}`}>
              {statusMsg}
            </span>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-3">
        <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Admin live re-enrollment</div>
          <h3 className="mt-2 text-xl font-bold text-ink">{person.name}</h3>
          <p className="mt-1 text-sm text-muted">{person.employeeId} · {person.officeName}</p>
        </div>

        <div className="grid gap-3 pt-1">
          <button
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
            onClick={onBack}
            type="button"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
