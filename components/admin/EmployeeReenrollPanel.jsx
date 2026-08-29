'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBiometricRuntime } from '@/components/BiometricRuntimeProvider'
import CaptureDistanceHud from '@/components/biometrics/CaptureDistanceHud'
import CaptureGuideHud from '@/components/biometrics/CaptureGuideHud'
import { Button, ErrorState, Icon, LoadingState, Status, Surface } from '@/components/ui'
import { CAPTURE_PHASES, useEnrollmentCapture } from '@/hooks/useEnrollmentCapture'
import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'

const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

function InfoCard({ title, text, tone = 'default' }) {
  return (
    <Surface className={`p-4 ${tone === 'warn' ? 'border-warning-line bg-warning-surface text-warning' : ''}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6">{text}</p>
    </Surface>
  )
}

export default function EmployeeReenrollPanel({ person, onBack, onComplete }) {
  const runtime = useBiometricRuntime()
  const {
    bootStage,
    camera,
    workspaceReady,
    modelsReady,
    modelStatus,
    permissionRequestPending,
    requestPermissions,
    runtimeError,
    retry,
  } = runtime
  const camOn = camera.camOn
  const camError = camera.camError
  const setVideoRef = camera.setVideoRef
  const canvasRef = camera.canvasRef

  const [workspaceState, setWorkspaceState] = useState('loading')
  const [captureResult, setCaptureResult] = useState(null)
  const [saveError, setSaveError] = useState('')

  const {
    capturePhase,
    faceFound,
    faceNeedsAlignment,
    statusMsg,
    poseOk,
    faceSizeGuidance,
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
    if (!workspaceReady || workspaceState !== 'capture') return () => {}

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
  }, [workspaceReady, workspaceState, startDetect, stopDetect])

  const handleRetake = useCallback(() => {
    stopDetect()
    resetCapture()
    setCaptureResult(null)
    setSaveError('')
    setWorkspaceState('capture')
  }, [resetCapture, stopDetect])

  const handleSave = useCallback(async () => {
    if (!captureResult?.sampleFrames?.length) return

    setSaveError('')
    setWorkspaceState('saving')
    try {
      const response = await fetch(`/api/persons/${person.id}/reenroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleFrames: captureResult.sampleFrames,
          captureMetadata: captureResult.captureMetadata || null,
          photoDataUrl: captureResult.previewUrl || null,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setSaveError(payload?.message || 'Failed to save face data.')
        setWorkspaceState('review')
        return
      }

      onComplete({
        sampleCount: Number(payload?.sampleCount || captureResult.sampleFrames.length),
        message: payload?.message || '',
      })
    } catch (error) {
      setSaveError(error?.message || 'Failed to save face data.')
      setWorkspaceState('review')
    }
  }, [captureResult, onComplete, person.id])

  const captureStateLabel = useMemo(() => {
    if (capturePhase >= 0) return CAPTURE_PHASES[capturePhase]?.label || 'Capturing'
    if (faceSizeGuidance?.status && faceSizeGuidance.status !== 'not-detected') return faceSizeGuidance.label
    if (faceFound) return 'Face ready'
    if (faceNeedsAlignment) return 'Move into the oval'
    return 'Scanning for face'
  }, [capturePhase, faceFound, faceNeedsAlignment, faceSizeGuidance])

  const captureGuideTitle = CAPTURE_PHASES[capturePhase]?.label
    || faceSizeGuidance?.label
    || (faceNeedsAlignment ? 'Move into the oval' : 'Center your face')

  const captureGuideSubtitle = capturePhase >= 0
    ? (statusMsg || CAPTURE_PHASES[capturePhase]?.subtitle || 'Hold the requested pose.')
    : (statusMsg || faceSizeGuidance?.detail || 'Look straight ahead inside the oval to begin.')

  const captureGuideTone = capturePhase >= 0
    ? (poseOk ? 'ready' : 'active')
    : faceFound
      ? (faceSizeGuidance?.isCaptureReady ? 'ready' : 'warn')
      : 'neutral'

  const captureGuideSteps = CAPTURE_PHASES.map((phase, index) => ({
    id: phase.id,
    label: index === 0
      ? 'Center'
      : index === 1
        ? 'Turn 1'
        : index === 2
          ? 'Turn 2'
          : 'Chin down',
    complete: capturePhase > index,
    active: capturePhase === index,
  }))

  if (workspaceState === 'loading') {
    return (
      <Surface className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6">
        <LoadingState>Loading biometric workspace…</LoadingState>
        <p className="text-xs text-secondary">Starting models and camera for authorized profile refresh.</p>
      </Surface>
    )
  }

  if (workspaceState === 'error') {
    return (
      <div className="grid min-h-0 flex-1 content-center gap-4">
        <ErrorState description={runtimeError || 'Could not start camera or models.'} onRetry={retry} title="Biometric workspace failed" />
        <Button className="justify-self-center" onClick={onBack} variant="secondary">Back</Button>
      </div>
    )
  }

  if (workspaceState === 'waiting') {
    return (
      <Surface className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="text-center">
          {bootStage === 'permission' ? (
            <>
              <h3 className="text-lg font-bold text-ink">Camera permission required</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">Tap once to let the browser request the camera. Safari does not reliably show this prompt when it starts automatically.</p>
              <Button
                className="mt-5"
                disabled={permissionRequestPending}
                onClick={requestPermissions}
                type="button"
              >
                {permissionRequestPending ? 'Requesting camera…' : 'Enable camera'}
              </Button>
            </>
          ) : (
            <>
              <LoadingState className="justify-center">Starting camera…</LoadingState>
              <p className="mt-1 text-xs text-muted">{modelStatus}</p>
            </>
          )}
        </div>
      </Surface>
    )
  }

  if (workspaceState === 'review' || workspaceState === 'saving') {
    const burstSummary = captureResult?.burstSummary
    const qualitySummary = captureResult?.qualitySummary

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:overflow-hidden">
        <div className="flex min-h-[14rem] items-center justify-center overflow-hidden rounded-surface border border-line bg-stone-950 sm:min-h-[18rem]">
          {captureResult?.previewUrl ? (
            <img
              alt={`Captured face for ${person.name}`}
              className="max-h-[min(44vh,34rem)] w-full object-contain sm:max-h-[min(64vh,34rem)]"
              src={captureResult.previewUrl}
            />
          ) : (
            <div className="text-sm text-stone-300">No preview available.</div>
          )}
        </div>

        <div className="grid content-start gap-3">
          <Surface className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-secondary">Authorized profile refresh</div>
              <Status tone={burstSummary?.genuinelyDiverse ? 'success' : 'warning'}>
                {burstSummary?.genuinelyDiverse ? 'Quality good' : 'Retake advised'}
              </Status>
            </div>
            <h3 className="mt-2 text-xl font-bold text-ink">{person.name}</h3>
            <p className="mt-1 text-sm text-muted">{person.employeeId} · {person.officeName}</p>
          </Surface>

          {burstSummary && (
            <InfoCard
              title={burstSummary.genuinelyDiverse ? 'Capture quality good' : 'Retake recommended'}
              text={
                burstSummary.genuinelyDiverse
                  ? `${burstSummary.keptCount} support samples captured across the guided multi-pose flow.`
                  : 'The capture completed, but it did not keep 2 validated support frames for every pose. Retake for cleaner biometric separation.'
              }
              tone={burstSummary.genuinelyDiverse ? 'default' : 'warn'}
            />
          )}

          {qualitySummary?.tone === 'warn' && (
            <InfoCard title={qualitySummary.title} text={qualitySummary.text} tone="warn" />
          )}

          {saveError && (
            <div className="rounded-control border border-destructive-line bg-destructive-surface px-4 py-3 text-sm text-destructive" role="alert">
              {saveError}
            </div>
          )}

          <div className="grid gap-3 pt-1">
            <Button
              disabled={workspaceState === 'saving'}
              onClick={handleSave}
              type="button"
            >
              {workspaceState === 'saving' ? 'Saving face data…' : 'Save profile refresh'}
            </Button>
            <Button
              disabled={workspaceState === 'saving'}
              onClick={handleRetake}
              variant="secondary"
            >
              Retake capture
            </Button>
            <Button
              disabled={workspaceState === 'saving'}
              onClick={onBack}
              variant="quiet"
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:overflow-hidden">
      <div className="relative min-h-[18rem] w-full shrink-0 overflow-hidden rounded-surface border border-line bg-black sm:min-h-[28rem] xl:shrink xl:flex-1">
        <div className="absolute inset-0 z-[1] bg-neutral-950" />

        <div className="absolute inset-x-0 top-3 z-[5] flex justify-center px-3 sm:top-4 sm:px-4">
          <CaptureGuideHud
            className="w-full max-w-[22rem] sm:max-w-[26rem]"
            eyebrow="Admin live capture"
            steps={captureGuideSteps}
            subtitle={captureGuideSubtitle}
            title={captureGuideTitle}
            tone={captureGuideTone}
          />
        </div>

        <div className="absolute inset-0 z-[2] flex items-center justify-center px-4 pb-20 pt-24">
          <div
            className="relative w-[78vw] sm:w-[54vw]"
            style={{
              aspectRatio: String(OVAL_CAPTURE_ASPECT_RATIO),
              maxWidth: `min(430px, calc(min(72vh, 640px) * ${OVAL_CAPTURE_ASPECT_RATIO}))`,
            }}
          >
            <div
              className={`absolute inset-0 transition-colors duration-300 ${
                capturePhase >= 0 && poseOk
                  ? 'ring-2 ring-emerald-400/80'
                  : capturePhase >= 0
                    ? 'ring-2 ring-blue-400/60'
                    : faceFound
                      ? faceSizeGuidance?.isCaptureReady
                        ? 'ring-2 ring-emerald-400/70'
                        : 'ring-2 ring-amber-400/70'
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
              <div aria-hidden="true" className="absolute inset-0 border border-white/15" style={OVAL_FRAME_STYLE} />
            </div>
          </div>
        </div>

        {!camOn && (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/60 text-center text-white">
            <Icon name="scan" size={42} />
            <div className="text-sm">{camError || 'Camera offline'}</div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 z-[5] flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
          <CaptureDistanceHud
            className="w-full max-w-[18rem] sm:max-w-[20rem]"
            guidance={faceSizeGuidance}
          />
        </div>
      </div>

      <div className="grid content-start gap-3">
        <Surface className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-secondary">Authorized profile refresh</div>
            <Status tone="neutral">{captureStateLabel}</Status>
          </div>
          <h3 className="mt-2 text-xl font-bold text-ink">{person.name}</h3>
          <p className="mt-1 text-sm text-muted">{person.employeeId} · {person.officeName}</p>
        </Surface>

        <InfoCard
          title="Capture target"
          text="Use the same guided capture as registration: front, side, opposite side, then chin down. The system keeps 2 support frames per pose, with the face inside the shared green distance band."
        />

        <div className="grid gap-3 pt-1">
          <Button
            onClick={onBack}
            variant="secondary"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}
