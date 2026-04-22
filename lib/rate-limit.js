import 'server-only'
import { kvIncr, kvExpire, kvAvailable } from './kv-utils'

/**
 * Rate limiting via Vercel KV (Redis).
 * Falls back to in-memory Map when KV is not available. This resets on cold
 * start but avoids burning Firestore reads/writes on rate limit checks.
 */

const memoryStore = new Map()
const MEMORY_CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

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

  return { ok: nextCount <= limit, remaining: Math.max(0, limit - nextCount), backend: 'memory' }
}

export async function enforceRateLimit(db, { key, limit, windowMs }) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) return { ok: true, remaining: limit }

  const kvReady = await kvAvailable()
  if (!kvReady) {
    const memResult = enforceMemoryRateLimit({ normalizedKey, limit, windowMs })
    if (memResult) return memResult

    if (process.env.NODE_ENV === 'production') {
      return { ok: false, remaining: 0, backend: 'unavailable' }
    }
    return { ok: true, remaining: limit, backend: 'dev-open' }
  }

  const kvKey = `rl:${normalizedKey}`
  const windowSeconds = Math.ceil(windowMs / 1000)

  const count = await kvIncr(kvKey)
  if (count === null) {
    const memResult = enforceMemoryRateLimit({ normalizedKey, limit, windowMs })
    if (memResult) return memResult

    if (process.env.NODE_ENV === 'production') return { ok: false, remaining: 0, backend: 'unavailable' }
    return { ok: true, remaining: limit, backend: 'dev-open' }
  }

  if (count === 1) {
    await kvExpire(kvKey, windowSeconds)
  }

  return { ok: count <= limit, remaining: Math.max(0, limit - count), backend: 'kv' }
}
