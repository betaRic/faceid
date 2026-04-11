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

      <div className="absolute inset-0 z-[3] bg-gradient-to-b from-black/35 via-transparent to-black/25" />
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