import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'
import CaptureDistanceHud from '@/components/biometrics/CaptureDistanceHud'
import CaptureGuideHud from '@/components/biometrics/CaptureGuideHud'
import { toCompactGuideLabel } from '@/lib/biometrics/compact-guide-copy'
import { Icon } from '@/components/ui'

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
  locationState,
  faceDistanceInfo,
}) {
  const locationBadgeLabel = locationState?.ready ? 'Location ready' : 'Location required'

  const isScanning = kioskState === 'scanning'
  const isVerifying = kioskState === 'verifying'
  const hasCapturedFrame = Boolean(capturedFrameUrl)
  const showLiveVideo = !hasCapturedFrame

  const ringState = isVerifying
    ? 'ring-2 ring-blue-400/80'
    : isConfirmed
        ? 'ring-2 ring-emerald-400/80'
        : isBlocked || isUnknown
          ? 'ring-2 ring-red-400/80'
          : isScanning
            ? 'ring-2 ring-emerald-400/40'
            : 'ring-1 ring-white/18'

  const guideTitle = isVerifying
      ? 'Verifying'
      : isScanning
        ? (faceDistanceInfo?.isCaptureReady ? 'Hold steady' : 'Adjust distance')
        : toCompactGuideLabel(faceDistanceInfo?.label, 'Center face')

  const guideTone = isVerifying
      ? 'active'
      : isScanning
        ? (faceDistanceInfo?.isCaptureReady ? 'ready' : 'warn')
        : 'neutral'

  return (
    <>
      <div className="absolute inset-0 z-[0] bg-neutral-950" />

      <div className="absolute inset-x-0 top-3 z-[4] px-3 sm:top-4 sm:px-4">
        <div className="mx-auto flex w-full max-w-[24rem] flex-col gap-2 sm:max-w-none sm:flex-row sm:items-start sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:w-auto sm:min-w-[14rem] sm:grid-cols-1">
            <div className="rounded-control border border-white/20 bg-black/75 px-3 py-2 text-left">
              <div className="truncate text-[11px] font-semibold text-white/92">{locationBadgeLabel}</div>
            </div>
            <div className="rounded-control border border-white/20 bg-black/75 px-3 py-2 text-right sm:hidden">
              <div className="font-display text-sm leading-none text-white">{clock}</div>
              <div className="mt-1 text-[10px] text-white/70">{dateStr}</div>
            </div>
          </div>

          {!isBlocked && !isUnknown ? (
            <CaptureGuideHud
              className="w-full sm:max-w-[22rem]"
              title={guideTitle}
              tone={guideTone}
            />
          ) : null}

          <div className="hidden rounded-control border border-white/20 bg-black/75 px-3 py-2 text-right sm:block sm:min-w-[10rem]">
            <div className="font-display text-sm leading-none text-white sm:text-base">{clock}</div>
            <div className="mt-1 text-[10px] text-white/70">{dateStr}</div>
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
            className={`absolute inset-0 transition-colors duration-300 ${ringState}`}
            style={OVAL_STYLE}
          />
          <div className="absolute inset-[2px] overflow-hidden bg-black" style={OVAL_STYLE}>
            {showLiveVideo ? (
              <video
                ref={camera.setVideoRef}
                playsInline
                muted
                autoPlay
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <img
                alt="Verification frame"
                className="absolute inset-0 h-full w-full object-cover"
                src={capturedFrameUrl}
              />
            )}
            <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
            <div aria-hidden="true" className="absolute inset-0 border border-white/15" style={OVAL_STYLE} />
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
          <Icon name="scan" size={42} />
          <div className="text-sm font-medium">{camera.camError || 'Camera idle'}</div>
        </div>
      )}
    </>
  )
}
