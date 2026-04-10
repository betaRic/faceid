import 'server-only'

/**
 * Rate limiting using Vercel KV (Redis).
 * No Firestore reads/writes — fast, cheap, and scales.
 */

async function tryKvRateLimit(normalizedKey, limit, windowMs) {
  const kvKey = `rl:${normalizedKey}`
  const windowSeconds = Math.ceil(windowMs / 1000)

  try {
    const { kv } = await import('@vercel/kv')
    const count = await kv.incr(kvKey)
    if (count === 1) await kv.expire(kvKey, windowSeconds)
    return { ok: count <= limit, remaining: Math.max(0, limit - count) }
  } catch {
    return { ok: true, remaining: limit }
  }
}

function normalizeToken(value) {
  const token = String(value || '').trim().toLowerCase()
  return token.replace(/[^a-z0-9:_.-]/g, '-').slice(0, 180)
}

export function getRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || request.socket?.remoteAddress || ''
}

export async function enforceRateLimit(db, { key, limit, windowMs }) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) return { ok: true, remaining: limit }
  return tryKvRateLimit(normalizedKey, limit, windowMs)
}

