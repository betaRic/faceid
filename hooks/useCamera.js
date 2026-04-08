'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useCamera() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)

  const [camOn, setCamOn] = useState(false)
  const [camError, setCamError] = useState(null)

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const start = useCallback(async () => {
    setCamError(null)

    try {
      const stream = await requestPreferredCameraStream()

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCamOn(true)
    } catch (error) {
      setCamError(error.message)
      setCamOn(false)
    }
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop())
    streamRef.current = null
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
