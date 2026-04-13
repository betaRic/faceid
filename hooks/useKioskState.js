import { useCallback, useEffect, useRef, useState } from 'react'
import { KIOSK_ATTEMPT_COOLDOWN_MS } from '@/lib/config'

export function useKioskState(camera) {
  const [kioskState, setKioskState] = useState('idle')
  const [currentMatch, setCurrentMatch] = useState(null)
  const [capturedFrameUrl, setCapturedFrameUrl] = useState(null)
  const [flashKey, setFlashKey] = useState(0)
  const [alertState, setAlertState] = useState(null)
  const [resumeKey, setResumeKey] = useState(0)
  const [faceDistanceInfo, setFaceDistanceInfo] = useState(null)

  const confirmRef = useRef(0)
  const confirmedTimer = useRef(null)
  const unknownTimer = useRef(null)
  const resumeTimerRef = useRef(null)
  const attemptCooldownUntilRef = useRef(0)
  const faceLossTimerRef = useRef(null)
  const pausedRef = useRef(false)

  const stopLoop = useCallback(() => {
    if (faceLossTimerRef.current) {
      window.clearTimeout(faceLossTimerRef.current)
      faceLossTimerRef.current = null
    }
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    if (confirmedTimer.current) {
      window.clearTimeout(confirmedTimer.current)
      confirmedTimer.current = null
    }
    if (unknownTimer.current) {
      window.clearTimeout(unknownTimer.current)
      unknownTimer.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopLoop()
    }
  }, [stopLoop])

  const scheduleResume = useCallback((delay = KIOSK_ATTEMPT_COOLDOWN_MS) => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)

    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null
      pausedRef.current = false
      confirmRef.current = 0
      setCapturedFrameUrl(null)
      setCurrentMatch(null)
      setAlertState(null)
      setKioskState('idle')
      if (camera?.clearOverlay) camera.clearOverlay()
      setResumeKey(k => k + 1)
    }, delay)
  }, [camera])

  const showAlertAndResume = useCallback((message, delay = 2200) => {
    setAlertState(message)
    scheduleResume(delay)
  }, [scheduleResume])

  const pauseScanning = useCallback(() => {
    pausedRef.current = true
    stopLoop()
    if (camera?.clearOverlay) camera.clearOverlay()
  }, [camera, stopLoop])

  return {
    kioskState,
    setKioskState,
    currentMatch,
    setCurrentMatch,
    capturedFrameUrl,
    setCapturedFrameUrl,
    flashKey,
    setFlashKey,
    alertState,
    setAlertState,
    resumeKey,
    setResumeKey,
    faceDistanceInfo,
    setFaceDistanceInfo,
    confirmRef,
    confirmedTimer,
    unknownTimer,
    resumeTimerRef,
    attemptCooldownUntilRef,
    faceLossTimerRef,
    pausedRef,
    stopLoop,
    scheduleResume,
    showAlertAndResume,
    pauseScanning,
  }
}
