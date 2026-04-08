import React, { useState } from 'react'
import { detectWithDescriptors, buildMatcher, matchDescriptor } from '../localFaceApi'
import { FACE_COLORS } from '../config'

export default function IdentifyTab({ camera, busy, setBusy, toast, persons, modelsReady }) {
  const [results, setResults] = useState([])

  const handleIdentify = async () => {
    if (!camera.camOn || busy) return
    if (persons.length === 0) { toast('Register at least one person first'); return }
    setBusy(true)
    setResults([])
    camera.clearOverlay()
    try {
      const canvas = camera.captureImageData()
      const detections = await detectWithDescriptors(canvas)
      if (detections.length === 0) { toast('No faces detected in frame'); setBusy(false); return }

      const matcher = buildMatcher(persons)
      const matched = detections.map((det, i) => {
        const match = matchDescriptor(matcher, det.descriptor)
        return { ...match, detection: det.detection, index: i }
      })

      setResults(matched)
      const labels = matched.map(m => m.identified ? `${m.name} ${(m.confidence * 100).toFixed(0)}%` : 'Unknown')
      camera.drawFaceApiBoxes(detections, labels)
      toast(`Identified ${matched.filter(m => m.identified).length} of ${matched.length} face(s)`)
    } catch (e) {
      toast('Identify error: ' + e.message)
    }
    setBusy(false)
  }

  return (
    <div className="tab-content">
      <div className="cam-controls">
        <button className="btn primary" onClick={handleIdentify} disabled={!camera.camOn || busy || !modelsReady || persons.length === 0}>
          {busy ? 'Identifying…' : 'Identify Face'}
        </button>
        <span className="powered-badge">local · face-api.js</span>
        {persons.length === 0 && <span className="hint-text">Register persons first</span>}
      </div>

      {!modelsReady && (
        <div className="info-banner">⏳ Loading face recognition models, please wait…</div>
      )}

      <div className="card">
        <h3 className="panel-title">Results</h3>
        {results.length === 0
          ? <p className="empty">{persons.length === 0 ? 'No persons in database — register first' : 'Click Identify Face to run recognition'}</p>
          : results.map((r, i) => (
            <div key={i} className={`result-card ${r.identified ? '' : 'unknown'}`}>
              <div className="result-name">{r.identified ? `✓  ${r.name}` : '✗  Unknown'}</div>
              {r.identified && (
                <>
                  <div className="result-conf">Confidence: {(r.confidence * 100).toFixed(1)}%</div>
                  <div className="conf-bar-bg">
                    <div className="conf-bar" style={{ width: (r.confidence * 100) + '%' }} />
                  </div>
                </>
              )}
              {!r.identified && (
                <div className="result-hint">Not in database — go to Register tab to enroll this person</div>
              )}
            </div>
          ))
        }
      </div>

      <div className="card">
        <h3 className="panel-title">Database ({persons.length})</h3>
        {persons.length === 0
          ? <p className="empty">Empty</p>
          : persons.map((p, i) => (
            <div key={p.id} className="person-row">
              <div className="avatar" style={{ background: FACE_COLORS[i % FACE_COLORS.length] + '22', color: FACE_COLORS[i % FACE_COLORS.length] }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span className="person-name">{p.name}</span>
              <span className="person-count">{p.descriptors.length} sample{p.descriptors.length !== 1 ? 's' : ''}</span>
            </div>
          ))
        }
      </div>
    </div>
  )
}
