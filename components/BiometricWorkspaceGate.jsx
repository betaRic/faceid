'use client'

import DilgLoadingIndicator from '@/components/shared/DilgLoadingIndicator'

export default function BiometricWorkspaceGate({
  page,
  bootStage,
  modelStatus,
  errorMessage,
  locationState,
  onRequestPermissions,
  onRetry,
  permissionRequestPending = false,
  loadingLabel = '',
}) {
  const title = page === 'register' ? 'Preparing enrollment workspace' : 'Preparing scan workspace'
  const needsPermission = bootStage === 'permission'
  const detail = errorMessage
    ? errorMessage
    : needsPermission
      ? 'For privacy, your browser will ask for Camera and Location only after you tap the button below. Both are required before attendance scanning can begin.'
    : bootStage === 'location'
      ? 'Checking verified device location before the camera is shown. Public scan attendance will not start without GPS.'
      : bootStage === 'camera'
        ? 'Starting the camera only after biometric models are fully ready.'
        : 'Loading biometric models before the camera is shown to the user.'
  const statusLabel = errorMessage
    ? 'Workspace blocked'
    : needsPermission
      ? 'Permission required'
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
            <DilgLoadingIndicator compact label="" />
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

          {needsPermission && !errorMessage ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-wait disabled:opacity-70"
                disabled={permissionRequestPending}
                onClick={onRequestPermissions}
                type="button"
              >
                {permissionRequestPending ? 'Starting camera and checking location…' : 'Enable camera and location'}
              </button>
              <p className="basis-full text-xs leading-5 text-muted">
                On iPhone, use the trusted HTTPS address—not an IP address or localhost.
              </p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                className="inline-flex items-center justify-center rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark"
                onClick={bootStage === 'error' && onRequestPermissions ? onRequestPermissions : onRetry}
                type="button"
              >
                {bootStage === 'error' && onRequestPermissions ? 'Try permissions again' : 'Retry workspace startup'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
