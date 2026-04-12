import 'server-only'

export function validateOrigin(request) {
  const origin = request.headers.get('origin')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!siteUrl) {
    console.error('NEXT_PUBLIC_SITE_URL not configured - rejecting request for safety')
    return false
  }

  try {
    const siteUrlObj = new URL(siteUrl)
    const allowedHosts = [siteUrlObj.host]

    if (process.env.NODE_ENV === 'development') {
      allowedHosts.push('localhost', '127.0.0.1', 'localhost:3000')
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
      return process.env.NODE_ENV === 'development'
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
