'use client'

import { useCallback, useMemo } from 'react'

export function useAudioCue() {
  const sounds = useMemo(() => ({
    notify: typeof Audio !== 'undefined' ? new Audio('/audio/notif.mp3') : null,
    success: typeof Audio !== 'undefined' ? new Audio('/audio/success.mp3') : null,
  }), [])

  return useCallback(type => {
    const sound = sounds[type]
    if (!sound) return

    sound.currentTime = 0
    sound.play().catch(() => {})
  }, [sounds])
}

