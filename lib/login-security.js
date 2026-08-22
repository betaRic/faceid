import 'server-only'

import crypto from 'node:crypto'
import { enforceRateLimit, getRequestIp } from './rate-limit'

const TEN_MINUTES_MS = 10 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function getLoginSecuritySecret() {
  const secret = String(
    process.env.LOGIN_RATE_LIMIT_SECRET
      || process.env.ADMIN_SESSION_SECRET
      || process.env.HR_SESSION_SECRET
      || '',
  ).trim()

  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Login security secret is not configured.')
  }
  return 'faceattend-local-login-security'
}

function digestPin(pin) {
  return crypto
    .createHmac('sha256', getLoginSecuritySecret())
    .update('staff-pin\0')
    .update(String(pin || '').trim())
    .digest()
}

export function getLoginCredentialFingerprint(pin) {
  return digestPin(pin).toString('hex')
}

export function verifySharedRegionalPin(submittedPin, configuredPin) {
  if (!String(configuredPin || '').trim()) return false
  return crypto.timingSafeEqual(digestPin(submittedPin), digestPin(configuredPin))
}

export async function enforceLoginRateLimits(request, pin, { enforce = enforceRateLimit } = {}) {
  const requestIp = getRequestIp(request)
  const credentialFingerprint = getLoginCredentialFingerprint(pin)
  const limits = [
    { key: `login-network-short:${requestIp}`, limit: 15, windowMs: TEN_MINUTES_MS },
    { key: `login-credential-short:${credentialFingerprint}`, limit: 5, windowMs: TEN_MINUTES_MS },
    { key: `login-credential-day:${credentialFingerprint}`, limit: 30, windowMs: ONE_DAY_MS },
  ]

  for (const limit of limits) {
    const result = await enforce(null, limit)
    if (!result.ok) {
      return {
        ...result,
        ok: false,
        credentialFingerprint,
        shouldAuditLockout: Number(result.count) === limit.limit + 1,
      }
    }
  }

  return { ok: true, credentialFingerprint }
}
