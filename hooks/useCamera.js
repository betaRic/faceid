'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useCamera() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const startPromiseRef = useRef(null)

  const [camOn, setCamOn] = useState(false)
  const [camError, setCamError] = useState(null)

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const start = useCallback(async () => {
    if (startPromiseRef.current) return startPromiseRef.current

    if (streamRef.current && videoRef.current?.srcObject === streamRef.current) {
      setCamError(null)
      setCamOn(true)
      return streamRef.current
    }

    setCamError(null)

    startPromiseRef.current = (async () => {
      try {
        const stream = await requestPreferredCameraStream()

        streamRef.current = stream

        if (videoRef.current) {
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream
          }

          if (videoRef.current.paused) {
            await videoRef.current.play()
          }
        }

        setCamOn(true)
        return stream
      } catch (error) {
        const message = error?.message || 'Unable to access camera'
        const interrupted = message.toLowerCase().includes('interrupted by a new load request')
        setCamError(interrupted ? 'Camera restarted. Retrying...' : message)
        setCamOn(false)
        throw error
      } finally {
        startPromiseRef.current = null
      }
    })()

    return startPromiseRef.current
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop())
    streamRef.current = null
    startPromiseRef.current = null

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
      videoRef.current.load()
    }

    setCamOn(false)
    clearOverlay()
  }, [clearOverlay])

  const captureImageData = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas
  }, [])

  useEffect(() => () => stop(), [stop])

  return {
    videoRef,
    canvasRef,
    overlayRef,
    camOn,
    camError,
    start,
    stop,
    captureImageData,
    clearOverlay,
  }
}

async function requestPreferredCameraStream() {
  const preferredConstraints = [
    {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: 'user',
      },
    },
    {
      audio: false,
      video: true,
    },
  ]

  let lastError = null

  for (const constraints of preferredConstraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Unable to access camera')
}
