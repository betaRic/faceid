'use client'

import { Button, ErrorState, LoadingState, Status, Surface } from '@/components/ui'

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
      ? 'Allow Camera and Location after selecting the button below. Both are required before attendance scanning can begin.'
      : bootStage === 'location'
        ? 'Checking the device location before the camera is shown.'
        : bootStage === 'camera'
          ? 'Starting the camera after the biometric runtime is ready.'
          : 'Loading the biometric runtime before the camera is shown.'
  const runtimeStatus = bootStage === 'location'
    ? (locationState?.status || 'Checking location')
    : modelStatus

  if (errorMessage) {
    return (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-1 items-center justify-center p-4">
        <ErrorState
          description={detail}
          headingLevel={1}
          onRetry={bootStage === 'error' && onRequestPermissions ? onRequestPermissions : onRetry}
          title={title}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 items-center justify-center p-4">
      <Surface className="w-full p-5 sm:p-7">
        <Status tone={needsPermission ? 'pending' : 'neutral'}>
          {needsPermission ? 'Permission required' : 'Workspace starting'}
        </Status>
        <h1 className="mt-4 text-2xl font-semibold text-primary sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-secondary">{detail}</p>

        <div className="mt-6 border-t border-line pt-5">
          <LoadingState label={loadingLabel || runtimeStatus || 'Loading biometric runtime…'} />
          {bootStage === 'location' && locationState?.error ? (
            <div className="mt-4 rounded-control border border-warning-line bg-warning-surface px-4 py-3 text-sm text-warning" role="alert">
              {locationState.error}
            </div>
          ) : null}
        </div>

        {needsPermission ? (
          <div className="mt-6">
            <Button disabled={permissionRequestPending} onClick={onRequestPermissions}>
              {permissionRequestPending ? 'Starting camera and checking location…' : 'Enable camera and location'}
            </Button>
            <p className="mt-3 text-xs leading-5 text-secondary">On iPhone, use the trusted HTTPS address—not an IP address or localhost.</p>
          </div>
        ) : null}
      </Surface>
    </div>
  )
}
