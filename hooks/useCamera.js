'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getVideoTrackSettingsSnapshot, isProbablyMobileDevice } from '@/lib/biometrics/device-profile'

export function useCamera() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const pendingStreamRef = useRef(null)
  const startPromiseRef = useRef(null)

  const [camOn, setCamOn] = useState(false)
  const [camError, setCamError] = useState(null)

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const getTrackSettings = useCallback(() => {
    return getVideoTrackSettingsSnapshot(streamRef.current)
  }, [])

  const attachStreamToVideo = useCallback(async () => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!stream) return

    if (!video) {
      pendingStreamRef.current = stream
      return
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }

    if (video.paused) {
      try {
        await video.play()
      } catch (e) {
        console.warn('[Camera] video.play() failed:', e.message)
      }
    }
  }, [])

  const setVideoRef = useCallback(node => {
    videoRef.current = node

    if (node) {
      const pendingStream = pendingStreamRef.current
      if (pendingStream) {
        pendingStreamRef.current = null
        streamRef.current = pendingStream
        node.srcObject = pendingStream
        node.play().catch(() => {})
      } else if (streamRef.current) {
        node.srcObject = streamRef.current
      }
    }
  }, [])

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
        
        const settings = getVideoTrackSettingsSnapshot(stream)
        if (settings) {
          if (settings.width && settings.width < 640) {
            console.warn('[Camera] Low resolution detected:', settings.width, 'x', settings.height)
          }
          if (settings.frameRate && settings.frameRate < 15) {
            console.warn('[Camera] Low frame rate detected:', settings.frameRate, 'fps')
          }
          if (process.env.NODE_ENV !== 'production') {
            console.info('[Camera] Active video track settings:', settings)
          }
        }
        
        streamRef.current = stream
        await attachStreamToVideo()
        setCamOn(true)
        return stream
      } catch (error) {
        const message = error?.message || 'Unable to access camera'
        const interrupted = message.toLowerCase().includes('interrupted')
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
    pendingStreamRef.current = null
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
    
    if (!video || video.readyState < 2) {
      return null
    }
    
    const sourceWidth = video.videoWidth || video.offsetWidth || 640
    const sourceHeight = video.videoHeight || video.offsetHeight || 480
    const maxWidth = options.maxWidth || sourceWidth
    const maxHeight = options.maxHeight || sourceHeight
    const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)

    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))
    
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    return canvas
  }, [])

  useEffect(() => () => stop(), [stop])

  return {
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
    getTrackSettings,
  }
}

async function requestPreferredCameraStream() {
  const preferredConstraints = isProbablyMobileDevice()
    ? [
        {
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 960, max: 1440 },
            frameRate: { ideal: 30, min: 15 },
          },
        },
        {
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 960, max: 1280 },
            height: { ideal: 720, max: 960 },
            frameRate: { ideal: 24, min: 12 },
          },
        },
        {
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
          },
        },
        {
          audio: false,
          video: true,
        },
      ]
    : [
        {
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, min: 15 },
            aspectRatio: { ideal: 16 / 9 },
            resizeMode: 'none',
          },
        },
        {
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 960, max: 1280 },
            height: { ideal: 720, max: 960 },
            frameRate: { ideal: 30, min: 15 },
            resizeMode: 'none',
          },
        },
        {
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 640, min: 480 },
            height: { ideal: 480, min: 360 },
            frameRate: { ideal: 30, min: 15 },
            resizeMode: 'none',
          },
        },
        {
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            resizeMode: 'none',
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
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      return stream
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Unable to access camera')
}
