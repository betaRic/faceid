export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
  getRegionalPin,
} from '@/lib/admin-auth'
import {
  createHrSessionCookieValue,
  getHrSessionCookieName,
  getHrSessionMaxAge,
} from '@/lib/hr-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { findLocalStaffByPin } from '@/lib/postgres/user-store'
import { isRegionalPinEnabled } from '@/lib/bootstrap-pin'
import { staffSessionCookieOptions } from '@/lib/staff-session-cookie'
import { enforceLoginRateLimits, verifySharedRegionalPin } from '@/lib/login-security'

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const body = await request.json().catch(() => null)
  const loginType = String(body?.loginType || 'pin').trim()
  const pin = String(body?.pin || '').trim()

  try {
    if (loginType === 'google') {
      return NextResponse.json(
        { ok: false, message: 'Google login is disabled. Use local PIN login.' },
        { status: 400 },
      )
    }

    if (loginType === 'pin') {
      if (!pin) {
        return NextResponse.json({ ok: false, message: 'PIN is required.' }, { status: 400 })
      }

      const loginLimit = await enforceLoginRateLimits(request, pin)
      if (!loginLimit.ok) {
        if (loginLimit.shouldAuditLockout) {
          await writeAuditLog(null, {
            actorRole: 'unknown',
            actorScope: 'unknown',
            actorOfficeId: '',
            action: 'staff_login_rate_limited',
            targetType: 'session',
            targetId: 'pin',
            officeId: '',
            summary: 'Staff PIN login rate limited',
            metadata: { backend: loginLimit.backend || 'unknown' },
          })
        }
        return NextResponse.json(
          { ok: false, message: 'Too many login attempts. Try again later.' },
          { status: 429 },
        )
      }

      const configuredPin = getRegionalPin()
      const regionalPinAvailable = configuredPin && await isRegionalPinEnabled()
      const sharedRegionalMatch = Boolean(
        regionalPinAvailable && verifySharedRegionalPin(pin, configuredPin),
      )
      const staffMatches = await findLocalStaffByPin(pin)
      const matchCount = Number(sharedRegionalMatch)
        + staffMatches.admins.length
        + staffMatches.hrUsers.length

      if (matchCount > 1) {
        await writeAuditLog(null, {
          actorRole: 'unknown',
          actorScope: 'unknown',
          actorOfficeId: '',
          action: 'staff_login_pin_collision',
          targetType: 'session',
          targetId: 'pin',
          officeId: '',
          summary: 'Ambiguous staff PIN login blocked',
          metadata: {
            sharedRegionalMatch,
            adminMatches: staffMatches.admins.length,
            hrMatches: staffMatches.hrUsers.length,
          },
        })
        return NextResponse.json({ ok: false, message: 'Invalid PIN.' }, { status: 401 })
      }

      if (sharedRegionalMatch) {
        await writeAuditLog(null, {
          actorRole: 'admin',
          actorScope: 'regional',
          actorOfficeId: '',
          action: 'admin_login_pin',
          targetType: 'session',
          targetId: 'regional-pin-admin',
          officeId: '',
          summary: 'Regional PIN login',
          metadata: { authMethod: 'shared_regional_pin' },
        })

        const response = NextResponse.json({ ok: true, role: 'admin', scope: 'regional' })
        response.cookies.set({
          name: getAdminSessionCookieName(),
          value: createAdminSessionCookieValue({
            scope: 'regional',
            officeId: '',
            email: 'regional-pin-admin@local',
            uid: 'regional-pin-admin',
            authMethod: 'shared_regional_pin',
          }),
          ...staffSessionCookieOptions({ maxAge: getAdminSessionMaxAge() }),
        })
        return response
      }

      const adminProfile = staffMatches.admins[0]
      if (adminProfile?.active) {
          await writeAuditLog(null, {
            actorRole: 'admin',
            actorScope: adminProfile.scope,
            actorOfficeId: adminProfile.officeId,
            action: 'admin_login_pin',
            targetType: 'session',
            targetId: adminProfile.id,
            officeId: adminProfile.officeId,
            summary: `Admin PIN login for ${adminProfile.email}`,
            metadata: { authMethod: 'named_pin' },
          })

          const response = NextResponse.json({ ok: true, role: 'admin', scope: adminProfile.scope })
          response.cookies.set({
            name: getAdminSessionCookieName(),
            value: createAdminSessionCookieValue({
              scope: adminProfile.scope,
              officeId: adminProfile.officeId,
              email: adminProfile.email,
              uid: adminProfile.id,
              authMethod: 'named_pin',
            }),
            ...staffSessionCookieOptions({ maxAge: getAdminSessionMaxAge() }),
          })
        return response
      }

      const hrProfile = staffMatches.hrUsers[0]
      if (hrProfile?.active) {
          await writeAuditLog(null, {
            actorRole: 'hr',
            actorScope: hrProfile.scope,
            actorOfficeId: hrProfile.officeId,
            action: 'hr_login_pin',
            targetType: 'session',
            targetId: hrProfile.id,
            officeId: hrProfile.officeId,
            summary: `HR PIN login for ${hrProfile.email}`,
            metadata: { authMethod: 'named_pin' },
          })

          const response = NextResponse.json({ ok: true, role: 'hr', scope: hrProfile.scope })
          response.cookies.set({
            name: getHrSessionCookieName(),
            value: createHrSessionCookieValue({
              scope: hrProfile.scope,
              officeId: hrProfile.officeId,
              email: hrProfile.email,
              hrUserId: hrProfile.id,
              authMethod: 'named_pin',
            }),
            ...staffSessionCookieOptions({ maxAge: getHrSessionMaxAge() }),
          })
        return response
      }

      await writeAuditLog(null, {
        actorRole: 'unknown',
        actorScope: 'unknown',
        actorOfficeId: '',
        action: 'staff_login_failed',
        targetType: 'session',
        targetId: 'pin',
        officeId: '',
        summary: 'Invalid staff PIN login',
        metadata: { authMethod: 'pin' },
      })
      return NextResponse.json({ ok: false, message: 'Invalid PIN.' }, { status: 401 })
    }

    return NextResponse.json({ ok: false, message: 'Invalid login type.' }, { status: 400 })
  } catch (error) {
    console.error('[login] Staff authentication failed', { code: error?.code || 'unknown' })
    return NextResponse.json(
      { ok: false, message: 'Login failed.' },
      { status: 500 },
    )
  }
}
