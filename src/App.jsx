import React, { useState, useEffect, useCallback } from 'react'
import { useCamera } from './useCamera'
import { loadModels, loadRegisteredPersons, saveRegisteredPersons, loadAttendance, saveAttendance } from './localFaceApi'
import KioskView from './components/KioskView'
import RegisterView from './components/RegisterView'
import './App.css'

export default function App() {
  const camera = useCamera()
  const [page, setPage] = useState('kiosk')
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [modelsReady, setModelsReady] = useState(false)
  const [modelStatus, setModelStatus] = useState('Initializing…')

  useEffect(() => {
    setPersons(loadRegisteredPersons())
    setAttendance(loadAttendance())
    loadModels(msg => setModelStatus(msg))
      .then(() => { setModelsReady(true); setModelStatus('Ready') })
      .catch(e => setModelStatus('Failed: ' + e.message))
  }, [])

  const handleSetPersons = useCallback(updated => {
    setPersons(updated); saveRegisteredPersons(updated)
  }, [])

  const handleLogAttendance = useCallback(entry => {
    setAttendance(prev => {
      const updated = [entry, ...prev]
      saveAttendance(updated)
      return updated
    })
  }, [])

  return (
    <div className="app">
      {page === 'kiosk' && (
        <KioskView
          camera={camera}
          persons={persons}
          modelsReady={modelsReady}
          modelStatus={modelStatus}
          attendance={attendance}
          onLogAttendance={handleLogAttendance}
          onGoRegister={() => { camera.stop(); setPage('register') }}
        />
      )}
      {page === 'register' && (
        <RegisterView
          camera={camera}
          persons={persons}
          setPersons={handleSetPersons}
          modelsReady={modelsReady}
          onBack={() => { camera.stop(); setPage('kiosk') }}
        />
      )}
    </div>
  )
}
