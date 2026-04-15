import 'server-only'

import crypto from 'crypto'

const SESSION_COOKIE = 'employee_view_session'
const SESSION_TTL_SECONDS = 60 * 30

function getSessionConfig() {
  return { secret: process.env.EMPLOYEE_VIEW_SESSION_SECRET?.trim() }
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left, right) {
  const l = Buffer.isBuffer(left) ? left : Buffer.from(left)
  const r = Buffer.isBuffer(right) ? right : Buffer.from(right)
  if (l.length !== r.length) return false
  if (typeof crypto.timingSafeEqual === 'function') return crypto.timingSafeEqual(l, r)
  return l.equals(r)
}

function normalizeEmployeeId(value) {
  return String(value || '').trim()
}

export function isEmployeeViewSessionConfigured() {
  return Boolean(getSessionConfig().secret)
}

export function getEmployeeViewSessionCookieName() { return SESSION_COOKIE }
export function getEmployeeViewSessionMaxAge() { return SESSION_TTL_SECONDS }

export function createEmployeeViewSessionCookieValue(session = {}) {
  const { secret } = getSessionConfig()
  if (!secret) throw new Error('EMPLOYEE_VIEW_SESSION_SECRET is not configured')

  const employeeId = normalizeEmployeeId(session.employeeId)
  if (!employeeId) throw new Error('Employee ID is required for employee view sessions')

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    role: 'employee-view',
    employeeId,
    personId: String(session.personId || '').trim(),
    officeId: String(session.officeId || '').trim(),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function parseEmployeeViewSessionCookieValue(cookieValue) {
  const { secret } = getSessionConfig()
  if (!secret || !cookieValue) return null

  const [encodedPayload, providedSignature] = cookieValue.split('.')
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = sign(encodedPayload, secret)
  if (!safeEqual(providedSignature, expectedSignature)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (payload.role !== 'employee-view') return null

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp <= now) return null

    return {
      role: 'employee-view',
      employeeId: normalizeEmployeeId(payload.employeeId),
      personId: String(payload.personId || '').trim(),
      officeId: String(payload.officeId || '').trim(),
      iat: Number(payload.iat || 0),
      exp: Number(payload.exp || 0),
    }
  } catch {
    return null
  }
}

export function employeeViewSessionMatchesEmployee(session, employeeId) {
  return normalizeEmployeeId(session?.employeeId) === normalizeEmployeeId(employeeId)
}
