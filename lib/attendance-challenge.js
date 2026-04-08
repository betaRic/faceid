import 'server-only'

import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'

const ATTENDANCE_CHALLENGE_COLLECTION = 'attendance_challenges'
const ATTENDANCE_CHALLENGE_TTL_MS = 60 * 1000

const CHALLENGE_PROMPTS = [
  { id: 'blink_twice', label: 'Blink twice' },
  { id: 'turn_left', label: 'Turn slightly left' },
  { id: 'turn_right', label: 'Turn slightly right' },
  { id: 'look_up', label: 'Look slightly up' },
]

export function getAttendanceChallengeTtlMs() {
  return ATTENDANCE_CHALLENGE_TTL_MS
}

export function pickAttendanceChallenge() {
  return CHALLENGE_PROMPTS[Math.floor(Math.random() * CHALLENGE_PROMPTS.length)]
}

export async function issueAttendanceChallenge(db, metadata = {}) {
  const prompt = pickAttendanceChallenge()
  const challengeId = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = now + ATTENDANCE_CHALLENGE_TTL_MS

  await db.collection(ATTENDANCE_CHALLENGE_COLLECTION).doc(challengeId).set({
    promptId: prompt.id,
    promptLabel: prompt.label,
    issuedAt: now,
    expiresAt,
    consumedAt: null,
    status: 'issued',
    source: String(metadata.source || 'kiosk'),
    deviceLabel: String(metadata.deviceLabel || '').trim(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  return {
    challengeId,
    prompt,
    issuedAt: now,
    expiresAt,
  }
}

export async function consumeAttendanceChallenge(db, challengeId) {
  if (!challengeId) {
    return { ok: false, message: 'Attendance challenge is required.' }
  }

  const challengeRef = db.collection(ATTENDANCE_CHALLENGE_COLLECTION).doc(challengeId)

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(challengeRef)
    if (!snapshot.exists) {
      return { ok: false, message: 'Attendance challenge was not found.' }
    }

    const data = snapshot.data() || {}
    const now = Date.now()
    if (Number(data.expiresAt) < now) {
      transaction.set(challengeRef, {
        status: 'expired',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      return { ok: false, message: 'Attendance challenge expired. Try again.' }
    }

    if (data.consumedAt) {
      return { ok: false, message: 'Attendance challenge already used. Try again.' }
    }

    transaction.set(challengeRef, {
      consumedAt: now,
      status: 'consumed',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return {
      ok: true,
      challenge: {
        id: snapshot.id,
        promptId: String(data.promptId || ''),
        promptLabel: String(data.promptLabel || ''),
        issuedAt: Number(data.issuedAt || 0),
        expiresAt: Number(data.expiresAt || 0),
      },
    }
  })
}

export async function getAttendanceChallenge(db, challengeId) {
  if (!challengeId) return null

  const snapshot = await db.collection(ATTENDANCE_CHALLENGE_COLLECTION).doc(challengeId).get()
  if (!snapshot.exists) return null

  const data = snapshot.data() || {}
  return {
    id: snapshot.id,
    promptId: String(data.promptId || ''),
    promptLabel: String(data.promptLabel || ''),
    issuedAt: Number(data.issuedAt || 0),
    expiresAt: Number(data.expiresAt || 0),
    consumedAt: data.consumedAt ? Number(data.consumedAt) : null,
    status: String(data.status || ''),
  }
}
