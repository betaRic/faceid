'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import KioskView from './KioskView'
import RegisterView from './RegisterView'
import AppShell from './AppShell'
import { firebaseEnabled, localFallbackAllowed, productionFirebaseRequired } from '../lib/firebase/client'
import { formatAttendanceDateKey, formatAttendanceDateLabel } from '../lib/attendance-time'
import { useBiometricRuntime } from './BiometricRuntimeProvider'
import { subscribeToPublicOffices } from '../lib/office-store'
import {
  deletePersonRecord,
  logAttendanceEntry,
  subscribeToAttendance,
  subscribeToPersons,
  upsertPersonSample,
} from '../lib/data-store'

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
  showRosterTools = loadPersons,
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

  useEffect(() => {
    const unsubscribe = subscribeToPublicOffices(
      nextOffices => setOffices(nextOffices),
      error => setErrorMessage(error instanceof Error ? error.message : 'Failed to load offices.'),
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!loadPersons) {
      setPersons([])
      setDataStatus(getDefaultDataStatus(false))
      setErrorMessage(null)
      return () => {}
    }

    const unsubscribe = subscribeToPersons(
      nextPersons => {
        setPersons(nextPersons)
        setDataStatus(
          firebaseEnabled
            ? 'Firebase online'
            : localFallbackAllowed
              ? 'Using browser storage (dev biometric fallback enabled)'
              : 'Firebase required for biometric operations',
        )
      },
      error => {
        setErrorMessage(error.message)
        setDataStatus('Storage unavailable')
      },
    )

    return unsubscribe
  }, [loadPersons])

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

  const handleDeletePerson = useCallback(async id => {
    const result = await deletePersonRecord(persons, id)
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
      <AppShell contentClassName="px-4 py-6 sm:px-6 lg:px-8">
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
      <AppShell contentClassName="px-4 py-6 sm:px-6 lg:px-8">
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

  if (!workspaceReady) {
    return (
      <AppShell contentClassName="px-4 py-6 sm:px-6 lg:px-8">
        <div className="page-frame min-h-[calc(100dvh-8.25rem)] xl:min-h-[calc(100dvh-10.5rem)]">
          <BiometricWorkspaceGate
            bootStage={bootStage}
            canBypassLocation={canBypassLocation}
            errorMessage={runtimeError}
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
          allowDelete={showRosterTools}
          camera={camera}
          dataStatus={dataStatus}
          errorMessage={errorMessage}
          modelsReady={modelsReady}
          workspaceReady={workspaceReady}
          onBack={() => {
            setPage('kiosk')
          }}
          onDeletePerson={handleDeletePerson}
          onEnrollPerson={handleEnrollPerson}
          offices={offices}
          persons={persons}
          showRosterTools={showRosterTools}
        />
      )}
    </div>
  )
}

function BiometricWorkspaceGate({
  page,
  bootStage,
  modelStatus,
  errorMessage,
  locationState,
  onRetry,
  canBypassLocation,
  onContinueWithoutLocation,
}) {
  const title = page === 'register' ? 'Preparing enrollment workspace' : 'Preparing attendance kiosk'
  const detail = errorMessage
    ? errorMessage
    : bootStage === 'location'
      ? 'Checking device location before the camera is shown. On-site attendance needs GPS; WFH can continue without it if location is unavailable.'
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
    <div className="mx-auto flex h-full min-h-[calc(100dvh-8.25rem)] max-w-4xl items-center justify-center xl:min-h-[calc(100dvh-10.5rem)]">
      <div className="w-full rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(12,108,88,0.08),rgba(255,255,255,0.98))] p-6 shadow-glow backdrop-blur sm:p-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-navy-dark">{statusLabel}</div>
          <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">{title}</h1>
          <p className="mt-4 text-sm leading-8 text-muted sm:text-base">
            {detail}
          </p>

          <div className="mt-8 rounded-[1.5rem] border border-black/5 bg-white/90 p-5 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy/10 text-navy-dark">
              <span className={`h-6 w-6 rounded-full border-2 border-current border-t-transparent ${errorMessage ? '' : 'animate-spin'}`} />
            </div>
            <div className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted">Runtime status</div>
            <div className="mt-2 text-lg font-semibold text-ink">{runtimeStatus}</div>
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
              {canBypassLocation ? (
                <button
                  className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                  onClick={onContinueWithoutLocation}
                  type="button"
                >
                  Continue for WFH only
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

