'use client'

import AppShell from './AppShell'
import BiometricWorkspaceGate from './BiometricWorkspaceGate'
import KioskView from './KioskView'
import { useBiometricRuntime } from './BiometricRuntimeProvider'
import { logAttendanceEntry } from '@/lib/data-store'

export default function ScanRuntimeApp() {
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
  } = runtime

  if (!workspaceReady) {
    return (
      <AppShell fitViewport contentClassName="px-4 py-6 sm:px-6 lg:px-8">
        <div className="page-frame h-full min-h-0">
          <BiometricWorkspaceGate
            bootStage={bootStage}
            canBypassLocation={false}
            errorMessage={runtimeError}
            locationState={locationState}
            modelStatus={modelStatus}
            onContinueWithoutLocation={null}
            onRetry={retry}
            page="scan"
          />
        </div>
      </AppShell>
    )
  }

  return (
    <KioskView
      camera={camera}
      errorMessage={null}
      locationState={locationState}
      modelsReady={modelsReady}
      onLogAttendance={logAttendanceEntry}
      workspaceReady={workspaceReady}
    />
  )
}
