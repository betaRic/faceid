import 'server-only'

export function validateOrigin(request) {
  const origin = request.headers.get('origin')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const railwayHost = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
  const isDevelopment = process.env.NODE_ENV === 'development'

  if (!siteUrl && !railwayHost) {
    if (isDevelopment) {
      if (!origin) {
        const referer = request.headers.get('referer')
        if (!referer) return true
        try {
          const refererUrl = new URL(referer)
          return ['localhost', '127.0.0.1', 'localhost:3000', '127.0.0.1:3000'].includes(refererUrl.host)
        } catch {
          return false
        }
      }

      try {
        const originUrl = new URL(origin)
        return ['localhost', '127.0.0.1', 'localhost:3000', '127.0.0.1:3000'].includes(originUrl.host)
      } catch {
        return false
      }
    }

    console.error('NEXT_PUBLIC_SITE_URL not configured - rejecting request for safety')
    return false
  }

  try {
    const allowedHosts = []

    if (siteUrl) {
      allowedHosts.push(new URL(siteUrl).host)
    }

    if (railwayHost) {
      allowedHosts.push(railwayHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''))
    }

    if (isDevelopment) {
      allowedHosts.push('localhost', '127.0.0.1', 'localhost:3000', '127.0.0.1:3000')
    }

    if (process.env.VERCEL_URL) {
      allowedHosts.push(process.env.VERCEL_URL)
    }

    if (!origin) {
      const referer = request.headers.get('referer')
      if (referer) {
        const refererUrl = new URL(referer)
        return allowedHosts.includes(refererUrl.host)
      }
      return isDevelopment
    }

    const originUrl = new URL(origin)
    return allowedHosts.includes(originUrl.host)
  } catch {
    return false
  }
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
