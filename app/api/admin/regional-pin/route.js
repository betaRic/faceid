export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { createOriginGuard } from '@/lib/csrf'
import { isRegionalPinEnabled, setRegionalPinEnabled } from '@/lib/bootstrap-pin'
import { writeAuditLog } from '@/lib/audit-log'

async function resolveRegionalAdmin(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) return null
  const resolved = await resolveAdminSession(null, session)
  return resolved && isRegionalAdminSession(resolved) ? resolved : null
}

export async function GET(request) {
  const session = await resolveRegionalAdmin(request)
  if (!session) return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  return NextResponse.json({ ok: true, configured: Boolean(process.env.ADMIN_REGIONAL_PIN?.trim()), enabled: await isRegionalPinEnabled() })
}

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError
  const session = await resolveRegionalAdmin(request)
  if (!session) return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (typeof body?.enabled !== 'boolean') return NextResponse.json({ ok: false, message: 'enabled must be true or false.' }, { status: 400 })
  await setRegionalPinEnabled(body.enabled)
  await writeAuditLog(null, {
    actorRole: 'admin', actorScope: session.scope, actorOfficeId: session.officeId,
    action: 'regional_pin_access_update', targetType: 'system_config', targetId: 'regional_pin_access', officeId: '',
    summary: `Regional bootstrap PIN ${body.enabled ? 'enabled' : 'disabled'}`,
  })
  return NextResponse.json({ ok: true, enabled: body.enabled })
}
