import 'server-only'

import crypto from 'crypto'
import { getAdminProfileByEmail } from './admin-directory'

const SESSION_COOKIE = 'admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8

function getSessionConfig() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim()

  return { secret }
}

export function createAdminSessionCookieValue(session = {}) {
  const { secret } = getSessionConfig()
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')

  const scope = normalizeAdminScope(session.scope)
  const officeId = scope === 'office' ? String(session.officeId || '') : ''

  const payload = {
    role: 'admin',
    scope,
    officeId,
    email: String(session.email || '').trim().toLowerCase(),
    uid: String(session.uid || '').trim(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function verifyAdminSessionCookieValue(cookieValue) {
  return Boolean(parseAdminSessionCookieValue(cookieValue))
}

export function parseAdminSessionCookieValue(cookieValue) {
  const { secret } = getSessionConfig()
  if (!secret || !cookieValue) return null

  const [encodedPayload, providedSignature] = cookieValue.split('.')
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = sign(encodedPayload, secret)
  if (!safeEqual(providedSignature, expectedSignature)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (payload.role !== 'admin' || payload.exp <= Math.floor(Date.now() / 1000)) return null

    const scope = normalizeAdminScope(payload.scope)
    return {
      role: 'admin',
      scope,
      officeId: scope === 'office' ? String(payload.officeId || '') : '',
      email: String(payload.email || '').trim().toLowerCase(),
      uid: String(payload.uid || '').trim(),
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

export function adminSessionAllowsOffice(session, officeId) {
  if (!session || session.role !== 'admin') return false
  if (session.scope !== 'office') return true
  return session.officeId === officeId
}

export function isRegionalAdminSession(session) {
  return Boolean(session && session.role === 'admin' && session.scope === 'regional')
}

export function getAdminSessionCookieName() {
  return SESSION_COOKIE
}

export function getAdminSessionMaxAge() {
  return SESSION_TTL_SECONDS
}

// In-memory cache for admin session re-validation. Works within a warm serverless instance.
const sessionValidationCache = new Map()
const VALIDATION_CACHE_TTL_MS = 60 * 1000

export async function revalidateAdminSession(db, session) {
  if (!session?.email) return false

  const cached = sessionValidationCache.get(session.email)
  if (cached && cached.expiresAt > Date.now()) return cached.valid

  const profile = await getAdminProfileByEmail(db, session.email)
  const valid = Boolean(profile?.active)

  sessionValidationCache.set(session.email, { valid, expiresAt: Date.now() + VALIDATION_CACHE_TTL_MS })

  // Prune stale entries to prevent unbounded growth
  if (sessionValidationCache.size > 200) {
    const now = Date.now()
    for (const [key, entry] of sessionValidationCache) {
      if (entry.expiresAt <= now) sessionValidationCache.delete(key)
    }
  }

  return valid
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(left)
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizeAdminScope(value) {
  return String(value || 'regional').trim().toLowerCase() === 'office' ? 'office' : 'regional'
}
