import 'server-only'
import { kvIncr, kvExpire, kvAvailable } from './kv-utils'

/**
 * Rate limiting via Vercel KV (Redis).
 * Degrades gracefully to "allow all" when KV is not available.
 */

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9:_.-]/g, '-')
    .slice(0, 180)
}

export function getRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || request.socket?.remoteAddress || ''
}

export async function enforceRateLimit(db, { key, limit, windowMs }) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) return { ok: true, remaining: limit }

  if (!kvAvailable) {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed in production — deny requests when KV is unavailable
      console.error('[RateLimit] KV not available in production, denying request for:', normalizedKey)
      return { ok: false, remaining: 0 }
    }
    // Local dev without KV: allow
    return { ok: true, remaining: limit }
  }

  const kvKey = `rl:${normalizedKey}`
  const windowSeconds = Math.ceil(windowMs / 1000)

  const count = await kvIncr(kvKey)
  if (count === null) {
    // KV operation failed — fail closed in production, open in dev
    if (process.env.NODE_ENV === 'production') return { ok: false, remaining: 0 }
    return { ok: true, remaining: limit }
  }

  if (count === 1) {
    await kvExpire(kvKey, windowSeconds)
  }

  return { ok: count <= limit, remaining: Math.max(0, limit - count) }
}
