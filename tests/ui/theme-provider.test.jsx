import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeProvider, { useTheme } from '@/components/ThemeProvider'
import ThemeSelector from '@/components/ThemeSelector'
import {
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  normalizeThemePreference,
  resolveTheme,
} from '@/lib/theme'

function ThemeProbe() {
  const { preference, resolvedTheme, setPreference } = useTheme()
  return (
    <div>
      <output data-testid="preference">{preference}</output>
      <output data-testid="resolved-theme">{resolvedTheme}</output>
      <button onClick={() => setPreference('dark')} type="button">Choose dark</button>
      <button onClick={() => setPreference('system')} type="button">Choose system</button>
    </div>
  )
}

function installMediaQuery(matches = false) {
  let listener = null
  const mediaQuery = {
    matches,
    media: THEME_MEDIA_QUERY,
    addEventListener: vi.fn((event, callback) => {
      if (event === 'change') listener = callback
    }),
    removeEventListener: vi.fn((event, callback) => {
      if (event === 'change' && listener === callback) listener = null
    }),
  }
  window.matchMedia = vi.fn(() => mediaQuery)
  return {
    mediaQuery,
    setMatches(nextMatches) {
      mediaQuery.matches = nextMatches
      listener?.({ matches: nextMatches, media: THEME_MEDIA_QUERY })
    },
  }
}

describe('theme preference contract', () => {
  it('normalizes saved values and resolves system preference', () => {
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('dark')).toBe('dark')
    expect(normalizeThemePreference('invalid')).toBe('system')
    expect(resolveTheme('system', { matches: true })).toBe('dark')
    expect(resolveTheme('system', { matches: false })).toBe('light')
    expect(resolveTheme('dark', { matches: false })).toBe('dark')
  })

  it('applies both resolved theme and preference to the root', () => {
    expect(applyResolvedTheme(document.documentElement, 'system', { matches: true })).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme-preference')
    document.documentElement.style.colorScheme = ''
  })

  it('defaults to system and follows operating-system changes', async () => {
    const media = installMediaQuery(true)
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(media.mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    media.setMatches(false)
    expect(await screen.findByText('light', { selector: '[data-testid="resolved-theme"]' })).toBeVisible()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('persists an explicit choice and ignores later operating-system changes', async () => {
    const media = installMediaQuery(false)
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    await userEvent.click(screen.getByRole('button', { name: 'Choose dark' }))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getByTestId('preference')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(media.mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    media.setMatches(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('normalizes a malformed saved preference to system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    installMediaQuery(false)
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('keeps the first browser render identical to server markup when a saved theme exists', () => {
    const browserWindow = globalThis.window
    delete globalThis.window
    const serverMarkup = renderToString(<ThemeProvider><ThemeSelector /></ThemeProvider>)
    globalThis.window = browserWindow

    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const firstBrowserMarkup = renderToString(<ThemeProvider><ThemeSelector /></ThemeProvider>)

    expect(firstBrowserMarkup).toBe(serverMarkup)
    expect(serverMarkup).toContain('Theme: System')
  })
})
