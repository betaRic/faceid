import 'server-only'

function sanitizeText(value, limit = 160) {
  return String(value || '').trim().slice(0, limit)
}

export async function touchKioskDevice(db, kioskContext, extra = {}) {
  const kioskId = sanitizeText(kioskContext?.kioskId, 120)
  if (!kioskId) return null
  return {
    kioskId,
    source: sanitizeText(kioskContext?.source || extra?.source || 'web-kiosk', 40),
    officeId: sanitizeText(extra?.officeId, 64),
    officeName: sanitizeText(extra?.officeName, 160),
    lastDecisionCode: sanitizeText(extra?.decisionCode, 80),
    lastUserAgent: sanitizeText(kioskContext?.userAgent || extra?.userAgent, 512),
    lastSeenAt: new Date().toISOString(),
  }
}
