import React, { useState } from 'react'
import { detectFacesAzure } from '../azureApi'
import { FACE_COLORS } from '../config'

export default function DetectTab({ camera, busy, setBusy, toast }) {
  const [faces, setFaces] = useState([])

  const handleDetect = async () => {
    if (!camera.camOn || busy) return
    setBusy(true)
    setFaces([])
    camera.clearOverlay()
    try {
      const blob = await camera.captureBlob()
      const data = await detectFacesAzure(blob)
      setFaces(data)
      const labels = {}
      data.forEach((f, i) => {
        const a = f.faceAttributes || {}
        labels[i] = a.glasses && a.glasses !== 'NoGlasses' ? `Face (${a.glasses})` : 'Face'
      })
      camera.drawBoxes(data.map(f => ({ faceRectangle: f.faceRectangle })), labels)
      toast(`Detected ${data.length} face(s)`)
    } catch (e) {
      toast('Error: ' + e.message)
    }
    setBusy(false)
  }

  return (
    <div className="tab-content">
      <div className="cam-controls">
        <button className="btn primary" onClick={handleDetect} disabled={!camera.camOn || busy}>
          {busy ? 'Scanning…' : 'Scan Now'}
        </button>
        <span className="powered-badge">via Azure Face API</span>
      </div>

      <div className="card">
        <h3 className="panel-title">Detection Results</h3>
        {faces.length === 0
          ? <p className="empty">Click Scan Now to detect faces</p>
          : faces.map((f, i) => {
            const a = f.faceAttributes || {}
            const hp = a.headPose
            const quality = a.qualityForRecognition
            return (
              <div key={f.faceId} className="face-card" style={{ borderLeftColor: FACE_COLORS[i % FACE_COLORS.length] }}>
                <div className="face-label" style={{ color: FACE_COLORS[i % FACE_COLORS.length] }}>FACE {i + 1}</div>
                <div className="attr-grid">
                  {a.glasses && <span><span className="attr-k">Glasses </span><b>{a.glasses.replace('Glasses', '') || 'Yes'}</b></span>}
                  {quality && <span><span className="attr-k">Quality </span><b style={{ textTransform: 'capitalize' }}>{quality}</b></span>}
                  {a.mask && <span><span className="attr-k">Mask </span><b>{a.mask.type || (a.mask.noseAndMouthCovered ? 'Yes' : 'No')}</b></span>}
                  {a.blur && <span><span className="attr-k">Blur </span><b style={{ textTransform: 'capitalize' }}>{a.blur.blurLevel}</b></span>}
                  {a.exposure && <span><span className="attr-k">Exposure </span><b style={{ textTransform: 'capitalize' }}>{a.exposure.exposureLevel}</b></span>}
                  {hp && (
                    <span className="full-col">
                      <span className="attr-k">Head Pose </span>
                      <b>Yaw {hp.yaw?.toFixed(0)}° / Pitch {hp.pitch?.toFixed(0)}° / Roll {hp.roll?.toFixed(0)}°</b>
                    </span>
                  )}
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}
