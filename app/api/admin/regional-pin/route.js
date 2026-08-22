export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, isRegionalAdminSession, isRegionalPinConfigured, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { createOriginGuard } from '@/lib/csrf'
import { isRegionalPinEnabled, setRegionalPinEnabled } from '@/lib/bootstrap-pin'
import { writeAuditLog } from '@/lib/audit-log'
import { withPostgresTransaction } from '@/lib/postgres/client'

async function resolveRegionalAdmin(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) return null
  const resolved = await resolveAdminSession(null, session)
  return resolved && isRegionalAdminSession(resolved) ? resolved : null
}

export async function GET(request) {
  const session = await resolveRegionalAdmin(request)
  if (!session) return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  return NextResponse.json({ ok: true, configured: isRegionalPinConfigured(), enabled: await isRegionalPinEnabled() })
}

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError
  const session = await resolveRegionalAdmin(request)
  if (!session) return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (typeof body?.enabled !== 'boolean') return NextResponse.json({ ok: false, message: 'enabled must be true or false.' }, { status: 400 })
  if (body.enabled && !isRegionalPinConfigured()) {
    return NextResponse.json({ ok: false, message: 'Regional PIN is not configured.' }, { status: 400 })
  }

  try {
    await withPostgresTransaction(async client => {
      await setRegionalPinEnabled(body.enabled, { client })
      await writeAuditLog(null, {
        actorRole: 'admin', actorScope: session.scope, actorOfficeId: session.officeId,
        action: 'regional_pin_access_update', targetType: 'system_config', targetId: 'regional_pin_access', officeId: '',
        summary: `Regional PIN ${body.enabled ? 'enabled' : 'disabled'}`,
      }, { client })
    })
    return NextResponse.json({ ok: true, enabled: body.enabled })
  } catch (error) {
    console.error('[regional-pin] Update failed', { code: error?.code || 'unknown' })
    return NextResponse.json(
      { ok: false, message: 'Failed to update Regional PIN access.' },
      { status: 500 },
    )
  }
}
