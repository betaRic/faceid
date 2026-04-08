import React, { useState, useEffect, useRef, useCallback } from 'react'
import { detectSingleDescriptor } from '../localFaceApi'
import { FACE_COLORS } from '../config'

const MIN_SAMPLES = 3  // recommended minimum per person

export default function RegisterView({ camera, persons, setPersons, modelsReady, onBack }) {
  const [name, setName]               = useState('')
  const [previewUrl, setPreviewUrl]   = useState(null)
  const [pendingDesc, setPendingDesc] = useState(null)
  const [sessionSamples, setSessionSamples] = useState(0) // samples added this session for current name
  const [faceFound, setFaceFound]     = useState(false)
  const [statusMsg, setStatusMsg]     = useState('Starting camera…')
  const [toast, setToast]             = useState(null)
  const autoRef  = useRef(null)
  const nameRef  = useRef(null)
  const busyRef  = useRef(false)

  const showToast = (msg, duration = 3500) => {
    setToast(msg); setTimeout(() => setToast(null), duration)
  }

  useEffect(() => {
    camera.start().then(() => startDetect())
    return () => stopDetect()
  }, [])

  const drawBox = useCallback(det => {
    const v = camera.videoRef.current, oc = camera.overlayRef.current
    if (!oc || !v) return
    const vw = v.videoWidth||640, vh = v.videoHeight||480
    oc.width = vw; oc.height = vh
    const ctx = oc.getContext('2d')
    ctx.clearRect(0, 0, vw, vh)
    if (!det) return
    const { x, y, width: w, height: h } = det.detection.box
    const cs = Math.min(w, h) * 0.2
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 3
    ;[
      [[x,y+cs],[x,y],[x+cs,y]],
      [[x+w-cs,y],[x+w,y],[x+w,y+cs]],
      [[x+w,y+h-cs],[x+w,y+h],[x+w-cs,y+h]],
      [[x+cs,y+h],[x,y+h],[x,y+h-cs]],
    ].forEach(pts => {
      ctx.beginPath()
      pts.forEach(([px,py],i) => i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py))
      ctx.stroke()
    })
  }, [camera])

  const startDetect = () => {
    setStatusMsg('Scanning for face…')
    autoRef.current = setInterval(async () => {
      if (busyRef.current || !camera.camOn || previewUrl) return
      try {
        const canvas = camera.captureImageData()
        const result = await detectSingleDescriptor(canvas)
        setFaceFound(!!result)
        drawBox(result || null)
        setStatusMsg(result ? 'Face detected — click CAPTURE' : 'Scanning for face…')
      } catch {}
    }, 400)
  }
  const stopDetect = () => { clearInterval(autoRef.current); autoRef.current = null }

  const handleCapture = async () => {
    if (busyRef.current || !camera.camOn) return
    busyRef.current = true
    stopDetect()
    try {
      const canvas = camera.captureImageData()
      const result = await detectSingleDescriptor(canvas)
      if (!result) {
        showToast('No face detected — reposition and try again')
        busyRef.current = false; startDetect(); return
      }
      setPendingDesc(result.descriptor)
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85))
      camera.clearOverlay()
      setStatusMsg('Face captured — enter name and click ENROLL')
      setTimeout(() => nameRef.current?.focus(), 100)
    } catch (e) { showToast('Error: ' + e.message); startDetect() }
    busyRef.current = false
  }

  const handleRegister = () => {
    if (!name.trim()) { showToast('Enter the employee name'); nameRef.current?.focus(); return }
    if (!pendingDesc) { showToast('Capture a face first'); return }
    const trimmed = name.trim()
    const existing = persons.find(p => p.name.toLowerCase() === trimmed.toLowerCase())
    let updated, newCount
    if (existing) {
      updated = persons.map(p =>
        p.name.toLowerCase() === trimmed.toLowerCase()
          ? { ...p, descriptors: [...p.descriptors, pendingDesc] }
          : p
      )
      newCount = existing.descriptors.length + 1
    } else {
      updated = [...persons, { id: Date.now().toString(), name: trimmed, descriptors: [pendingDesc] }]
      newCount = 1
    }
    setPersons(updated)
    setSessionSamples(s => s + 1)

    const remaining = MIN_SAMPLES - newCount
    if (remaining > 0) {
      showToast(`Sample ${newCount} saved! Add ${remaining} more for best accuracy.`)
    } else {
      showToast(`✓ ${trimmed} enrolled with ${newCount} sample${newCount !== 1 ? 's' : ''}!`, 4000)
    }

    setPendingDesc(null); setPreviewUrl(null); setFaceFound(false)
    // Keep the name so the user can easily add more samples
    startDetect()
  }

  const handleRetake = () => {
    setPendingDesc(null); setPreviewUrl(null); setFaceFound(false)
    startDetect()
  }

  const handleNewPerson = () => {
    setName(''); setPendingDesc(null); setPreviewUrl(null)
    setFaceFound(false); setSessionSamples(0)
    startDetect()
    nameRef.current?.focus()
  }

  const handleDelete = (id, pName) => {
    if (!window.confirm(`Remove ${pName}?`)) return
    setPersons(persons.filter(p => p.id !== id))
    showToast(`${pName} removed`)
  }

  const existingPerson = persons.find(p => p.name.toLowerCase() === name.trim().toLowerCase())
  const existingSamples = existingPerson?.descriptors.length ?? 0
  const totalAfterEnroll = existingSamples + (pendingDesc ? 1 : 0)
  const needsMoreSamples = totalAfterEnroll < MIN_SAMPLES

  return (
    <div className="reg-root">
      {toast && <div className="toast">{toast}</div>}

      <div className="reg-header">
        <button className="admin-btn" onClick={onBack}>← BACK TO KIOSK</button>
        <div className="reg-title">
          <span className="info-badge">DILG</span>
          EMPLOYEE ENROLLMENT
        </div>
        <div className="sys-val">{persons.length} enrolled</div>
      </div>

      <div className="reg-body">
        {/* Camera */}
        <div className="reg-cam-col">
          <div className="reg-cam-wrap">
            <video ref={camera.videoRef} playsInline muted className="kiosk-video" />
            <canvas ref={camera.canvasRef} style={{ display:'none' }} />
            <canvas ref={camera.overlayRef} className="kiosk-overlay" />
            {!camera.camOn && (
              <div className="cam-offline"><div className="cam-offline-icon">◈</div><div>Camera Offline</div></div>
            )}
            <div className="k-corner tl" /><div className="k-corner tr" />
            <div className="k-corner bl" /><div className="k-corner br" />
            <div className="reg-face-status">
              {previewUrl
                ? <span className="prompt-ok">✓ CAPTURED</span>
                : faceFound
                ? <span className="prompt-ok">◈ FACE DETECTED</span>
                : <span className="prompt-idle">◈ NO FACE</span>
              }
            </div>
          </div>

          <div className="reg-status-bar">{statusMsg}</div>

          {!modelsReady && (
            <div className="info-warn">⏳ Loading recognition models…</div>
          )}

          {/* Step guide */}
          <div className="reg-steps">
            <div className={`reg-step ${!previewUrl && camera.camOn ? 'step-active' : previewUrl ? 'step-done' : ''}`}>
              <span className="step-num">1</span> Face camera, click CAPTURE
            </div>
            <div className={`reg-step ${previewUrl && !name.trim() ? 'step-active' : name.trim() && previewUrl ? 'step-done' : ''}`}>
              <span className="step-num">2</span> Enter employee name
            </div>
            <div className={`reg-step ${name.trim() && previewUrl ? 'step-active' : ''}`}>
              <span className="step-num">3</span> Click ENROLL (repeat for {MIN_SAMPLES}+ samples)
            </div>
          </div>

          {!previewUrl ? (
            <button className="btn-big-capture" onClick={handleCapture} disabled={!faceFound || !modelsReady}>
              ⊙  CAPTURE FACE
            </button>
          ) : (
            <button className="btn-big-ghost" onClick={handleRetake}>↺  RETAKE PHOTO</button>
          )}
        </div>

        {/* Form */}
        <div className="reg-form-col">
          <div className="reg-card">
            <div className="reg-card-title">CAPTURE PREVIEW</div>
            {previewUrl
              ? <img src={previewUrl} alt="Preview" className="face-preview" />
              : <div className="preview-ph">Point face at camera<br/>then click CAPTURE FACE</div>
            }
          </div>

          <div className="reg-card">
            <div className="reg-card-title">EMPLOYEE DETAILS</div>
            <label className="field-label">FULL NAME</label>
            <input
              ref={nameRef}
              className="reg-input"
              type="text"
              placeholder="Enter full name"
              value={name}
              onChange={e => { setName(e.target.value); setSessionSamples(0) }}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
            />

            {name.trim() && existingPerson && (
              <div className="sample-status">
                <div className="sample-bar-bg">
                  <div
                    className="sample-bar"
                    style={{ width: Math.min(100, (existingSamples / MIN_SAMPLES) * 100) + '%',
                             background: existingSamples >= MIN_SAMPLES ? 'var(--green)' : 'var(--yellow)' }}
                  />
                </div>
                <span className="sample-label">
                  {existingSamples} / {MIN_SAMPLES} samples
                  {existingSamples >= MIN_SAMPLES ? '  ✓ Good accuracy' : '  — add more for better accuracy'}
                </span>
              </div>
            )}

            <button className="btn-register" onClick={handleRegister} disabled={!pendingDesc || !name.trim()}>
              ⊕  ENROLL EMPLOYEE
            </button>
            {name.trim() && existingPerson && (
              <button className="btn-new-person" onClick={handleNewPerson}>
                + NEW PERSON
              </button>
            )}
          </div>

          <div className="reg-card reg-list-card">
            <div className="reg-card-title">ENROLLED EMPLOYEES ({persons.length})</div>
            {persons.length === 0
              ? <div className="log-empty">No employees enrolled yet</div>
              : <div className="reg-scroll">
                  {persons.map((p, i) => (
                    <div key={p.id} className="person-row">
                      <div className="person-avatar" style={{
                        color: FACE_COLORS[i % FACE_COLORS.length],
                        borderColor: FACE_COLORS[i % FACE_COLORS.length]
                      }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="person-info">
                        <span className="person-name">{p.name}</span>
                        <span className="person-samples" style={{
                          color: p.descriptors.length >= MIN_SAMPLES ? 'var(--green2)' : 'var(--yellow)'
                        }}>
                          {p.descriptors.length} sample{p.descriptors.length !== 1 ? 's' : ''}
                          {p.descriptors.length >= MIN_SAMPLES ? ' ✓' : ` — need ${MIN_SAMPLES - p.descriptors.length} more`}
                        </span>
                      </div>
                      <button className="btn-del" onClick={() => handleDelete(p.id, p.name)}>✕</button>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>
    </div>
  )
}