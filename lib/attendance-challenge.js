import 'server-only'

import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'

const ATTENDANCE_CHALLENGE_COLLECTION = 'attendance_challenges'
const ATTENDANCE_CHALLENGE_TTL_MS = 30 * 1000

function sanitizeContext(context) {
  const value = context && typeof context === 'object' ? context : {}
  return {
    kioskId: String(value.kioskId || '').slice(0, 120),
    source: String(value.source || '').slice(0, 40),
    userAgent: String(value.userAgent || '').slice(0, 512),
  }
}

export async function issueAttendanceChallenge(db, context) {
  const token = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = now + ATTENDANCE_CHALLENGE_TTL_MS
  const safeContext = sanitizeContext(context)

  await db.collection(ATTENDANCE_CHALLENGE_COLLECTION).doc(token).set({
    ...safeContext,
    token,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(expiresAt),
    expiresAtMs: expiresAt,
    usedAt: null,
  }, { merge: false })

  return {
    token,
    expiresAt,
  }
}

export async function consumeAttendanceChallenge(db, challenge, context) {
  const token = String(challenge?.token || '').trim()
  if (!token) {
    return {
      ok: false,
      message: 'Attendance challenge is missing.',
      decisionCode: 'blocked_invalid_challenge',
    }
  }

  const safeContext = sanitizeContext(context)
  const ref = db.collection(ATTENDANCE_CHALLENGE_COLLECTION).doc(token)

  return db.runTransaction(async transaction => {
    const doc = await transaction.get(ref)
    if (!doc.exists) {
      return {
        ok: false,
        message: 'Attendance challenge is invalid or already consumed.',
        decisionCode: 'blocked_invalid_challenge',
      }
    }

    const data = doc.data() || {}
    if (data.usedAt) {
      return {
        ok: false,
        message: 'Attendance challenge was already consumed.',
        decisionCode: 'blocked_invalid_challenge',
      }
    }

    if (Number(data.expiresAtMs || 0) < Date.now()) {
      transaction.delete(ref)
      return {
        ok: false,
        message: 'Attendance challenge expired. Retry the scan.',
        decisionCode: 'blocked_expired_challenge',
      }
    }

    if (data.kioskId && safeContext.kioskId && String(data.kioskId) !== safeContext.kioskId) {
      return {
        ok: false,
        message: 'Attendance challenge does not belong to this kiosk session.',
        decisionCode: 'blocked_invalid_challenge',
      }
    }

    transaction.update(ref, {
      usedAt: FieldValue.serverTimestamp(),
      usedKioskId: safeContext.kioskId,
      usedSource: safeContext.source,
      usedUserAgent: safeContext.userAgent,
    })

    return { ok: true }
  })
}
