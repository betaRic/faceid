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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamOn(true)
    } catch (e) {
      setCamError(e.message)
    }
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
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

  useEffect(() => () => stop(), [stop])

  return {
    videoRef, canvasRef, overlayRef,
    camOn, camError,
    start, stop,
    captureBlob, captureImageData, clearOverlay
  }
}
