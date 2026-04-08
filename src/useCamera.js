import { useRef, useState, useEffect, useCallback } from 'react'
import { FACE_COLORS } from './config'

export function useCamera() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const [camOn, setCamOn] = useState(false)
  const [camError, setCamError] = useState(null)

  const start = useCallback(async () => {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setCamOn(true)
    } catch (e) {
      setCamError(e.message)
    }
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    setCamOn(false)
    clearOverlay()
  }, [])

  const captureBlob = useCallback(() => new Promise(resolve => {
    const v = videoRef.current, c = canvasRef.current
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    c.toBlob(resolve, 'image/jpeg', 0.85)
  }), [])

  const captureImageData = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    return c
  }, [])

  const clearOverlay = useCallback(() => {
    const c = overlayRef.current
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
  }, [])

  const drawBoxes = useCallback((faces, labels = {}) => {
    const v = videoRef.current, oc = overlayRef.current
    if (!oc || !v) return
    const vw = v.videoWidth || 640, vh = v.videoHeight || 480
    oc.width = vw; oc.height = vh
    const ctx = oc.getContext('2d')
    ctx.clearRect(0, 0, vw, vh)
    faces.forEach((f, i) => {
      const r = f.faceRectangle || { left: f.detection?.box.x, top: f.detection?.box.y, width: f.detection?.box.width, height: f.detection?.box.height }
      const col = FACE_COLORS[i % FACE_COLORS.length]
      const label = labels[i] || `Face ${i + 1}`
      ctx.strokeStyle = col; ctx.lineWidth = 2
      ctx.strokeRect(r.left, r.top, r.width, r.height)
      const tw = ctx.measureText(label).width + 14
      ctx.fillStyle = col + 'dd'; ctx.fillRect(r.left, r.top - 24, Math.max(tw, 90), 24)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'
      ctx.fillText(label, r.left + 6, r.top - 8)
    })
  }, [])

  // Draw boxes from face-api.js detection results
  const drawFaceApiBoxes = useCallback((detections, labels = []) => {
    const v = videoRef.current, oc = overlayRef.current
    if (!oc || !v) return
    const vw = v.videoWidth || 640, vh = v.videoHeight || 480
    oc.width = vw; oc.height = vh
    const ctx = oc.getContext('2d')
    ctx.clearRect(0, 0, vw, vh)
    detections.forEach((det, i) => {
      const box = det.detection?.box || det.box
      const col = FACE_COLORS[i % FACE_COLORS.length]
      const label = labels[i] || `Face ${i + 1}`
      ctx.strokeStyle = col; ctx.lineWidth = 2
      ctx.strokeRect(box.x, box.y, box.width, box.height)
      const tw = ctx.measureText(label).width + 14
      ctx.fillStyle = col + 'dd'; ctx.fillRect(box.x, box.y - 24, Math.max(tw, 90), 24)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'
      ctx.fillText(label, box.x + 6, box.y - 8)
    })
  }, [])

  useEffect(() => () => stop(), [stop])

  return { videoRef, canvasRef, overlayRef, camOn, camError, start, stop, captureBlob, captureImageData, clearOverlay, drawBoxes, drawFaceApiBoxes }
}
