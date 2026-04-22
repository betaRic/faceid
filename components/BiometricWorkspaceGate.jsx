'use client'

export default function BiometricWorkspaceGate({
  page,
  bootStage,
  modelStatus,
  errorMessage,
  locationState,
  onRetry,
  loadingLabel = '',
}) {
  const title = page === 'register' ? 'Preparing enrollment workspace' : 'Preparing scan workspace'
  const detail = errorMessage
    ? errorMessage
    : bootStage === 'location'
      ? 'Checking verified device location before the camera is shown. Public scan attendance will not start without GPS.'
      : bootStage === 'camera'
        ? 'Starting the camera only after biometric models are fully ready.'
        : 'Loading biometric models before the camera is shown to the user.'
  const statusLabel = errorMessage
    ? 'Workspace blocked'
    : bootStage === 'location'
      ? 'Checking location'
      : bootStage === 'camera'
        ? 'Starting camera'
        : 'Loading biometric runtime'
  const runtimeStatus = errorMessage
    ? (bootStage === 'location' ? (locationState?.status || 'Location unavailable') : modelStatus)
    : bootStage === 'location'
      ? (locationState?.status || 'Checking location')
      : modelStatus

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-4xl flex-1 items-center justify-center">
      <div className="w-full rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(12,108,88,0.08),rgba(255,255,255,0.98))] p-6 shadow-glow backdrop-blur sm:p-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-navy-dark">{statusLabel}</div>
          <h1 className="mt-4 font-display text-2xl text-ink sm:text-4xl lg:text-5xl">{title}</h1>
          <p className="mt-4 text-sm leading-8 text-muted sm:text-base">
            {detail}
          </p>

          <div className="mt-8 rounded-[1.5rem] border border-black/5 bg-white/90 p-5 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy/10 text-navy-dark">
              <span className={`h-6 w-6 rounded-full border-2 border-current border-t-transparent ${errorMessage ? '' : 'animate-spin'}`} />
            </div>
            <div className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted">Runtime status</div>
            <div className="mt-2 text-lg font-semibold text-ink">{runtimeStatus}</div>
            {loadingLabel ? (
              <div className="mt-3 text-sm text-amber-600">{loadingLabel}</div>
            ) : null}
            {bootStage === 'location' && locationState?.error ? (
              <div className="mt-3 rounded-[1rem] bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900">
                {locationState.error}
              </div>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                className="inline-flex items-center justify-center rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark"
                onClick={onRetry}
                type="button"
              >
                Retry workspace startup
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
