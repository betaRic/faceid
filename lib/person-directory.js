const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 50

export function clampPersonDirectoryLimit(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_PAGE_SIZE
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(numeric)))
}

export function inferPersonDirectorySearchMode(query) {
  const normalized = String(query || '').trim()
  if (!normalized) return 'none'
  return /[\d-]/.test(normalized) && !normalized.includes(' ') ? 'employeeId' : 'name'
}

export function normalizePersonDirectorySearchValue(query, mode = inferPersonDirectorySearchMode(query)) {
  const normalized = String(query || '').trim()
  if (!normalized) return ''
  return mode === 'employeeId' ? normalized : normalized.toLowerCase()
}

export function getPersonDirectorySortFields(mode) {
  return mode === 'employeeId'
    ? ['employeeId', 'nameLower']
    : ['nameLower', 'employeeId']
}

export function encodePersonDirectoryCursor(record, mode) {
  if (!record?.id) return ''

  const [primaryField, secondaryField] = getPersonDirectorySortFields(mode)
  return Buffer.from(JSON.stringify({
    mode,
    primary: String(record[primaryField] || ''),
    secondary: String(record[secondaryField] || ''),
    id: String(record.id || ''),
  })).toString('base64url')
}

export function decodePersonDirectoryCursor(value) {
  if (!value) return null

  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.id) return null

    return {
      mode: String(parsed.mode || 'none'),
      primary: String(parsed.primary || ''),
      secondary: String(parsed.secondary || ''),
      id: String(parsed.id || ''),
    }
  } catch {
    return null
  }
}

export const PERSON_DIRECTORY_DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE

