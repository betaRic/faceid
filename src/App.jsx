import React, { useState, useEffect, useCallback } from 'react'
import { useCamera } from './useCamera'
import { loadModels, loadRegisteredPersons } from './localFaceApi'
import CameraView from './components/CameraView'
import DetectTab from './components/DetectTab'
import RegisterTab from './components/RegisterTab'
import IdentifyTab from './components/IdentifyTab'
import './App.css'

export default function App() {
  const camera = useCamera()
  const [tab, setTab] = useState('detect')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [persons, setPersons] = useState([])
  const [modelsReady, setModelsReady] = useState(false)
  const [modelStatus, setModelStatus] = useState('Loading models…')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const initModels = useCallback(async () => {
    try {
      await loadModels(msg => setModelStatus(msg))
      setModelsReady(true)
      setModelStatus('Models ready')
    } catch (e) {
      setModelStatus('Model load failed: ' + e.message)
    }
  }, [])

  useEffect(() => {
    setPersons(loadRegisteredPersons())
    initModels()
  }, [initModels])

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      <header className="app-header">
        <div className="header-left">
          <span className="badge">DILG</span>
          <h1 className="app-title">Face ID System</h1>
          <span className="subtitle">General Santos City</span>
        </div>
        <div className="model-status">
          <span className={`status-dot ${modelsReady ? 'green' : 'yellow'}`} />
          {modelStatus}
        </div>
      </header>

      <div className="app-body">
        <div className="left-col">
          <CameraView camera={camera} busy={busy} />
        </div>

        <div className="right-col">
          <div className="tabs">
            {['detect', 'register', 'identify'].map(t => (
              <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'detect' ? 'Detect' : t === 'register' ? 'Register' : 'Identify'}
              </button>
            ))}
          </div>

          {tab === 'detect' && (
            <DetectTab camera={camera} busy={busy} setBusy={setBusy} toast={showToast} />
          )}
          {tab === 'register' && (
            <RegisterTab
              camera={camera} busy={busy} setBusy={setBusy} toast={showToast}
              persons={persons} setPersons={setPersons} modelsReady={modelsReady}
            />
          )}
          {tab === 'identify' && (
            <IdentifyTab
              camera={camera} busy={busy} setBusy={setBusy} toast={showToast}
              persons={persons} modelsReady={modelsReady}
            />
          )}
        </div>
      </div>
    </div>
  )
}
