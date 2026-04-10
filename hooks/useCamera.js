'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

  const attachStreamToVideo = useCallback(async () => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }

    if (video.paused) {
      await video.play()
    }
  }, [])

  const setVideoRef = useCallback(node => {
    videoRef.current = node

    if (node && streamRef.current) {
      attachStreamToVideo().catch(() => {})
    }
  }, [attachStreamToVideo])

  const start = useCallback(async () => {
    if (startPromiseRef.current) return startPromiseRef.current

    if (streamRef.current && videoRef.current?.srcObject === streamRef.current) {
      setCamError(null)
      setCamOn(true)
      return streamRef.current
    }

    if (streamRef.current) {
      setCamError(null)
      await attachStreamToVideo()
      setCamOn(true)
      return streamRef.current
    }

    setCamError(null)

    startPromiseRef.current = (async () => {
      try {
        const stream = await requestPreferredCameraStream()

        streamRef.current = stream
        await attachStreamToVideo()

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
  }, [attachStreamToVideo])

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

  const captureImageData = useCallback((options = {}) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const sourceWidth = video.videoWidth || 640
    const sourceHeight = video.videoHeight || 480
    const maxWidth = options.maxWidth || sourceWidth
    const maxHeight = options.maxHeight || sourceHeight
    const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)

    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas
  }, [])

  useEffect(() => () => stop(), [stop])

  return useMemo(() => ({
    videoRef,
    setVideoRef,
    canvasRef,
    overlayRef,
    camOn,
    camError,
    start,
    stop,
    captureImageData,
    clearOverlay,
  }), [camError, camOn, captureImageData, clearOverlay, setVideoRef, start, stop])
}

async function requestPreferredCameraStream() {
  const preferredConstraints = [
    {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 24 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
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

