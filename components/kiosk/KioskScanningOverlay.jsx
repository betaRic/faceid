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
      <video
        ref={camera.setVideoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      {hasCapturedFrame ? (
        <img alt="Verification frame" className="absolute inset-0 z-[1] h-full w-full object-cover" src={capturedFrameUrl} />
      ) : null}
      <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
      <canvas ref={camera.overlayRef} className="absolute inset-0 z-[2] h-full w-full" />

      {/* Oval capture guide - same as registration */}
      <div className="absolute inset-0 z-[3] flex items-center justify-center">
        <div className="relative w-full max-w-[540px] aspect-[4/3]">
          {/* Oval shape with guide lines - matching registration */}
          <svg 
            className="absolute inset-0 h-full w-full" 
            viewBox="0 0 540 405" 
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Background overlay */}
            <rect x="0" y="0" width="540" height="405" fill="rgba(0,0,0,0.35)" />
            {/* Cut out the oval */}
            <ellipse 
              cx="270" 
              cy="202.5" 
              rx="225" 
              ry="168" 
              fill="rgba(0,0,0,0)" 
              stroke="rgba(255,255,255,0.5)" 
              strokeWidth="3"
            />
            {/* Inner guide lines */}
            <ellipse 
              cx="270" 
              cy="202.5" 
              rx="180" 
              ry="134" 
              fill="rgba(0,0,0,0)" 
              stroke="rgba(255,255,255,0.25)" 
              strokeWidth="1"
              strokeDasharray="8 6"
            />
            {/* Center crosshair */}
            <line x1="270" y1="160" x2="270" y2="180" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            <line x1="270" y1="225" x2="270" y2="245" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            <line x1="230" y1="202.5" x2="250" y2="202.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            <line x1="290" y1="202.5" x2="310" y2="202.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          </svg>
          
          {/* Instruction text overlay */}
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <div className="inline-block rounded-full bg-black/60 px-6 py-2 text-sm font-medium text-white backdrop-blur">
              Position your face in the oval
            </div>
          </div>
        </div>
      </div>

      {/* Scanning state indicator */}
      {isScanning ? <div className="absolute inset-0 z-[3] border-2 border-navy/80 shadow-[inset_0_0_60px_rgba(12,108,88,0.25)]" /> : null}
      {isConfirmed ? <div key={flashKey} className="absolute inset-0 z-[3] bg-emerald-400/20 animate-pulse" /> : null}
      {isBlocked || isUnknown ? <div className="absolute inset-0 z-[3] bg-red-500/10" /> : null}

      <div className="absolute right-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-right shadow-lg backdrop-blur sm:right-5 sm:top-5 sm:px-5 sm:py-3">
        <div className="font-display text-lg leading-none text-white sm:text-3xl">{clock}</div>
        <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-100/88 sm:text-xs">{dateStr}</div>
      </div>
      <div className="absolute left-3 top-3 z-[4] max-w-[calc(100%-1.5rem)] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 text-left shadow-lg backdrop-blur sm:left-5 sm:top-5 sm:px-5 sm:py-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100/92 sm:text-xs">{locationBadgeLabel}</div>
        <div className="mt-1 text-xs text-slate-100/92 sm:text-sm">{locationState?.status || 'Checking location'}</div>
        <div className="mt-1 text-[9px] text-slate-100/70 sm:text-xs">{wifiStatus}</div>
      </div>

      {todaysCount != null && (
        <div className="absolute bottom-3 left-3 z-[4] rounded-[1.1rem] border border-white/16 bg-slate-950/72 px-3.5 py-2 shadow-lg backdrop-blur sm:left-5 sm:bottom-5 sm:px-5 sm:py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100/92 sm:text-xs">Today's attendance</div>
          <div className="mt-0.5 font-display text-xl text-white sm:text-2xl">{todaysCount}</div>
        </div>
      )}

      {!camera.camOn ? (
        <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-white">
          <div className="text-5xl opacity-60">◈</div>
          <div className="text-sm font-medium">{camera.camError || 'Camera idle'}</div>
        </div>
      ) : null}
    </>
  )
}