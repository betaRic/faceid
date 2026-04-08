import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'

function isPlausibleIpv4(value) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false

  return value
    .split('.')
    .every(part => Number(part) >= 0 && Number(part) <= 255)
}

function isPlausibleIpv6(value) {
  if (!value.includes(':')) return false
  return /^[a-f0-9:]+$/i.test(value)
}

function parseIpCandidate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const bracketedIpv6Match = raw.match(/^\[([a-f0-9:]+)\](?::\d+)?$/i)
  if (bracketedIpv6Match && isPlausibleIpv6(bracketedIpv6Match[1])) {
    return bracketedIpv6Match[1].toLowerCase()
  }

  const direct = raw.replace(/^for=/i, '').replace(/^"|"$/g, '')
  if (isPlausibleIpv4(direct) || isPlausibleIpv6(direct)) {
    return direct.toLowerCase()
  }

  const ipv4WithPortMatch = direct.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4WithPortMatch && isPlausibleIpv4(ipv4WithPortMatch[1])) {
    return ipv4WithPortMatch[1]
  }

  return ''
}

function normalizeToken(value) {
  const token = String(value || '')
    .trim()
    .toLowerCase()

  const tokenSegments = token.split(':')
  const directIp = parseIpCandidate(token)
  const trailingIp = tokenSegments.length > 1
    ? parseIpCandidate(tokenSegments.slice(1).join(':'))
    : ''
  const normalizedIp = directIp || trailingIp
  const safeToken = normalizedIp
    ? (
        directIp
          ? (normalizedIp.includes(':') ? `ipv6_${normalizedIp.replaceAll(':', '_')}` : normalizedIp)
          : `${tokenSegments[0]}:${normalizedIp.includes(':') ? `ipv6_${normalizedIp.replaceAll(':', '_')}` : normalizedIp}`
      )
    : token

  return safeToken
    .replace(/[^a-z0-9:_.-]/g, '-')
    .slice(0, 180)
}

export function getRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || ''
  const realIp = request.headers.get('x-real-ip') || ''

  const forwardedCandidate = forwarded
    .split(',')
    .map(part => parseIpCandidate(part))
    .find(Boolean)

  return forwardedCandidate || parseIpCandidate(realIp) || 'unknown'
}

export async function enforceRateLimit(db, { key, limit, windowMs }) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) {
    return { ok: true, remaining: limit }
  }

  const ref = db.collection('rate_limits').doc(normalizedKey)
  const now = Date.now()
  const snapshot = await ref.get()
  const data = snapshot.exists ? snapshot.data() : null
  const resetAt = Number(data?.resetAt ?? 0)
  const count = Number(data?.count ?? 0)

  if (!data || resetAt <= now) {
    const nextResetAt = now + windowMs
    await ref.set({
      count: 1,
      resetAt: nextResetAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return { ok: true, remaining: Math.max(0, limit - 1), resetAt: nextResetAt }
  }

  if (count >= limit) {
    return { ok: false, remaining: 0, resetAt }
  }

  const nextCount = count + 1
  await ref.set({
    count: nextCount,
    resetAt,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  return { ok: true, remaining: Math.max(0, limit - nextCount), resetAt }
}
