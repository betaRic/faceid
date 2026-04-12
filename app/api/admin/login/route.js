export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
  getRegionalPin,
} from '@/lib/admin-auth'
import { getAdminDb } from '@/lib/firebase-admin'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'

function safeEqual(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(left)
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  if (typeof crypto.timingSafeEqual === 'function') {
    return crypto.timingSafeEqual(leftBuffer, rightBuffer)
  }
  return leftBuffer.equals(rightBuffer)
}

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const body = await request.json().catch(() => null)
  const pin = String(body?.pin || '').trim()
  const configuredPin = getRegionalPin()

  if (!configuredPin) {
    return NextResponse.json(
      { ok: false, message: 'Regional PIN login is not configured in this deployment.' },
      { status: 503 },
    )
  }

  if (!pin) {
    return NextResponse.json({ ok: false, message: 'Regional PIN is required.' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const ip = getRequestIp(request)
    const ipLimit = await enforceRateLimit(db, {
      key: `admin-pin-login-ip:${ip}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    })

    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many PIN login attempts from this network. Try again later.' },
        { status: 429 },
      )
    }

    if (!safeEqual(pin, configuredPin)) {
      return NextResponse.json({ ok: false, message: 'Invalid regional PIN.' }, { status: 401 })
    }

    try {
      await writeAuditLog(db, {
        actorRole: 'admin',
        actorScope: 'regional',
        actorOfficeId: '',
        action: 'admin_login_pin',
        targetType: 'session',
        targetId: 'regional-pin-admin',
        officeId: '',
        summary: 'Regional PIN admin login',
        metadata: {
          scope: 'regional',
          loginMethod: 'pin',
        },
      })
    } catch (err) {
      console.error('Audit log failed:', err)
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: createAdminSessionCookieValue({
        scope: 'regional',
        officeId: '',
        email: 'regional-pin-admin@local',
        uid: 'regional-pin-admin',
      }),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: getAdminSessionMaxAge(),
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'PIN admin login failed.' },
      { status: 500 },
    )
  }
}

