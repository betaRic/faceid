import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'
import FaceSizeGuidance from '@/components/biometrics/FaceSizeGuidance'
import {
  MIN_TRACK_LONG_SIDE,
  MIN_TRACK_SHORT_SIDE,
  REQUIRED_TRACK_FACING_MODE,
} from '@/lib/attendance/capture-policy'
import { getMotionInstruction } from '@/lib/attendance/challenge-policy'

const OVAL_STYLE = { borderRadius: '44% / 34%' }

function getSelfChecks(camera, locationState, modelsReady) {
  const trackSettings = camera?.getTrackSettings?.() || {}
  const width = Number(trackSettings.width || 0)
  const height = Number(trackSettings.height || 0)
  const shortSide = width > 0 && height > 0 ? Math.min(width, height) : 0
  const longSide = width > 0 && height > 0 ? Math.max(width, height) : 0
  const facingMode = String(trackSettings.facingMode || '').toLowerCase()
  const resolutionReady = shortSide >= MIN_TRACK_SHORT_SIDE && longSide >= MIN_TRACK_LONG_SIDE
  const facingReady = !facingMode || facingMode === REQUIRED_TRACK_FACING_MODE

  return [
    {
      key: 'models',
      label: 'Models',
      ready: Boolean(modelsReady),
      detail: modelsReady ? 'Ready' : 'Loading',
    },
    {
      key: 'camera',
      label: 'Camera',
      ready: Boolean(camera?.camOn),
      detail: camera?.camOn ? 'Ready' : (camera?.camError || 'Unavailable'),
    },
    {
      key: 'facing',
      label: 'Front camera',
      ready: facingReady,
      detail: facingMode || 'Unknown',
    },
    {
      key: 'location',
      label: 'Location',
      ready: Boolean(locationState?.ready),
      detail: locationState?.ready ? 'Verified' : 'Required',
    },
    {
      key: 'resolution',
      label: 'Resolution',
      ready: resolutionReady,
      detail: width > 0 && height > 0 ? `${width}x${height}` : 'Pending',
    },
  ]
}

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
  modelsReady,
}) {
  const selfChecks = getSelfChecks(camera, locationState, modelsReady)
  const motionInstruction = getMotionInstruction(challengeState?.motionType || '')
  const locationBadgeLabel = locationState?.ready
    ? 'Location ready'
    : 'Location required'

  const wifiStatus = locationState?.wifiSsid
    ? `WiFi: ${locationState.wifiSsid}`
    : 'WiFi: not available'

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
      ? '✓ Verified'
      : isBlocked
        ? 'Try again'
        : isUnknown
          ? 'Face not recognized'
          : isScanning
            ? 'Face detected — hold steady'
            : camera.camOn
              ? 'Ready — look at camera'
              : 'Camera off'

  return (
    <>
      {/* Oval camera view */}
      <div className="absolute inset-0 flex items-center justify-center">
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

      {/* State flash overlays */}
      {isConfirmed && <div key={flashKey} className="absolute inset-0 z-[3] bg-emerald-400/15 animate-pulse" />}
      {(isBlocked || isUnknown) && <div className="absolute inset-0 z-[3] bg-red-500/10" />}

      {/* Clock — top right */}
      <div className="absolute right-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-right shadow-lg backdrop-blur sm:right-5 sm:top-5 sm:px-5 sm:py-3">
        <div className="font-display text-lg leading-none text-white sm:text-3xl">{clock}</div>
        <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-100/88 sm:text-xs">{dateStr}</div>
      </div>

      {/* Location status — top left */}
      <div className="absolute left-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-left shadow-lg backdrop-blur sm:left-5 sm:top-5 sm:px-5 sm:py-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100/92 sm:text-xs">{locationBadgeLabel}</div>
        <div className="mt-1 text-xs text-slate-100/92 sm:text-sm">{locationState?.status || 'Checking location'}</div>
        <div className="mt-1 text-[9px] text-slate-100/70 sm:text-xs">{wifiStatus}</div>
      </div>

      {challengeState ? (
        <div className="absolute inset-x-3 top-24 z-[4] flex justify-center sm:inset-x-5 sm:top-28">
          <div className="w-full max-w-md rounded-[1.35rem] border border-amber-300/50 bg-amber-50/95 px-4 py-4 text-center shadow-2xl backdrop-blur sm:px-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900/80">
              {motionInstruction.title}
            </div>
            <div className="mt-2 text-base font-semibold text-amber-950 sm:text-lg">
              {motionInstruction.label}
            </div>
            <div className="mt-2 text-xs text-amber-900/80">
              Keep your face inside the oval until the prompt finishes.
            </div>
          </div>
        </div>
      ) : null}

      {/* Status pill — hidden when blocked/unknown (alert takes over) */}
      {!isBlocked && !isUnknown && (
        <div className="absolute inset-x-0 bottom-16 z-[4] flex justify-center pointer-events-none sm:bottom-20">
          <div className={`rounded-full px-5 py-2 text-sm font-semibold backdrop-blur shadow-lg ${
            isVerifying
              ? 'bg-blue-500/80 text-white'
              : isChallenge
                ? 'bg-amber-500/85 text-slate-950'
              : isConfirmed
                ? 'bg-emerald-500/80 text-white'
                : 'bg-black/50 text-white/80'
          }`}>
            {statusMessage}
          </div>
        </div>
      )}

      {/* Distance indicator bar — hidden during verification, confirmed, blocked, or unknown */}
      {faceDistanceInfo && !isVerifying && !isConfirmed && !isBlocked && !isUnknown && (
        <div className="absolute inset-x-0 bottom-28 z-[4] flex justify-center px-4 pointer-events-none sm:bottom-32">
          <FaceSizeGuidance className="w-full max-w-sm" compact guidance={faceDistanceInfo} theme="dark" />
        </div>
      )}

      <div className="absolute inset-x-3 bottom-3 z-[4] sm:inset-x-5 sm:bottom-5">
        <div className="grid grid-cols-2 gap-2 rounded-[1.2rem] border border-white/12 bg-slate-950/72 p-3 shadow-xl backdrop-blur sm:grid-cols-5">
          {selfChecks.map(check => (
            <div
              key={check.key}
              className={`rounded-xl border px-3 py-2 ${
                check.ready
                  ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50'
                  : 'border-white/10 bg-white/5 text-slate-100'
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200/70">
                {check.label}
              </div>
              <div className="mt-1 text-sm font-semibold">{check.ready ? 'OK' : 'Check'}</div>
              <div className="mt-1 text-[11px] text-slate-200/70">{check.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Camera off overlay */}
      {!camera.camOn && (
        <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
          <div className="text-5xl opacity-60">◈</div>
          <div className="text-sm font-medium">{camera.camError || 'Camera idle'}</div>
        </div>
      )}
    </>
  )
}
