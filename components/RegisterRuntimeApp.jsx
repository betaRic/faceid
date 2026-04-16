'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from './AppShell'
import BiometricWorkspaceGate from './BiometricWorkspaceGate'
import RegisterView from './RegisterView'
import { useBiometricRuntime } from './BiometricRuntimeProvider'
import { subscribeToPublicOffices } from '@/lib/office-store'
import { upsertPersonSample } from '@/lib/data-store'

export default function RegisterRuntimeApp() {
  const router = useRouter()
  const runtime = useBiometricRuntime()
  const {
    camera,
    modelStatus,
    modelsReady,
    runtimeError,
    bootStage,
    workspaceReady,
    retry,
    locationState,
    continueWithoutLocation,
    canBypassLocation,
  } = runtime

  const [offices, setOffices] = useState([])
  const [officeError, setOfficeError] = useState(null)
  const [officesLoading, setOfficesLoading] = useState(true)

  useEffect(() => {
    setOfficesLoading(true)
    const unsubscribe = subscribeToPublicOffices(
      nextOffices => {
        setOffices(nextOffices)
        setOfficeError(null)
        setOfficesLoading(false)
      },
      error => {
        setOfficeError(error instanceof Error ? error.message : 'Failed to load offices.')
        setOfficesLoading(false)
      },
    )

    return unsubscribe
  }, [])

  async function handleEnrollPerson(profile, descriptors) {
    return upsertPersonSample([], profile, descriptors)
  }

  const blockingError = officeError && offices.length === 0
    ? officeError
    : (!officesLoading && offices.length === 0)
      ? 'No offices are available for registration.'
      : runtimeError
  const routeReady = workspaceReady && !officesLoading && offices.length > 0

  if (!routeReady) {
    return (
      <AppShell fitViewport contentClassName="px-4 py-6 sm:px-6 lg:px-8">
        <div className="page-frame h-full min-h-0">
          <BiometricWorkspaceGate
            bootStage={bootStage}
            canBypassLocation={canBypassLocation}
            errorMessage={blockingError}
            loadingLabel={officesLoading ? 'Loading office list...' : ''}
            locationState={locationState}
            modelStatus={modelStatus}
            onContinueWithoutLocation={continueWithoutLocation}
            page="register"
            onRetry={retry}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <RegisterView
      camera={camera}
      errorMessage={officeError}
      manageOwnCamera
      modelsReady={modelsReady}
      offices={offices}
      onBack={() => router.push('/kiosk')}
      onEnrollPerson={handleEnrollPerson}
      workspaceReady={workspaceReady}
    />
  )
}
