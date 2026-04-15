export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  createHrSessionCookieValue,
  getHrSessionCookieName,
  getHrSessionMaxAge,
  hashPin,
  verifyPin,
} from '@/lib/hr-auth'
import { getHrProfileByEmail, getHrCount } from '@/lib/hr-directory'
import { writeAuditLog } from '@/lib/audit-log'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { createOriginGuard } from '@/lib/csrf'

function getAllowedEmails() {
  return String(process.env.HR_ALLOWED_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const db = getAdminDb()
  const ip = getRequestIp(request)

  const ipLimit = await enforceRateLimit(db, {
    key: `hr-login-ip:${ip}`,
    limit: 12,
    windowMs: 10 * 60 * 1000,
  })

  if (!ipLimit.ok) {
    return NextResponse.json(
      { ok: false, message: 'Too many HR login attempts from this network. Try again later.' },
      { status: 429 },
    )
  }

  const body = await request.json().catch(() => null)
  const email = String(body?.email || '').trim().toLowerCase()
  const pin = String(body?.pin || '').trim()

  if (!email && !pin) {
    return NextResponse.json({ ok: false, message: 'Email or PIN is required.' }, { status: 400 })
  }

  try {
    let hrProfile = null

    if (pin) {
      const snapshots = await db
        .collection('hr_users')
        .where('active', '==', true)
        .get()

      for (const doc of snapshots.docs) {
        const data = doc.data()
        if (data.active !== true) continue
        if (data.pinHash && verifyPin(pin, data.pinHash)) {
          hrProfile = {
            id: doc.id,
            email: data.email || '',
            displayName: data.displayName || '',
            scope: data.scope || 'office',
            officeId: data.officeId || '',
          }
          break
        }
      }

      if (!hrProfile) {
        return NextResponse.json({ ok: false, message: 'Invalid PIN.' }, { status: 401 })
      }
    } else if (email) {
      const emailLimit = await enforceRateLimit(db, {
        key: `hr-login-email:${email}`,
        limit: 8,
        windowMs: 10 * 60 * 1000,
      })

      if (!emailLimit.ok) {
        return NextResponse.json(
          { ok: false, message: 'Too many HR login attempts for this account. Try again later.' },
          { status: 429 },
        )
      }

      hrProfile = await getHrProfileByEmail(db, email)

      if (!hrProfile) {
        const existingHrCount = await getHrCount(db)
        if (existingHrCount === 0 && getAllowedEmails().includes(email)) {
          const record = await db.collection('hr_users').add({
            email,
            displayName: email,
            scope: 'office',
            active: true,
            pinHash: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })

          hrProfile = {
            id: record.id,
            email,
            displayName: email,
            scope: 'office',
            officeId: '',
          }
        } else {
          return NextResponse.json(
            { ok: false, message: 'This account does not have an HR user record.' },
            { status: 403 },
          )
        }
      }

      if (!hrProfile.active) {
        return NextResponse.json({ ok: false, message: 'HR account is disabled.' }, { status: 403 })
      }

      if (!hrProfile.pinHash) {
        return NextResponse.json(
          { ok: false, message: 'HR user does not have a PIN configured. Please contact administrator.' },
          { status: 403 },
        )
      }

      const pinInput = String(body?.pin || '').trim()
      if (!pinInput || !verifyPin(pinInput, hrProfile.pinHash)) {
        const hrEmail = hrProfile.email
        await writeAuditLog(db, {
          actorRole: 'hr',
          actorScope: hrProfile.scope,
          actorOfficeId: hrProfile.officeId,
          action: 'hr_login_pin_failed',
          targetType: 'session',
          targetId: hrProfile.id,
          officeId: hrProfile.officeId,
          summary: `Failed PIN login attempt for ${hrEmail}`,
          metadata: { hrEmail },
        })

        return NextResponse.json({ ok: false, message: 'Invalid PIN.' }, { status: 401 })
      }
    }

    await writeAuditLog(db, {
      actorRole: 'hr',
      actorScope: hrProfile.scope,
      actorOfficeId: hrProfile.officeId,
      action: 'hr_login',
      targetType: 'session',
      targetId: hrProfile.id,
      officeId: hrProfile.officeId,
      summary: `HR login for ${hrProfile.email}`,
      metadata: { hrEmail: hrProfile.email, scope: hrProfile.scope },
    })

    const response = NextResponse.json({ ok: true })
    response.cookies.set({
      name: getHrSessionCookieName(),
      value: createHrSessionCookieValue({
        scope: hrProfile.scope,
        officeId: hrProfile.officeId,
        email: hrProfile.email,
        hrUserId: hrProfile.id,
      }),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: getHrSessionMaxAge(),
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to authenticate HR user.' },
      { status: 500 },
    )
  }
}