'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import KioskView from './KioskView'
import RegisterView from './RegisterView'
import { useCamera } from '../hooks/useCamera'
import { firebaseEnabled, productionFirebaseRequired } from '../lib/firebase'
import { loadModels } from '../lib/face-api'
import { REGION12_OFFICES } from '../lib/offices'
import {
  deletePersonRecord,
  logAttendanceEntry,
  subscribeToAttendance,
  subscribeToPersons,
  upsertPersonSample,
} from '../lib/data-store'

export default function FaceAttendanceApp({ initialPage = 'kiosk' }) {
  const camera = useCamera()
  const [page, setPage] = useState(initialPage)
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [modelsReady, setModelsReady] = useState(false)
  const [modelStatus, setModelStatus] = useState('Initializing...')
  const [dataStatus, setDataStatus] = useState(firebaseEnabled ? 'Connecting to Firebase...' : 'Using browser storage')
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    let mounted = true

    loadModels(message => {
      if (mounted) setModelStatus(message)
    })
      .then(() => {
        if (mounted) {
          setModelsReady(true)
          setModelStatus('Ready')
        }
      })
      .catch(error => {
        if (mounted) setModelStatus(`Failed: ${error.message}`)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToPersons(
      nextPersons => {
        setPersons(nextPersons)
        setDataStatus(firebaseEnabled ? 'Firebase online' : 'Using browser storage')
      },
      error => {
        setErrorMessage(error.message)
        setDataStatus('Storage unavailable')
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToAttendance(
      setAttendance,
      error => {
        setErrorMessage(error.message)
      },
    )

    return unsubscribe
  }, [])

  const todayLogCount = useMemo(() => {
    const today = new Date().toLocaleDateString('en-PH')
    return attendance.filter(entry => entry.date === today).length
  }, [attendance])

  const handleEnrollPerson = useCallback(async (profile, descriptor) => {
    const result = await upsertPersonSample(persons, profile, descriptor)
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
      <div className="min-h-screen bg-hero-wash px-4 py-6 sm:px-6 lg:px-8">
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
          modelStatus={modelStatus}
          modelsReady={modelsReady}
          onGoRegister={() => {
            camera.stop()
            setPage('register')
          }}
          onLogAttendance={handleLogAttendance}
          offices={REGION12_OFFICES}
          persons={persons}
          todayLogCount={todayLogCount}
        />
      ) : (
        <RegisterView
          camera={camera}
          dataStatus={dataStatus}
          errorMessage={errorMessage}
          modelsReady={modelsReady}
          onBack={() => {
            camera.stop()
            setPage('kiosk')
          }}
          onDeletePerson={handleDeletePerson}
          onEnrollPerson={handleEnrollPerson}
          offices={REGION12_OFFICES}
          persons={persons}
        />
      )}
    </div>
  )
}
