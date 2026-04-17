import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getRuntimeReadiness } from '@/lib/runtime-readiness'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Regional admin login is required.' }, { status: 401 })
  }

  const db = getAdminDb()
  const resolvedSession = await resolveAdminSession(db, session)
  if (!resolvedSession?.active || resolvedSession.scope !== 'regional') {
    return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  }

  const readiness = getRuntimeReadiness()

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: 'vercel-node-compatible',
    ...readiness,
    recommendation: !readiness.productionReady
      ? 'Set the missing environment variables before deployment.'
      : readiness.scaleReady
        ? 'Runtime configuration is present. Continue with controlled pilot testing before production use.'
        : 'Baseline runtime configuration is present, but scale-critical services are still missing. Configure Redis before broad rollout.',
  })
}

