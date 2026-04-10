import 'server-only'

import crypto from 'crypto'
import { getAdminProfileByEmail } from './admin-directory'

const SESSION_COOKIE = 'admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8
const REGIONAL_PIN_SESSION_EMAIL = 'regional-pin-admin@local'
const REGIONAL_PIN_SESSION_UID = 'regional-pin-admin'

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

export function getRegionalPin() {
  return String(process.env.ADMIN_REGIONAL_PIN || '').trim()
}

export function isRegionalPinConfigured() {
  return Boolean(getRegionalPin())
}

const SESSION_CACHE_TTL_SECONDS = 60

export async function resolveAdminSession(db, session) {
  if (!session?.email) return false

  if (isRegionalPinSession(session)) {
    return isRegionalPinConfigured()
      ? {
          ...session,
          scope: 'regional',
          officeId: '',
          email: REGIONAL_PIN_SESSION_EMAIL,
          uid: REGIONAL_PIN_SESSION_UID,
          role: 'admin',
          active: true,
          adminId: 'regional-pin',
          displayName: 'Regional PIN Admin',
        }
      : null
  }

  try {
    const { kv } = await import('@vercel/kv')
    const cacheKey = `admin_profile:${session.email}`
    const cached = await kv.get(cacheKey)
    if (cached !== null) {
      if (!cached?.active) return null
      return {
        ...session,
        scope: cached.scope,
        officeId: cached.officeId,
        email: cached.email,
        role: cached.role,
        active: cached.active,
        adminId: cached.id,
        displayName: cached.displayName,
      }
    }
  } catch {}

  const profile = await getAdminProfileByEmail(db, session.email)
  try {
    const { kv } = await import('@vercel/kv')
    await kv.set(`admin_profile:${session.email}`, profile, { ex: SESSION_CACHE_TTL_SECONDS })
  } catch {}

  if (!profile?.active) return null

  return {
    ...session,
    scope: profile.scope,
    officeId: profile.officeId,
    email: profile.email,
    role: profile.role,
    active: profile.active,
    adminId: profile.id,
    displayName: profile.displayName,
  }
}

export async function revalidateAdminSession(db, session) {
  return Boolean(await resolveAdminSession(db, session))
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

function isRegionalPinSession(session) {
  return (
    session?.scope === 'regional' &&
    String(session?.email || '').trim().toLowerCase() === REGIONAL_PIN_SESSION_EMAIL &&
    String(session?.uid || '').trim() === REGIONAL_PIN_SESSION_UID
  )
}

