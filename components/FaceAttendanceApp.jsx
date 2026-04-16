'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import KioskView from './KioskView'
import RegisterView from './RegisterView'
import AppShell from './AppShell'
import BiometricWorkspaceGate from './BiometricWorkspaceGate'
import { firebaseEnabled, localFallbackAllowed, productionFirebaseRequired } from '@/lib/firebase/client'
import { formatAttendanceDateKey, formatAttendanceDateLabel } from '@/lib/attendance-time'
import { useBiometricRuntime } from './BiometricRuntimeProvider'
import { subscribeToPublicOffices } from '@/lib/office-store'
import {
  logAttendanceEntry,
  subscribeToAttendance,
  subscribeToPersons,
  upsertPersonSample,
} from '@/lib/data-store'

function getDefaultDataStatus(loadPersons) {
  if (!firebaseEnabled) {
    return localFallbackAllowed
      ? 'Using browser storage (dev biometric fallback enabled)'
      : 'Firebase required for biometric operations'
  }

  return loadPersons ? 'Connecting to Firebase...' : 'Ready'
}

export default function FaceAttendanceApp({
  initialPage = 'kiosk',
  loadPersons = true,
  loadAttendance = true,
  showRegistrationAction = true,
  loadPersonsForCheck = false,
}) {
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
  const [page, setPage] = useState(initialPage)
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [offices, setOffices] = useState([])
  const [dataStatus, setDataStatus] = useState(getDefaultDataStatus(loadPersons))
  const [errorMessage, setErrorMessage] = useState(null)
  const [personsLoading, setPersonsLoading] = useState(false)

  const registrationReady = useMemo(() => {
    if (page !== 'register') return workspaceReady
    return workspaceReady && !personsLoading
  }, [page, workspaceReady, personsLoading])

  useEffect(() => {
    const unsubscribe = subscribeToPublicOffices(
      nextOffices => setOffices(nextOffices),
      error => setErrorMessage(error instanceof Error ? error.message : 'Failed to load offices.'),
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!loadPersons && !loadPersonsForCheck) {
      setPersons([])
      setDataStatus(getDefaultDataStatus(false))
      setErrorMessage(null)
      return () => {}
    }

    setPersonsLoading(true)
    const unsubscribe = subscribeToPersons(
      nextPersons => {
        setPersons(nextPersons)
        setPersonsLoading(false)
        setDataStatus(
          firebaseEnabled
            ? 'Firebase online'
            : localFallbackAllowed
              ? 'Using browser storage (dev biometric fallback enabled)'
              : 'Firebase required for biometric operations',
        )
      },
      error => {
        setPersonsLoading(false)
        setErrorMessage(error.message)
        setDataStatus('Storage unavailable')
      },
      { requireAuth: loadPersons && !loadPersonsForCheck },
    )

    return unsubscribe
  }, [loadPersons, loadPersonsForCheck])

  useEffect(() => {
    if (!loadAttendance) {
      setAttendance([])
      setErrorMessage(null)
      return () => {}
    }

    const unsubscribe = subscribeToAttendance(
      setAttendance,
      error => {
        setErrorMessage(error.message)
      },
    )

    return unsubscribe
  }, [loadAttendance])

  const todayLogCount = useMemo(() => {
    const now = Date.now()
    const todayKey = formatAttendanceDateKey(now)
    const todayLabel = formatAttendanceDateLabel(now)

    return attendance.filter(entry => (
      (entry.dateKey && entry.dateKey === todayKey)
        || (!entry.dateKey && entry.date === todayLabel)
    )).length
  }, [attendance])

  const handleEnrollPerson = useCallback(async (profile, descriptors) => {
    const result = await upsertPersonSample(persons, profile, descriptors)
    if (result.mode === 'local') setPersons(result.persons)
    return result
  }, [persons])

  const handleLogAttendance = useCallback(async entry => {
    const result = await logAttendanceEntry(entry)
    if (result.mode === 'local') setAttendance(result.attendance)
    return result
  }, [])

  useEffect(() => {
    setPage(initialPage)
  }, [initialPage])

  if (productionFirebaseRequired && !firebaseEnabled) {
    return (
      <AppShell fitViewport contentClassName="px-4 py-6 sm:px-6 lg:px-8">
        <div className="page-frame">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-[1.5rem] border border-red-200 bg-white/90 p-6 shadow-glow backdrop-blur">
            <h1 className="font-display text-3xl text-ink">Deployment blocked</h1>
            <p className="text-sm leading-7 text-muted">
              Firebase client environment variables are incomplete. Production is not allowed to fall back to browser
              storage because that would create fake attendance data on one device instead of the real system.
            </p>
            <div className="rounded-2xl bg-red-50 px-4 py-4 text-sm leading-7 text-warn">
              Fix the Vercel Firebase environment variables before using this deployment.
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  if (!firebaseEnabled && !localFallbackAllowed) {
    return (
      <AppShell fitViewport contentClassName="px-4 py-6 sm:px-6 lg:px-8">
        <div className="page-frame">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-[1.5rem] border border-amber-200 bg-white/90 p-6 shadow-glow backdrop-blur">
            <h1 className="font-display text-3xl text-ink">Firebase required for biometric mode</h1>
            <p className="text-sm leading-7 text-muted">
              Enrollment and attendance are blocked when Firebase is not configured. Browser storage is no longer used
              for biometric data unless an explicit development flag enables it.
            </p>
            <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
              Configure Firebase, or set <code>NEXT_PUBLIC_ALLOW_LOCAL_BIOMETRIC_FALLBACK=true</code> only for isolated
              development work with non-sensitive test data.
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  if (page === 'register' ? !registrationReady : !workspaceReady) {
    return (
      <AppShell fitViewport contentClassName="px-4 py-6 sm:px-6 lg:px-8">
        <div className="page-frame h-full min-h-0">
          <BiometricWorkspaceGate
            bootStage={bootStage}
            canBypassLocation={canBypassLocation}
            errorMessage={runtimeError}
            loadingLabel={personsLoading ? 'Loading employee data...' : ''}
            locationState={locationState}
            modelStatus={modelStatus}
            onContinueWithoutLocation={continueWithoutLocation}
            page={page}
            onRetry={retry}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <div className="app-shell">
      {page === 'kiosk' ? (
        <KioskView
          attendance={attendance}
          camera={camera}
          dataStatus={dataStatus}
          errorMessage={errorMessage}
          locationState={locationState}
          modelStatus={modelStatus}
          modelsReady={modelsReady}
          workspaceReady={workspaceReady}
          onGoRegister={showRegistrationAction ? () => {
            setPage('register')
          } : null}
          onLogAttendance={handleLogAttendance}
          persons={persons}
          todayLogCount={todayLogCount}
        />
      ) : (
        <RegisterView
          camera={camera}
          errorMessage={errorMessage}
          modelsReady={modelsReady}
          workspaceReady={workspaceReady}
          onBack={() => {
            setPage('kiosk')
          }}
          onEnrollPerson={handleEnrollPerson}
          offices={offices}
        />
      )}
    </div>
  )
}

