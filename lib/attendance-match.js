const SCAN_MATCH_TTL_MS = 30 * 60 * 1000
const LAST_SCAN_MATCH_KEY = 'lastScanMatch'
const CURRENT_EMPLOYEE_ID_KEY = 'currentEmployeeId'
const CURRENT_PERSON_ID_KEY = 'currentPersonId'
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
  const personId = String(match?.personId || '').trim()
  const employeeId = String(match?.employeeId || '').trim()
  if (!personId && !employeeId) return

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
    personId,
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
    if (personId) sessionStorage.setItem(CURRENT_PERSON_ID_KEY, personId)
    else sessionStorage.removeItem(CURRENT_PERSON_ID_KEY)
    if (employeeId) sessionStorage.setItem(CURRENT_EMPLOYEE_ID_KEY, employeeId)
    else sessionStorage.removeItem(CURRENT_EMPLOYEE_ID_KEY)
    if (employeeViewSession) {
      sessionStorage.setItem(EMPLOYEE_VIEW_SESSION_KEY, employeeViewSession)
    } else sessionStorage.removeItem(EMPLOYEE_VIEW_SESSION_KEY)
    if (employeeViewSessionExpiresAt) sessionStorage.setItem(EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY, String(employeeViewSessionExpiresAt))
    else sessionStorage.removeItem(EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY)
  })
}

export function loadAttendanceMatch() {
  return safelyRun(() => {
    const raw = localStorage.getItem(LAST_SCAN_MATCH_KEY)
    if (!raw) return null

    const match = JSON.parse(raw)
    const personId = String(match?.personId || '').trim()
    const employeeId = String(match?.employeeId || '').trim()
    const timestamp = Number(match?.timestamp || 0)
    if ((!personId && !employeeId) || !isFiniteTimestamp(timestamp)) return null

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
      personId,
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
  if (savedMatch?.personId || savedMatch?.employeeId) {
    return {
      personId: savedMatch.personId || '',
      employeeId: savedMatch.employeeId,
      employeeViewSession: savedMatch.employeeViewSession || '',
      employeeViewSessionExpiresAt: savedMatch.employeeViewSessionExpiresAt || null,
    }
  }

  return safelyRun(() => {
    const personId = String(sessionStorage.getItem(CURRENT_PERSON_ID_KEY) || '').trim()
    const employeeId = String(sessionStorage.getItem(CURRENT_EMPLOYEE_ID_KEY) || '').trim()
    if (!personId && !employeeId) return null

    const employeeViewSession = String(sessionStorage.getItem(EMPLOYEE_VIEW_SESSION_KEY) || '').trim()
    const employeeViewSessionExpiresAt = Number(sessionStorage.getItem(EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY) || 0)
    if (isFiniteTimestamp(employeeViewSessionExpiresAt) && employeeViewSessionExpiresAt < getNow()) {
      clearAttendanceMatch()
      return null
    }

    return {
      personId,
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
    sessionStorage.removeItem(CURRENT_PERSON_ID_KEY)
    sessionStorage.removeItem(CURRENT_EMPLOYEE_ID_KEY)
    sessionStorage.removeItem(EMPLOYEE_VIEW_SESSION_KEY)
    sessionStorage.removeItem(EMPLOYEE_VIEW_SESSION_EXPIRES_AT_KEY)
  })
}
