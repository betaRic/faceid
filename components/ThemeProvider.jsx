'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  normalizeThemePreference,
  resolveTheme,
} from '@/lib/theme'

const ThemeContext = createContext(null)

function getMediaQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(THEME_MEDIA_QUERY)
}

function readSavedPreference() {
  if (typeof window === 'undefined') return 'system'
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export default function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState('system')
  const [resolvedTheme, setResolvedTheme] = useState('light')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const mediaQuery = getMediaQuery()
    const effectivePreference = hydrated ? preference : readSavedPreference()

    if (!hydrated) {
      setPreferenceState(effectivePreference)
      setHydrated(true)
    }

    function synchronizeTheme() {
      setResolvedTheme(applyResolvedTheme(document.documentElement, effectivePreference, mediaQuery))
    }

    synchronizeTheme()
    if (effectivePreference !== 'system' || !mediaQuery) return undefined

    mediaQuery.addEventListener?.('change', synchronizeTheme)
    return () => mediaQuery.removeEventListener?.('change', synchronizeTheme)
  }, [hydrated, preference])

  const setPreference = useCallback((nextPreference) => {
    const normalized = normalizeThemePreference(nextPreference)
    setPreferenceState(normalized)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized)
    } catch {
      // The current page still changes theme when browser storage is unavailable.
    }
  }, [])

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
