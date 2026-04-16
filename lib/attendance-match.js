const SCAN_MATCH_TTL_MS = 30 * 60 * 1000
const LAST_SCAN_MATCH_KEY = 'lastScanMatch'
const CURRENT_EMPLOYEE_ID_KEY = 'currentEmployeeId'
const EMPLOYEE_VIEW_SESSION_KEY = 'employeeViewSession'
const EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY = 'employeeViewSessionExpiresAt'

function getNow() {
  return Date.now()
}

function isFiniteTimestamp(value) {
  return Number.isFinite(value) && Number(value) > 0
}

function safelyRun(action) {
  try {
    return action()
  } catch {
    return null
  }
}

export function saveAttendanceMatch(match) {
  const employeeId = String(match?.employeeId || '').trim()
  if (!employeeId) return

  const timestamp = getNow()
  const blocked = Boolean(match?.blocked || (!match?.action && match?.detail))
  const employeeViewSession = typeof match?.employeeViewSession === 'string' && match.employeeViewSession.trim()
    ? match.employeeViewSession.trim()
    : ''
  const employeeViewSessionExpiresAt = isFiniteTimestamp(match?.employeeViewSessionExpiresAt)
    ? Number(match.employeeViewSessionExpiresAt)
    : null

  const payload = {
    name: String(match?.name || '').trim(),
    employeeId,
    officeName: String(match?.officeName || '').trim(),
    timestamp,
    blocked,
    blockReason: blocked ? String(match?.detail || '').trim() || null : null,
    employeeViewSession: employeeViewSession || null,
    employeeViewSessionExpiresAt,
  }

  safelyRun(() => {
    localStorage.setItem(LAST_SCAN_MATCH_KEY, JSON.stringify(payload))
    sessionStorage.setItem(CURRENT_EMPLOYEE_ID_KEY, employeeId)
    if (employeeViewSession) {
      sessionStorage.setItem(EMPLOYEE_VIEW_SESSION_KEY, employeeViewSession)
    }
    if (employeeViewSessionExpiresAt) {
      sessionStorage.setItem(EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY, String(employeeViewSessionExpiresAt))
    }
  })
}

export function loadAttendanceMatch() {
  return safelyRun(() => {
    const raw = localStorage.getItem(LAST_SCAN_MATCH_KEY)
    if (!raw) return null

    const match = JSON.parse(raw)
    const employeeId = String(match?.employeeId || '').trim()
    const timestamp = Number(match?.timestamp || 0)
    if (!employeeId || !isFiniteTimestamp(timestamp)) return null

    if (getNow() - timestamp > SCAN_MATCH_TTL_MS) {
      clearAttendanceMatch()
      return null
    }

    const employeeViewSessionExpiresAt = isFiniteTimestamp(match?.employeeViewSessionExpiresAt)
      ? Number(match.employeeViewSessionExpiresAt)
      : null
    if (employeeViewSessionExpiresAt && employeeViewSessionExpiresAt < getNow()) {
      clearAttendanceMatch()
      return null
    }

    return {
      name: String(match?.name || '').trim(),
      employeeId,
      officeName: String(match?.officeName || '').trim(),
      timestamp,
      blocked: Boolean(match?.blocked),
      blockReason: match?.blockReason || null,
      employeeViewSession: typeof match?.employeeViewSession === 'string' ? match.employeeViewSession : '',
      employeeViewSessionExpiresAt,
    }
  })
}

export function loadEmployeeViewAccess() {
  const savedMatch = loadAttendanceMatch()
  if (savedMatch?.employeeId) {
    return {
      employeeId: savedMatch.employeeId,
      employeeViewSession: savedMatch.employeeViewSession || '',
      employeeViewSessionExpiresAt: savedMatch.employeeViewSessionExpiresAt || null,
    }
  }

  return safelyRun(() => {
    const employeeId = String(sessionStorage.getItem(CURRENT_EMPLOYEE_ID_KEY) || '').trim()
    if (!employeeId) return null

    const employeeViewSession = String(sessionStorage.getItem(EMPLOYEE_VIEW_SESSION_KEY) || '').trim()
    const employeeViewSessionExpiresAt = Number(sessionStorage.getItem(EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY) || 0)
    if (isFiniteTimestamp(employeeViewSessionExpiresAt) && employeeViewSessionExpiresAt < getNow()) {
      clearAttendanceMatch()
      return null
    }

    return {
      employeeId,
      employeeViewSession,
      employeeViewSessionExpiresAt: isFiniteTimestamp(employeeViewSessionExpiresAt)
        ? employeeViewSessionExpiresAt
        : null,
    }
  })
}

export function buildEmployeeViewHeaders(access) {
  const directToken = typeof access?.employeeViewSession === 'string'
    ? access.employeeViewSession.trim()
    : ''
  const fallbackToken = directToken
    ? ''
    : (loadEmployeeViewAccess()?.employeeViewSession || '').trim()
  const token = directToken || fallbackToken

  return token
    ? { 'x-employee-view-session': token }
    : {}
}

export function clearAttendanceMatch() {
  safelyRun(() => {
    localStorage.removeItem(LAST_SCAN_MATCH_KEY)
    sessionStorage.removeItem(CURRENT_EMPLOYEE_ID_KEY)
    sessionStorage.removeItem(EMPLOYEE_VIEW_SESSION_KEY)
    sessionStorage.removeItem(EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY)
  })
}
