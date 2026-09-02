import 'server-only'

import crypto from 'crypto'
import { getHrProfileById } from './hr-directory'
import { getOfficeRecord } from './office-directory'
import { hrScopeAllowsOffice, normalizeHrScope, validateHrOfficeAssignment } from './hr-scope'

const SESSION_COOKIE = 'hr_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8
const SESSION_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 2
const HR_PIN_SESSION_EMAIL = 'hr-pin-admin@local'
const HR_PIN_SESSION_UID = 'hr-pin'

function getSessionConfig() {
  return { secret: process.env.HR_SESSION_SECRET?.trim() }
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

export function createHrSessionCookieValue(session = {}) {
  const { secret } = getSessionConfig()
  if (!secret) throw new Error('HR_SESSION_SECRET is not configured')

  const scope = normalizeHrScope(session.scope)
  const officeId = String(session.officeId || '').trim()
  const now = Math.floor(Date.now() / 1000)

  const payload = {
    role: 'hr',
    scope,
    officeId,
    email: String(session.email || '').trim().toLowerCase(),
    uid: String(session.uid || '').trim(),
    hrUserId: String(session.hrUserId || '').trim(),
    authMethod: 'named_pin',
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function parseHrSessionCookieValue(cookieValue) {
  const { secret } = getSessionConfig()
  if (!secret || !cookieValue) return null

  const [encodedPayload, providedSignature] = cookieValue.split('.')
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = sign(encodedPayload, secret)
  if (!safeEqual(providedSignature, expectedSignature)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (payload.role !== 'hr') return null

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp <= now) return null

    const scope = normalizeHrScope(payload.scope)
    return {
      role: 'hr',
      scope,
      officeId: String(payload.officeId || '').trim(),
      email: String(payload.email || '').trim().toLowerCase(),
      uid: String(payload.uid || '').trim(),
      hrUserId: String(payload.hrUserId || '').trim(),
      authMethod: 'named_pin',
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

export function verifyHrSessionCookieValue(cookieValue) {
  return Boolean(parseHrSessionCookieValue(cookieValue))
}

export function sessionNeedsRefresh(session) {
  if (!session) return false
  const now = Math.floor(Date.now() / 1000)
  return session.exp - now < SESSION_REFRESH_THRESHOLD_SECONDS
}

export function sessionTimeRemaining(session) {
  if (!session) return 0
  return Math.max(0, session.exp - Math.floor(Date.now() / 1000))
}

export function hrSessionAllowsOffice(session, officeId) {
  return hrScopeAllowsOffice(session, officeId)
}

export function isRegionalHrSession(session) {
  return Boolean(session && session.role === 'hr' && session.scope === 'regional')
}

export function getHrSessionCookieName() { return SESSION_COOKIE }
export function getHrSessionMaxAge() { return SESSION_TTL_SECONDS }

export async function resolveHrSession(db, session) {
  if (!session?.email && !session?.hrUserId) return false

  if (session.hrUserId && session.email === HR_PIN_SESSION_EMAIL) {
    const officeId = String(session.officeId || '').trim()
    if (!officeId) return null
    return {
      ...session,
      scope: 'office',
      officeId,
      email: HR_PIN_SESSION_EMAIL,
      uid: HR_PIN_SESSION_UID,
      role: 'hr',
      permissions: ['employees', 'summary'],
      active: true,
      hrUserId: session.hrUserId,
      displayName: 'HR PIN User',
    }
  }

  if (!session.hrUserId) return null
  const profile = await getHrProfileById(db, session.hrUserId)
  if (!profile?.active || !profile.officeId) return null
  const office = await getOfficeRecord(db, profile.officeId)
  if (validateHrOfficeAssignment(profile.scope, office)) return null

  return {
    ...session,
    scope: profile.scope,
    officeId: profile.officeId,
    email: profile.email,
    role: profile.role,
    permissions: profile.permissions || ['employees', 'dtr'],
    active: profile.active,
    hrUserId: profile.id,
    displayName: profile.displayName,
  }
}

export function hashPin(pin) {
  const salt = process.env.HR_PIN_SALT?.trim() || 'hr-default-salt'
  return crypto.createHmac('sha256', salt).update(pin).digest('hex')
}

export function verifyPin(pin, storedHash) {
  if (!pin || !storedHash) return false
  const hashed = hashPin(pin)
  return crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(storedHash))
}
