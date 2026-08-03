import 'server-only'

export function validateOrigin(request) {
  const origin = request.headers.get('origin')
  const siteUrls = String(process.env.NEXT_PUBLIC_SITE_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const isDevelopment = process.env.NODE_ENV === 'development'
  const localHosts = ['localhost', '127.0.0.1', 'localhost:3000', '127.0.0.1:3000']

  if (siteUrls.length === 0) {
    if (isDevelopment) {
      if (!origin) {
        const referer = request.headers.get('referer')
        if (!referer) return true
        try {
          const refererUrl = new URL(referer)
          return localHosts.includes(refererUrl.host)
        } catch {
          return false
        }
      }

      try {
        const originUrl = new URL(origin)
        return localHosts.includes(originUrl.host)
      } catch {
        return false
      }
    }

    console.error('NEXT_PUBLIC_SITE_URL not configured - rejecting request for safety')
    return false
  }

  try {
    const allowedHosts = siteUrls.map(siteUrl => new URL(siteUrl).host.toLowerCase())

    if (isDevelopment) {
      allowedHosts.push(...localHosts.map(host => host.toLowerCase()))
    }

    if (!origin) {
      const referer = request.headers.get('referer')
      if (referer) {
        const refererUrl = new URL(referer)
        return allowedHosts.includes(refererUrl.host.toLowerCase()) || matchesPublicRequestHost(refererUrl, request)
      }
      return isDevelopment
    }

    const originUrl = new URL(origin)
    return allowedHosts.includes(originUrl.host.toLowerCase()) || matchesPublicRequestHost(originUrl, request)
  } catch {
    return false
  }
}

function matchesPublicRequestHost(url, request) {
  const forwardedHost = String(request.headers.get('x-forwarded-host') || '').split(',')[0].trim()
  const requestHost = forwardedHost || String(request.headers.get('host') || '').trim()
  if (!requestHost || url.host.toLowerCase() !== requestHost.toLowerCase()) return false

  const forwardedProto = String(request.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase()
  const requestProto = forwardedProto || new URL(request.url).protocol.replace(':', '').toLowerCase()
  return requestProto === url.protocol.replace(':', '').toLowerCase()
}

export function createOriginGuard() {
  return async function checkOrigin(request) {
    if (!validateOrigin(request)) {
      return new Response(JSON.stringify({
        error: 'Invalid origin',
        message: 'Request rejected due to invalid origin header.',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return null
  }
}
