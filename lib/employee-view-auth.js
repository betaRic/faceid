import 'server-only'

import crypto from 'crypto'
import { firebaseAdminConfigured } from '@/lib/firebase-admin'

const SESSION_COOKIE = 'employee_view_session'
const SESSION_TTL_SECONDS = 60 * 30
const SESSION_COLLECTION = 'employee_view_sessions'

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
  return Boolean(getSessionConfig().secret || firebaseAdminConfigured())
}

export function getEmployeeViewSessionCookieName() { return SESSION_COOKIE }
export function getEmployeeViewSessionMaxAge() { return SESSION_TTL_SECONDS }

export function getEmployeeViewSessionRequestValue(request) {
  const cookieValue = request?.cookies?.get?.(getEmployeeViewSessionCookieName())?.value
  if (cookieValue) return String(cookieValue)

  const headerValue = request?.headers?.get?.('x-employee-view-session')
  if (headerValue) return String(headerValue)

  return ''
}

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

function hashSessionToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function buildStoredSessionKey(session = {}) {
  const personId = String(session.personId || '').trim()
  if (personId) return `person:${personId}`
  return `employee:${normalizeEmployeeId(session.employeeId)}`
}

function createOpaqueSessionToken() {
  return `evs_${crypto.randomBytes(32).toString('base64url')}`
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

export function parseEmployeeViewSessionRequest(request) {
  return parseEmployeeViewSessionCookieValue(getEmployeeViewSessionRequestValue(request))
}

export function employeeViewSessionMatchesEmployee(session, employeeId) {
  return normalizeEmployeeId(session?.employeeId) === normalizeEmployeeId(employeeId)
}

export async function issueEmployeeViewSession(db, session = {}) {
  const employeeId = normalizeEmployeeId(session.employeeId)
  if (!employeeId) throw new Error('Employee ID is required for employee view sessions')

  const expiresAtMs = Date.now() + (SESSION_TTL_SECONDS * 1000)
  const secret = getSessionConfig().secret
  if (secret) {
    return {
      value: createEmployeeViewSessionCookieValue(session),
      expiresAtMs,
      storage: 'signed',
    }
  }

  if (!db) throw new Error('Employee view session store is unavailable')

  const token = createOpaqueSessionToken()
  const tokenHash = hashSessionToken(token)
  const sessionKey = buildStoredSessionKey(session)
  await db.collection(SESSION_COLLECTION).doc(sessionKey).set({
    role: 'employee-view',
    employeeId,
    personId: String(session.personId || '').trim(),
    officeId: String(session.officeId || '').trim(),
    tokenHash,
    issuedAtMs: Date.now(),
    expiresAtMs,
  })

  return {
    value: token,
    expiresAtMs,
    storage: 'firestore',
  }
}

async function resolveStoredEmployeeViewSession(db, requestValue) {
  if (!db || !requestValue) return null

  const snapshot = await db
    .collection(SESSION_COLLECTION)
    .where('tokenHash', '==', hashSessionToken(requestValue))
    .limit(1)
    .get()

  if (snapshot.empty) return null

  const record = snapshot.docs[0]
  const data = record.data() || {}
  const expiresAtMs = Number(data.expiresAtMs || 0)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await record.ref.delete().catch(() => {})
    return null
  }

  return {
    role: 'employee-view',
    employeeId: normalizeEmployeeId(data.employeeId),
    personId: String(data.personId || '').trim(),
    officeId: String(data.officeId || '').trim(),
    iat: Math.floor(Number(data.issuedAtMs || 0) / 1000),
    exp: Math.floor(expiresAtMs / 1000),
    storage: 'firestore',
  }
}

export async function resolveEmployeeViewSessionRequest(request, db) {
  const requestValue = getEmployeeViewSessionRequestValue(request)
  const signedSession = parseEmployeeViewSessionCookieValue(requestValue)
  if (signedSession) return signedSession
  return resolveStoredEmployeeViewSession(db, requestValue)
}
