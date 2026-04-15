import 'server-only'
import { kvIncr, kvExpire, kvAvailable } from './kv-utils'

/**
 * Rate limiting via Vercel KV (Redis).
 * Falls back to Firestore when KV is not available so critical flows
 * stay online during cache outages.
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

async function enforceFirestoreRateLimit(db, { normalizedKey, limit, windowMs }) {
  if (!db) return null

  const now = Date.now()
  const windowStartMs = Math.floor(now / windowMs) * windowMs
  const windowEndMs = windowStartMs + windowMs
  const docId = `${normalizedKey}:${windowStartMs}`
  const ref = db.collection('rate_limits').doc(docId)

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref)
    const nextCount = Number(snapshot.data()?.count || 0) + 1

    transaction.set(ref, {
      key: normalizedKey,
      count: nextCount,
      windowStartMs,
      windowEndMs,
      updatedAtMs: now,
      // Optional Firestore TTL hook if enabled in the project later.
      expiresAt: new Date(windowEndMs + (24 * 60 * 60 * 1000)),
    }, { merge: true })

    return { ok: nextCount <= limit, remaining: Math.max(0, limit - nextCount), backend: 'firestore' }
  })
}

export async function enforceRateLimit(db, { key, limit, windowMs }) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) return { ok: true, remaining: limit }

  const kvReady = await kvAvailable()
  if (!kvReady) {
    try {
      const fallback = await enforceFirestoreRateLimit(db, { normalizedKey, limit, windowMs })
      if (fallback) return fallback
    } catch (error) {
      console.error('[RateLimit] Firestore fallback failed for:', normalizedKey, error)
    }

    if (process.env.NODE_ENV === 'production') {
      console.error('[RateLimit] KV unavailable and Firestore fallback failed, denying request for:', normalizedKey)
      return { ok: false, remaining: 0, backend: 'unavailable' }
    }

    return { ok: true, remaining: limit, backend: 'dev-open' }
  }

  const kvKey = `rl:${normalizedKey}`
  const windowSeconds = Math.ceil(windowMs / 1000)

  const count = await kvIncr(kvKey)
  if (count === null) {
    try {
      const fallback = await enforceFirestoreRateLimit(db, { normalizedKey, limit, windowMs })
      if (fallback) return fallback
    } catch (error) {
      console.error('[RateLimit] Firestore fallback failed after KV increment failure for:', normalizedKey, error)
    }

    if (process.env.NODE_ENV === 'production') return { ok: false, remaining: 0, backend: 'unavailable' }
    return { ok: true, remaining: limit, backend: 'dev-open' }
  }

  if (count === 1) {
    await kvExpire(kvKey, windowSeconds)
  }

  return { ok: count <= limit, remaining: Math.max(0, limit - count), backend: 'kv' }
}
