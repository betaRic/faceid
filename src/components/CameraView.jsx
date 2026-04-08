import React from 'react'

export default function CameraView({ camera, busy }) {
  return (
    <div className="cam-section">
      <div className="cam-wrap">
        {!camera.camOn && (
          <div className="cam-off">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
              <rect x="2" y="7" width="20" height="15" rx="2" />
              <circle cx="12" cy="14" r="3" />
              <path d="M16 7l-4-4-4 4" />
            </svg>
            <span>Camera is off</span>
          </div>
        )}
        <video ref={camera.videoRef} playsInline muted style={{ display: camera.camOn ? 'block' : 'none', objectFit: 'cover' }} />
        <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
        <canvas ref={camera.overlayRef} className="overlay" style={{ display: camera.camOn ? 'block' : 'none' }} />
        {busy && <div className="scan-anim" />}
      </div>
      <div className="cam-buttons">
        {!camera.camOn
          ? <button className="btn primary" onClick={camera.start}>Start Camera</button>
          : <button className="btn danger" onClick={camera.stop}>Stop Camera</button>
        }
      </div>
      {camera.camError && <div className="error-msg">Camera error: {camera.camError}</div>}
    </div>
  )
}
