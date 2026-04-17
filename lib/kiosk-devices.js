import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'

const KIOSK_DEVICES_COLLECTION = 'kiosk_devices'
const DEVICE_TOUCH_THROTTLE_MS = 2 * 60 * 1000

function sanitizeText(value, limit = 160) {
  return String(value || '').trim().slice(0, limit)
}

function coerceTimestamp(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (Number.isFinite(value)) return Number(value)
  return 0
}

export async function touchKioskDevice(db, kioskContext, extra = {}) {
  const kioskId = sanitizeText(kioskContext?.kioskId, 120)
  if (!kioskId) return null

  const source = sanitizeText(kioskContext?.source || extra?.source || 'web-kiosk', 40)
  const userAgent = sanitizeText(kioskContext?.userAgent || extra?.userAgent, 512)
  const officeId = sanitizeText(extra?.officeId, 64)
  const officeName = sanitizeText(extra?.officeName, 160)
  const decisionCode = sanitizeText(extra?.decisionCode, 80)
  const deviceRef = db.collection(KIOSK_DEVICES_COLLECTION).doc(kioskId)
  const existing = await deviceRef.get()
  const existingData = existing.exists ? existing.data() || {} : {}
  const lastSeenAtMs = coerceTimestamp(existingData.lastSeenAt)
  const recentlyTouched = lastSeenAtMs > 0 && (Date.now() - lastSeenAtMs) < DEVICE_TOUCH_THROTTLE_MS
  const unchangedMetadata = (
    String(existingData.source || '') === source
    && String(existingData.officeId || '') === officeId
    && String(existingData.officeName || '') === officeName
    && String(existingData.lastDecisionCode || '') === decisionCode
    && String(existingData.lastUserAgent || '') === userAgent
  )

  if (existing.exists && recentlyTouched && unchangedMetadata) {
    return kioskId
  }

  await deviceRef.set({
    kioskId,
    source,
    active: true,
    officeId,
    officeName,
    lastDecisionCode: decisionCode,
    lastSeenAt: FieldValue.serverTimestamp(),
    lastUserAgent: userAgent,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { firstSeenAt: FieldValue.serverTimestamp() }),
  }, { merge: true })

  return kioskId
}
