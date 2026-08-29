export const THEME_STORAGE_KEY = 'veriface-theme'
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'
export const THEME_PREFERENCES = ['light', 'dark', 'system']

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system'
}

export function resolveTheme(preference, mediaQuery) {
  const normalized = normalizeThemePreference(preference)
  if (normalized !== 'system') return normalized
  return mediaQuery?.matches ? 'dark' : 'light'
}

export function applyResolvedTheme(root, preference, mediaQuery) {
  const normalized = normalizeThemePreference(preference)
  const resolved = resolveTheme(normalized, mediaQuery)

  root.dataset.theme = resolved
  root.dataset.themePreference = normalized
  root.style.colorScheme = resolved

  return resolved
}
