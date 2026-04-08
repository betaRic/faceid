import 'server-only'

import crypto from 'crypto'

const SESSION_COOKIE = 'admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8

function getHashConfig() {
  const hashed = process.env.ADMIN_PIN_HASH?.trim()
  const plain = process.env.ADMIN_PIN?.trim()
  const secret = process.env.ADMIN_SESSION_SECRET?.trim()

  return { hashed, plain, secret }
}

export function adminAuthConfigured() {
  const { hashed, plain, secret } = getHashConfig()
  return Boolean((hashed || plain) && secret)
}

export function verifyAdminPin(pin) {
  const { hashed, plain } = getHashConfig()
  if (!pin) return false

  if (hashed) return verifyPbkdf2Hash(pin, hashed)
  if (plain) return crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(plain))
  return false
}

export function createAdminSessionCookieValue() {
  const { secret } = getHashConfig()
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')

  const payload = {
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function verifyAdminSessionCookieValue(cookieValue) {
  const { secret } = getHashConfig()
  if (!secret || !cookieValue) return false

  const [encodedPayload, providedSignature] = cookieValue.split('.')
  if (!encodedPayload || !providedSignature) return false

  const expectedSignature = sign(encodedPayload, secret)
  if (!safeEqual(providedSignature, expectedSignature)) return false

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    return payload.role === 'admin' && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export function getAdminSessionCookieName() {
  return SESSION_COOKIE
}

export function getAdminSessionMaxAge() {
  return SESSION_TTL_SECONDS
}

function verifyPbkdf2Hash(pin, stored) {
  const [scheme, iterationsRaw, saltBase64, hashBase64] = stored.split('$')
  if (scheme !== 'PBKDF2' || !iterationsRaw || !saltBase64 || !hashBase64) return false

  const iterations = Number(iterationsRaw)
  if (!Number.isFinite(iterations) || iterations <= 0) return false

  const salt = Buffer.from(saltBase64, 'base64')
  const expected = Buffer.from(hashBase64, 'base64')
  const actual = crypto.pbkdf2Sync(pin, salt, iterations, expected.length, 'sha256')

  return safeEqual(actual, expected)
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
