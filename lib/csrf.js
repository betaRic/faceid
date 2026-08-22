import 'server-only'

export function validateOrigin(request) {
  const origin = request.headers.get('origin')
  const siteOrigins = String(process.env.NEXT_PUBLIC_SITE_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      try {
        return new URL(value).origin.toLowerCase()
      } catch {
        return ''
      }
    })
    .filter(Boolean)
  const isDevelopment = process.env.NODE_ENV === 'development'
  const localOrigins = [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]

  if (siteOrigins.length === 0) {
    if (isDevelopment) {
      if (!origin) {
        const referer = request.headers.get('referer')
        if (!referer) return true
        try {
          const refererUrl = new URL(referer)
          return localOrigins.includes(refererUrl.origin.toLowerCase())
        } catch {
          return false
        }
      }

      try {
        const originUrl = new URL(origin)
        return localOrigins.includes(originUrl.origin.toLowerCase())
      } catch {
        return false
      }
    }

    console.error('NEXT_PUBLIC_SITE_URL not configured - rejecting request for safety')
    return false
  }

  try {
    const allowedOrigins = [...siteOrigins]

    if (isDevelopment) {
      allowedOrigins.push(...localOrigins)
    }

    if (!origin) {
      const referer = request.headers.get('referer')
      if (referer) {
        const refererUrl = new URL(referer)
        return allowedOrigins.includes(refererUrl.origin.toLowerCase())
      }
      return isDevelopment
    }

    const originUrl = new URL(origin)
    return allowedOrigins.includes(originUrl.origin.toLowerCase())
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
