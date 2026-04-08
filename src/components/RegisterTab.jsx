import React, { useState } from 'react'
import { detectSingleDescriptor, saveRegisteredPersons } from '../localFaceApi'
import { FACE_COLORS } from '../config'

export default function RegisterTab({ camera, busy, setBusy, toast, persons, setPersons, modelsReady }) {
  const [name, setName] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pendingDescriptor, setPendingDescriptor] = useState(null)

  const handleCapture = async () => {
    if (!camera.camOn || busy) return
    setBusy(true)
    try {
      const canvas = camera.captureImageData()
      const result = await detectSingleDescriptor(canvas)
      if (!result) { toast('No face detected — position your face clearly in frame'); setBusy(false); return }
      setPendingDescriptor(result.descriptor)
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.8))
      toast('Face captured — enter name and click Register')
    } catch (e) {
      toast('Capture error: ' + e.message)
    }
    setBusy(false)
  }

  const handleRegister = () => {
    if (!name.trim()) { toast('Enter a name first'); return }
    if (!pendingDescriptor) { toast('Capture a photo first'); return }

    const existing = persons.find(p => p.name.toLowerCase() === name.trim().toLowerCase())
    let updated
    if (existing) {
      // Add another face sample to existing person
      updated = persons.map(p =>
        p.name.toLowerCase() === name.trim().toLowerCase()
          ? { ...p, descriptors: [...p.descriptors, pendingDescriptor] }
          : p
      )
      toast(`Added new face sample to ${existing.name}`)
    } else {
      const newPerson = { id: Date.now().toString(), name: name.trim(), descriptors: [pendingDescriptor] }
      updated = [...persons, newPerson]
      toast(`${name.trim()} registered!`)
    }

    setPersons(updated)
    saveRegisteredPersons(updated)
    setName('')
    setPendingDescriptor(null)
    setPreviewUrl(null)
  }

  const handleDelete = (id, pName) => {
    if (!window.confirm(`Delete ${pName}? This cannot be undone.`)) return
    const updated = persons.filter(p => p.id !== id)
    setPersons(updated)
    saveRegisteredPersons(updated)
    toast(`${pName} deleted`)
  }

  const handleAddFace = async (person) => {
    if (!camera.camOn || busy) { toast('Start camera first'); return }
    setBusy(true)
    try {
      const canvas = camera.captureImageData()
      const result = await detectSingleDescriptor(canvas)
      if (!result) { toast('No face detected in frame'); setBusy(false); return }
      const updated = persons.map(p =>
        p.id === person.id ? { ...p, descriptors: [...p.descriptors, result.descriptor] } : p
      )
      setPersons(updated)
      saveRegisteredPersons(updated)
      toast(`New face sample added to ${person.name}`)
    } catch (e) {
      toast(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="tab-content">
      <div className="cam-controls">
        <button className="btn primary" onClick={handleCapture} disabled={!camera.camOn || busy || !modelsReady}>
          {busy ? 'Processing…' : 'Capture Face'}
        </button>
        <span className="powered-badge">local · face-api.js</span>
      </div>

      {!modelsReady && (
        <div className="info-banner">⏳ Loading face recognition models, please wait…</div>
      )}

      <div className="card">
        <h3 className="panel-title">Register New Person</h3>
        <label className="step-label">Step 1 — Point camera at face &amp; click Capture</label>
        {previewUrl
          ? <img src={previewUrl} alt="Captured face" className="capture-preview" />
          : <div className="capture-placeholder">No photo captured yet</div>
        }
        <label className="step-label" style={{ marginTop: 12 }}>Step 2 — Enter name &amp; register</label>
        <input
          className="text-input"
          type="text"
          placeholder="Full name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRegister()}
        />
        <button
          className="btn success full-width"
          style={{ marginTop: 10 }}
          onClick={handleRegister}
          disabled={!pendingDescriptor || !name.trim()}
        >
          Register Person
        </button>
      </div>

      <div className="card">
        <h3 className="panel-title">Registered Persons ({persons.length})</h3>
        {persons.length === 0
          ? <p className="empty">No persons registered yet</p>
          : persons.map((p, i) => (
            <div key={p.id} className="person-row">
              <div className="avatar" style={{ background: FACE_COLORS[i % FACE_COLORS.length] + '22', color: FACE_COLORS[i % FACE_COLORS.length] }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span className="person-name">{p.name}</span>
              <span className="person-count">{p.descriptors.length} sample{p.descriptors.length !== 1 ? 's' : ''}</span>
              <button className="btn sm" title="Add another face sample" onClick={() => handleAddFace(p)} disabled={busy || !camera.camOn || !modelsReady}>+face</button>
              <button className="btn sm danger-text" title="Delete" onClick={() => handleDelete(p.id, p.name)}>✕</button>
            </div>
          ))
        }
      </div>
    </div>
  )
}
