import 'server-only'

export function validateOrigin(request) {
  const origin = request.headers.get('origin')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!siteUrl) {
    console.warn('NEXT_PUBLIC_SITE_URL not configured - skipping origin validation')
    return true
  }

  if (!origin) {
    return false
  }

  try {
    const originUrl = new URL(origin)
    const expectedUrl = new URL(siteUrl)
    const allowedHosts = [expectedUrl.host]

    if (process.env.NODE_ENV === 'development') {
      allowedHosts.push('localhost', '127.0.0.1')
    }

    if (process.env.VERCEL_GIT_COMMIT_REF) {
      allowedHosts.push(`${process.env.VERCEL_GIT_COMMIT_REF}--${expectedUrl.host}`)
    }

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
