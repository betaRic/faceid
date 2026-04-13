import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'

const OVAL_STYLE = { borderRadius: '50%' }

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
  todaysCount,
  errorMessage,
  faceDistanceInfo,
}) {
  const locationBadgeLabel = locationState?.ready
    ? 'Location ready'
    : locationState?.bypassed
      ? 'WFH fallback'
      : 'Location pending'

  const wifiStatus = locationState?.wifiSsid
    ? `WiFi: ${locationState.wifiSsid}`
    : 'WiFi: not available'

  const isScanning = kioskState === 'scanning'
  const isIdle = kioskState === 'idle'
  const isVerifying = kioskState === 'verifying'
  const hasCapturedFrame = Boolean(capturedFrameUrl)

  // Distance indicator based on faceAreaRatio
  const distanceStatus = faceDistanceInfo?.status || null
  const distanceLabel = distanceStatus === 'too-close' ? 'Move back' 
    : distanceStatus === 'perfect' ? 'Perfect distance'
    : distanceStatus === 'good' ? 'Getting closer'
    : distanceStatus === 'too-far' ? 'Get closer'
    : null
    
  const distanceColor = distanceStatus === 'too-close' ? 'bg-amber-500/80'
    : distanceStatus === 'perfect' ? 'bg-emerald-500/80'
    : distanceStatus === 'good' ? 'bg-blue-500/80'
    : 'bg-white/30'

  // Distance bar indicator (like pose arc in registration)
  const faceAreaRatio = faceDistanceInfo?.faceAreaRatio || 0
  // Map faceAreaRatio to bar position: 0.35 (far) -> 0.45 (good) -> 0.70 (close) -> 0.92 (too close)
  const getBarPosition = () => {
    if (faceAreaRatio <= 0.35) return 0    // Too far
    if (faceAreaRatio >= 0.92) return 100  // Too close
    if (faceAreaRatio >= 0.70) return 80   // Close
    if (faceAreaRatio >= 0.45) return 50   // Perfect
    return 20                                // Getting closer
  }
  const barPosition = getBarPosition()

  const ringState = isVerifying
    ? 'ring-2 ring-blue-400/80 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
    : isConfirmed
      ? 'ring-2 ring-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
      : isBlocked || isUnknown
        ? 'ring-2 ring-red-400/80'
        : isScanning
          ? 'ring-2 ring-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.18)]'
          : 'ring-1 ring-white/18'

  // Dynamic status messages - no more confusing "Align face"
  // Note: kioskState 'blocked' is used for multiple errors, not just multiple faces
  const statusMessage = isVerifying
    ? 'Verifying...'
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
      {/* Oval camera view — portrait, matches detection math (0.68 ratio) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative"
          style={{
            width: `min(72vw, calc(min(80vh, 660px) * ${OVAL_CAPTURE_ASPECT_RATIO}))`,
            aspectRatio: String(OVAL_CAPTURE_ASPECT_RATIO),
          }}
        >
          {/* Ring border — state-aware color */}
          <div
            className={`absolute inset-0 shadow-[0_30px_80px_rgba(0,0,0,0.38)] transition-all duration-300 ${ringState}`}
            style={OVAL_STYLE}
          />
          {/* Video clipped to oval */}
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
              />
            )}
            <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
            {/* Vignette */}
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

      {/* Status pill — anchored to bottom, above any footer chrome */}
      <div className="absolute inset-x-0 bottom-16 z-[4] flex justify-center pointer-events-none sm:bottom-20">
        <div className={`rounded-full px-5 py-2 text-sm font-semibold backdrop-blur shadow-lg ${
          isVerifying
            ? 'bg-blue-500/80 text-white'
            : isConfirmed
              ? 'bg-emerald-500/80 text-white'
              : isBlocked || isUnknown
                ? 'bg-red-500/80 text-white'
                : 'bg-black/50 text-white/80'
        }`}>
          {statusMessage}
        </div>
      </div>

      {/* Distance indicator - visual bar like registration pose arc */}
      {faceDistanceInfo && !isVerifying && !isConfirmed && (
        <div className="absolute inset-x-0 bottom-28 z-[4] flex flex-col items-center gap-2 pointer-events-none sm:bottom-32">
          {/* Distance bar with position indicator */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-white/50">FAR</span>
            <div className="relative h-2 w-32 overflow-hidden rounded-full bg-white/20">
              {/* Background zones */}
              <div className="absolute inset-0 flex">
                <div className="h-full w-1/4 bg-amber-500/40" />
                <div className="h-full w-1/4 bg-blue-500/40" />
                <div className="h-full w-1/4 bg-emerald-500/40" />
                <div className="h-full w-1/4 bg-amber-500/40" />
              </div>
              {/* Position marker */}
              <div 
                className={`absolute top-0 h-full w-1.5 rounded-full transition-all duration-200 ${
                  distanceStatus === 'perfect' ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' :
                  distanceStatus === 'good' ? 'bg-blue-400 shadow-lg shadow-blue-400/50' :
                  distanceStatus === 'too-close' ? 'bg-amber-400 shadow-lg shadow-amber-400/50' :
                  'bg-white/70'
                }`}
                style={{ left: `${barPosition}%`, transform: 'translateX(-50%)' }}
              />
            </div>
            <span className="text-[10px] font-medium text-white/50">CLOSE</span>
          </div>
          {/* Distance label */}
          <div className={`rounded-full px-3 py-1 text-xs font-semibold backdrop-blur shadow-lg ${distanceColor}`}>
            {distanceLabel}
          </div>
        </div>
      )}

      {/* Today's attendance count — bottom left */}
      {todaysCount != null && (
        <div className="absolute bottom-3 left-3 z-[4] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 shadow-lg backdrop-blur sm:left-5 sm:bottom-5 sm:px-5 sm:py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100/92 sm:text-xs">Today&apos;s attendance</div>
          <div className="mt-0.5 font-display text-xl text-white sm:text-2xl">{todaysCount}</div>
        </div>
      )}

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
