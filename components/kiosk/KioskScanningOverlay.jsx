import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'
import CaptureDistanceHud from '@/components/biometrics/CaptureDistanceHud'
import CaptureGuideHud from '@/components/biometrics/CaptureGuideHud'
import { toCompactGuideLabel } from '@/lib/biometrics/compact-guide-copy'

const OVAL_STYLE = { borderRadius: '44% / 34%' }

export default function KioskScanningOverlay({
  camera,
  kioskState,
  capturedFrameUrl,
  isConfirmed,
  isBlocked,
  isUnknown,
  flashKey,
  clock,
  dateStr,
  challengeState,
  locationState,
  faceDistanceInfo,
}) {
  const locationBadgeLabel = locationState?.ready ? 'Location ready' : 'Location required'

  const isChallenge = kioskState === 'challenge'
  const isScanning = kioskState === 'scanning'
  const isVerifying = kioskState === 'verifying'
  const hasCapturedFrame = Boolean(capturedFrameUrl)

  const ringState = isVerifying
    ? 'ring-2 ring-blue-400/80 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
    : isChallenge
      ? 'ring-2 ring-amber-400/80 shadow-[0_0_28px_rgba(251,191,36,0.28)]'
      : isConfirmed
        ? 'ring-2 ring-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
        : isBlocked || isUnknown
          ? 'ring-2 ring-red-400/80'
          : isScanning
            ? 'ring-2 ring-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.18)]'
            : 'ring-1 ring-white/18'

  const statusMessage = isVerifying
    ? 'Verifying...'
    : isChallenge
      ? 'Complete the active liveness check'
      : isConfirmed
        ? 'Verified'
        : isBlocked
          ? 'Try again'
          : isUnknown
            ? 'Face not recognized'
            : isScanning
              ? 'Face detected — hold steady'
              : camera.camOn
                ? 'Ready — look at camera'
                : 'Camera off'

  const guideTitle = isChallenge
    ? toCompactGuideLabel(challengeState?.prompt || 'Follow the liveness prompt', 'Follow prompt')
    : isVerifying
      ? 'Verifying'
      : isScanning
        ? toCompactGuideLabel(faceDistanceInfo?.isCaptureReady ? 'Hold steady' : faceDistanceInfo?.label, 'Adjust distance')
        : toCompactGuideLabel(faceDistanceInfo?.label, 'Center face')

  const guideTone = isChallenge
    ? 'warn'
    : isVerifying
      ? 'active'
      : isScanning
        ? (faceDistanceInfo?.isCaptureReady ? 'ready' : 'warn')
        : 'neutral'

  return (
    <>
      <div className="absolute inset-0 z-[0] bg-[radial-gradient(circle_at_top,rgba(17,133,108,0.12),transparent_40%),linear-gradient(180deg,rgba(2,8,7,0.96),rgba(5,8,8,0.99))]" />

      <div className="absolute inset-x-0 top-3 z-[4] px-3 sm:top-4 sm:px-4">
        <div className="mx-auto flex w-full max-w-[24rem] flex-col gap-2 sm:max-w-none sm:flex-row sm:items-start sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:w-auto sm:min-w-[14rem] sm:grid-cols-1">
            <div className="rounded-full border border-white/12 bg-slate-950/58 px-3 py-2 text-left shadow-lg backdrop-blur-xl">
              <div className="truncate text-[11px] font-semibold text-white/92">{locationBadgeLabel}</div>
            </div>
            <div className="rounded-full border border-white/12 bg-slate-950/58 px-3 py-2 text-right shadow-lg backdrop-blur-xl sm:hidden">
              <div className="font-display text-sm leading-none text-white">{clock}</div>
            </div>
          </div>

          {!isBlocked && !isUnknown ? (
            <CaptureGuideHud
              className="w-full sm:max-w-[22rem]"
              title={guideTitle}
              tone={guideTone}
            />
          ) : null}

          <div className="hidden rounded-full border border-white/12 bg-slate-950/58 px-3 py-2 text-right shadow-lg backdrop-blur-xl sm:block sm:min-w-[10rem]">
            <div className="font-display text-sm leading-none text-white sm:text-base">{clock}</div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 z-[1] flex items-center justify-center px-4 pb-20 pt-[7.25rem] sm:px-6 sm:pb-24 sm:pt-24">
        <div
          className="relative"
          style={{
            width: `min(72vw, calc(min(80vh, 660px) * ${OVAL_CAPTURE_ASPECT_RATIO}))`,
            aspectRatio: String(OVAL_CAPTURE_ASPECT_RATIO),
          }}
        >
          <div
            className={`absolute inset-0 shadow-[0_30px_80px_rgba(0,0,0,0.38)] transition-all duration-300 ${ringState}`}
            style={OVAL_STYLE}
          />
          <div className="absolute inset-[2px] overflow-hidden bg-black" style={OVAL_STYLE}>
            {hasCapturedFrame ? (
              <img
                alt="Verification frame"
                className="absolute inset-0 h-full w-full object-cover"
                src={capturedFrameUrl}
              />
            ) : (
              <video
                ref={camera.setVideoRef}
                playsInline
                muted
                autoPlay
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}
            <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(0,0,0,0.1)_54%,rgba(0,0,0,0.36)_100%)]" />
          </div>
        </div>
      </div>

      <canvas ref={camera.overlayRef} className="absolute inset-0 z-[2] h-full w-full" />

      {isConfirmed && <div key={flashKey} className="absolute inset-0 z-[3] bg-emerald-400/15 animate-pulse" />}
      {(isBlocked || isUnknown) && <div className="absolute inset-0 z-[3] bg-red-500/10" />}

      {faceDistanceInfo && !isVerifying && !isConfirmed && !isBlocked && !isUnknown && (
        <div className="absolute inset-x-0 bottom-0 z-[4] flex justify-center px-3 pb-3 pointer-events-none sm:px-4 sm:pb-4">
          <CaptureDistanceHud className="w-full max-w-[18rem] sm:max-w-[20rem]" guidance={faceDistanceInfo} />
        </div>
      )}

      {!camera.camOn && (
        <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
          <div className="text-5xl opacity-60">◈</div>
          <div className="text-sm font-medium">{camera.camError || 'Camera idle'}</div>
        </div>
      )}
    </>
  )
}
