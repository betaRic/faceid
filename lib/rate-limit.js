import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '-')
    .slice(0, 180)
}

export function getRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || ''
  const realIp = request.headers.get('x-real-ip') || ''
  return String(forwarded.split(',')[0] || realIp || 'unknown').trim()
}

export async function enforceRateLimit(db, { key, limit, windowMs }) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) {
    return { ok: true, remaining: limit }
  }

  const ref = db.collection('rate_limits').doc(normalizedKey)
  const now = Date.now()

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref)
    const data = snapshot.exists ? snapshot.data() : null
    const resetAt = Number(data?.resetAt ?? 0)
    const count = Number(data?.count ?? 0)

    if (!data || resetAt <= now) {
      transaction.set(ref, {
        count: 1,
        resetAt: now + windowMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      return { ok: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs }
    }

    if (count >= limit) {
      return { ok: false, remaining: 0, resetAt }
    }

    transaction.set(ref, {
      count: count + 1,
      resetAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return { ok: true, remaining: Math.max(0, limit - (count + 1)), resetAt }
  })
}
