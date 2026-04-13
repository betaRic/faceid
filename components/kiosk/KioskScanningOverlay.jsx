const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

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
  const hasCapturedFrame = Boolean(capturedFrameUrl)
  const videoRef = camera.videoRef.current
  const hasStream = videoRef?.srcObject != null

  return (
    <>
      {/* Video container with OVAL CLIP - same as registration, NOT full-screen */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Oval frame - video only appears inside this clipped area */}
        <div
          className="relative w-[78vw] sm:w-[54vw]"
          style={{
            aspectRatio: '4/3',
            maxWidth: 'min(430px, calc(min(72vh, 640px) * 4/3))',
          }}
        >
          {/* Outer ring with glow */}
          <div
            className={`absolute inset-0 shadow-[0_30px_80px_rgba(0,0,0,0.38)] transition-all duration-200 ${
              isScanning
                ? 'ring-2 ring-emerald-400/70 shadow-[0_0_0_1px_rgba(74,222,128,0.15),0_30px_80px_rgba(0,0,0,0.38),0_0_50px_rgba(16,185,129,0.24)]'
                : 'ring-1 ring-white/18'
            }`}
            style={OVAL_FRAME_STYLE}
          />
          
          {/* Video (or captured frame) clipped INSIDE oval - exactly like registration */}
          <div
            className="absolute inset-[2px] overflow-hidden bg-black"
            style={OVAL_FRAME_STYLE}
          >
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
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(0,0,0,0.1)_54%,rgba(0,0,0,0.36)_100%)]" />
          </div>
        </div>
      </div>

      <canvas ref={camera.overlayRef} className="absolute inset-0 z-[2] h-full w-full" />

      {/* Scanning state indicator */}
      {isScanning ? <div className="absolute inset-0 z-[3] border-2 border-navy/80 shadow-[inset_0_0_60px_rgba(12,108,88,0.25)]" /> : null}
      {isConfirmed ? <div key={flashKey} className="absolute inset-0 z-[3] bg-emerald-400/20 animate-pulse" /> : null}
      {isBlocked || isUnknown ? <div className="absolute inset-0 z-[3] bg-red-500/10" /> : null}

      {/* Clock and date - top right */}
      <div className="absolute right-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-right shadow-lg backdrop-blur sm:right-5 sm:top-5 sm:px-5 sm:py-3">
        <div className="font-display text-lg leading-none text-white sm:text-3xl">{clock}</div>
        <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-100/88 sm:text-xs">{dateStr}</div>
      </div>

      {/* Location status - top left */}
      <div className="absolute left-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-left shadow-lg backdrop-blur sm:left-5 sm:top-5 sm:px-5 sm:py-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100/92 sm:text-xs">{locationBadgeLabel}</div>
        <div className="mt-1 text-xs text-slate-100/92 sm:text-sm">{locationState?.status || 'Checking location'}</div>
        <div className="mt-1 text-[9px] text-slate-100/70 sm:text-xs">{wifiStatus}</div>
      </div>

      {/* Today's attendance count - bottom left */}
      {todaysCount != null && (
        <div className="absolute bottom-3 left-3 z-[4] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 shadow-lg backdrop-blur sm:left-5 sm:bottom-5 sm:px-5 sm:py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100/92 sm:text-xs">Today&apos;s attendance</div>
          <div className="mt-0.5 font-display text-xl text-white sm:text-2xl">{todaysCount}</div>
        </div>
      )}

      {/* Camera off overlay */}
      {!camera.camOn ? (
        <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
          <div className="text-5xl opacity-60">◈</div>
          <div className="text-sm font-medium">{camera.camError || 'Camera idle'}</div>
        </div>
      ) : null}
    </>
  )
}