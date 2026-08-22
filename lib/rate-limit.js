import 'server-only'
import { consumePostgresRateLimit } from './postgres/rate-limit-store'

/**
 * PostgreSQL is the production rate-limit authority shared by every process.
 * The in-memory bucket is a development/test fallback only and resets when the
 * process restarts. Production fails closed if PostgreSQL is unavailable.
 */

const memoryStore = new Map()
const MEMORY_CLEANUP_INTERVAL_MS = 60_000
const UNAVAILABLE_CLIENT_IP = 'rate-limit-ip-unavailable'
let lastCleanup = Date.now()

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9:_.-]/g, '-')
    .slice(0, 180)
}

export function getRequestIp(request) {
  if (process.env.TRUST_SMARTASP_PROXY === 'true') {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const realIp = request.headers.get('x-real-ip')
    if (realIp) return realIp.trim()
  }
  const directAddress = String(request.ip || request.socket?.remoteAddress || '').trim()
  if (directAddress) return directAddress
  return process.env.NODE_ENV === 'production' ? UNAVAILABLE_CLIENT_IP : 'direct:unknown'
}

function enforceMemoryRateLimit({ normalizedKey, limit, windowMs }) {
  const now = Date.now()

  if (now - lastCleanup > MEMORY_CLEANUP_INTERVAL_MS) {
    for (const [k, v] of memoryStore) {
      if (v.expiresAt <= now) memoryStore.delete(k)
    }
    lastCleanup = now
  }

  const windowStart = Math.floor(now / windowMs) * windowMs
  const storeKey = `${normalizedKey}:${windowStart}`
  const entry = memoryStore.get(storeKey)
  const nextCount = (entry?.count || 0) + 1

  memoryStore.set(storeKey, {
    count: nextCount,
    expiresAt: windowStart + windowMs + 60_000,
  })

  return {
    ok: nextCount <= limit,
    remaining: Math.max(0, limit - nextCount),
    resetAt: windowStart + windowMs,
    backend: 'memory-fallback',
  }
}

export async function enforceRateLimit(_db, { key, limit, windowMs }, {
  consume = consumePostgresRateLimit,
} = {}) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) return { ok: false, remaining: 0, backend: 'invalid' }
  if (process.env.NODE_ENV === 'production' && normalizedKey.includes(UNAVAILABLE_CLIENT_IP)) {
    return { ok: false, remaining: 0, backend: 'identity-unavailable' }
  }

  try {
    return await consume({ key: normalizedKey, limit, windowMs })
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[rate-limit] PostgreSQL rate limit unavailable', { code: error?.code || 'unknown' })
      return { ok: false, remaining: 0, backend: 'unavailable' }
    }
    return enforceMemoryRateLimit({ normalizedKey, limit, windowMs })
  }
}
