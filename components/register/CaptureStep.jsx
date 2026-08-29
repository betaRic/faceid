'use client'

import CaptureDistanceHud from '@/components/biometrics/CaptureDistanceHud'
import CaptureGuideHud from '@/components/biometrics/CaptureGuideHud'
import { Button, Icon } from '@/components/ui'
import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'
import { CAPTURE_PHASES } from '@/hooks/useEnrollmentCapture'
import { toCompactGuideLabel } from '@/lib/biometrics/compact-guide-copy'

const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

export default function CaptureStep({
  camera,
  capturePhase,
  errorMessage,
  faceFound,
  faceSizeGuidance,
  onBack,
  onExit,
  poseOk,
  statusMsg,
}) {
  const phase = capturePhase >= 0 ? CAPTURE_PHASES[capturePhase] : null

  const guideTitle = phase
    ? toCompactGuideLabel(statusMsg || phase.label, 'Center face')
    : toCompactGuideLabel(faceFound ? (faceSizeGuidance?.label || statusMsg) : statusMsg, 'Center face')

  const guideTone = errorMessage
    ? 'danger'
    : phase
      ? (poseOk ? 'ready' : 'active')
      : faceFound
        ? (faceSizeGuidance?.isCaptureReady ? 'ready' : 'warn')
        : 'neutral'

  const guideSteps = CAPTURE_PHASES.map((step, index) => ({
    id: step.id,
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

  return (
    <div className="page-frame h-full min-h-0">
      <section
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-surface border border-line bg-black"
      >
        <div className="absolute inset-0 z-[1] bg-black/30" />

        <div className="absolute inset-x-0 top-3 z-[6] px-3 sm:top-4 sm:px-4">
          <div className="mx-auto flex w-full max-w-[24rem] flex-col gap-2 sm:max-w-[26rem]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Button
                className="min-w-0 border-white/20 bg-black/55 text-white hover:bg-black/75"
                onClick={onBack}
                variant="secondary"
              >
                <Icon name="arrow-left" /><span className="truncate">Details</span>
              </Button>
              {onExit ? (
                <Button
                  className="border-white/20 bg-black/55 text-white hover:bg-black/75"
                  onClick={onExit}
                  variant="secondary"
                >
                  Exit
                </Button>
              ) : null}
            </div>

            <CaptureGuideHud
              className="w-full"
              steps={guideSteps}
              title={guideTitle}
              tone={guideTone}
            />
          </div>
        </div>

        <div className="relative z-[2] flex min-h-0 flex-1 items-center justify-center px-4 pb-20 pt-[7.5rem] sm:px-6 sm:pb-24 sm:pt-32">
          <div
            className="relative w-[74vw] sm:w-[54vw]"
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
                      ? faceSizeGuidance?.isCaptureReady
                        ? 'ring-2 ring-emerald-400/70'
                        : 'ring-2 ring-amber-400/70 shadow-[0_0_30px_rgba(251,191,36,0.24)]'
                      : 'ring-1 ring-white/18'
              }`}
              style={OVAL_FRAME_STYLE}
            />
            <div className="absolute inset-[2px] overflow-hidden bg-black" style={OVAL_FRAME_STYLE}>
              <video ref={camera.setVideoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(0,0,0,0.1)_54%,rgba(0,0,0,0.36)_100%)]" />
            </div>
          </div>
        </div>

        {!camera.camOn ? (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/60 text-center text-white">
            <Icon className="opacity-70" name="alert" size={36} />
            <div className="text-sm">{camera.camError || 'Camera offline'}</div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="absolute inset-x-3 bottom-24 z-[5] rounded-control border border-destructive-line bg-destructive-surface px-4 py-3 text-sm text-destructive sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 z-[5] flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
          <CaptureDistanceHud
            className="w-full max-w-[18rem] sm:max-w-[20rem]"
            guidance={faceSizeGuidance}
          />
        </div>
      </section>
    </div>
  )
}
