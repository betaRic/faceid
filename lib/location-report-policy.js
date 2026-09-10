const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const outcomes = ['ready', 'imprecise', 'timeout', 'permission_denied', 'unavailable', 'unsupported', 'cancelled']
const browsers = ['Edge', 'Chrome', 'Chrome iOS', 'Safari', 'Firefox', 'Opera', 'Samsung Internet', 'Facebook/Messenger', 'Unknown']
const pick = (value, allowed, fallback = 'unknown') => allowed.includes(value) ? value : fallback
const limits = { firstAccuracy: 1e7, bestAccuracy: 1e7, firstReadingMs: 300000, acceptedMs: 300000,
  readingAgeMs: 300000, readingCount: 10000, maxAccuracy: 1e7, targetAccuracy: 1e7,
  maximumAge: 60000, timeout: 60000, attempt: 10000, rtt: 60000, downlink: 100000 }

export function sanitizeLocationReport(value) {
  if (!value || !UUID.test(value.id || '') || !UUID.test(value.sessionId || '')
    || value.stage !== 'location' || !outcomes.includes(value.reason)) return null
  const metrics = {}
  for (const [key, max] of Object.entries(limits)) {
    const number = value.metrics?.[key]
    if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= max) metrics[key] = Math.round(number * 100) / 100
  }
  return {
    id: value.id.toLowerCase(), sessionId: value.sessionId.toLowerCase(), stage: 'location', reason: value.reason,
    elapsedMs: typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) ? Math.round(Math.max(0, Math.min(300000, value.elapsedMs))) : null,
    device: pick(value.device, ['desktop', 'mobile', 'tablet']), browser: pick(value.browser, browsers, 'Unknown'),
    browserVersion: /^\d{1,4}$/.test(value.browserVersion || '') ? value.browserVersion : 'unknown',
    os: pick(value.os, ['Windows', 'macOS', 'iOS', 'Android', 'ChromeOS', 'Linux']),
    connection: pick(value.connection, ['ethernet', 'wifi', 'cellular', 'bluetooth', 'none', 'other']),
    networkQuality: pick(value.networkQuality, ['slow-2g', '2g', '3g', '4g']),
    saveData: typeof value.saveData === 'boolean' ? value.saveData : null,
    permission: pick(value.permission, ['granted', 'denied', 'prompt']),
    readingPredatesRequest: typeof value.readingPredatesRequest === 'boolean' ? value.readingPredatesRequest : null,
    buildId: /^[A-Za-z0-9_-]{1,80}$/.test(value.buildId || '') ? value.buildId : 'unknown', metrics,
  }
}

export function getLocationDeviceProfile(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent || '')
  const ipad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && Number(nav?.maxTouchPoints) > 1)
  const android = /Android/i.test(ua), ios = ipad || /iPhone|iPod/i.test(ua)
  const os = ios ? 'iOS' : android ? 'Android' : /Windows NT/i.test(ua) ? 'Windows'
    : /CrOS/i.test(ua) ? 'ChromeOS' : /Macintosh|Mac OS X/i.test(ua) ? 'macOS' : /Linux|X11/i.test(ua) ? 'Linux' : 'unknown'
  const device = ipad || (android && !/Mobile/i.test(ua)) ? 'tablet' : ios || android || /Mobile/i.test(ua) ? 'mobile' : os !== 'unknown' ? 'desktop' : 'unknown'
  const rules = [['Edge', /(?:Edg|EdgA|EdgiOS)\/(\d+)/], ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Opera', /(?:OPR|OPiOS)\/(\d+)/], ['Chrome iOS', /CriOS\/(\d+)/], ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]]
  let browser = 'Unknown', browserVersion = 'unknown'
  if (/FBAN|FBAV|Messenger/i.test(ua)) browser = 'Facebook/Messenger'
  else for (const [name, pattern] of rules) { const match = ua.match(pattern); if (match) { browser = name; browserVersion = match[1]; break } }
  let connection
  try { connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection } catch {}
  return { device, os, browser, browserVersion,
    connection: pick(connection?.type, ['ethernet', 'wifi', 'cellular', 'bluetooth', 'none', 'other']),
    networkQuality: pick(connection?.effectiveType, ['slow-2g', '2g', '3g', '4g']),
    saveData: typeof connection?.saveData === 'boolean' ? connection.saveData : null,
    metrics: { rtt: connection?.rtt, downlink: connection?.downlink },
  }
}
