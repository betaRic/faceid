export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminAuth } from '@/lib/firebase-admin'
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
  verifyPin,
} from '@/lib/hr-auth'
import { getAdminProfileByEmail, getAdminCount } from '@/lib/admin-directory'
import { getHrProfileByEmail, getHrCount } from '@/lib/hr-directory'
import { writeAuditLog } from '@/lib/audit-log'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { createOriginGuard } from '@/lib/csrf'
import { FieldValue } from 'firebase-admin/firestore'

function safeEqual(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(left)
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  if (typeof crypto.timingSafeEqual === 'function') {
    return crypto.timingSafeEqual(leftBuffer, rightBuffer)
  }
  return leftBuffer.equals(rightBuffer)
}

function getAllowedEmails(envVar) {
  return String(process.env[envVar] || '')
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
    key: `login-ip:${ip}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  })

  if (!ipLimit.ok) {
    return NextResponse.json(
      { ok: false, message: 'Too many login attempts from this network. Try again later.' },
      { status: 429 },
    )
  }

  const body = await request.json().catch(() => null)
  const loginType = String(body?.loginType || 'pin').trim()
  const pin = String(body?.pin || '').trim()
  const idToken = String(body?.idToken || '').trim()

  try {
    if (loginType === 'google') {
      const adminAuth = getAdminAuth()
      const decoded = await adminAuth.verifyIdToken(idToken, true)
      const email = String(decoded.email || '').trim().toLowerCase()

      if (!email || !decoded.email_verified) {
        return NextResponse.json({ ok: false, message: 'A verified Google account is required.' }, { status: 403 })
      }

      const adminProfile = await getAdminProfileByEmail(db, email)
      if (adminProfile?.active) {
        await writeAuditLog(db, {
          actorRole: 'admin',
          actorScope: adminProfile.scope,
          actorOfficeId: adminProfile.officeId,
          action: 'admin_login_google',
          targetType: 'session',
          targetId: decoded.uid,
          officeId: adminProfile.officeId,
          summary: `Admin Google login for ${email}`,
          metadata: { uid: decoded.uid, email, scope: adminProfile.scope },
        })

        const response = NextResponse.json({ ok: true, role: 'admin', scope: adminProfile.scope })
        response.cookies.set({
          name: getAdminSessionCookieName(),
          value: createAdminSessionCookieValue({
            scope: adminProfile.scope,
            officeId: adminProfile.officeId,
            email,
            uid: decoded.uid,
          }),
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: getAdminSessionMaxAge(),
        })
        return response
      }

      const hrProfile = await getHrProfileByEmail(db, email)
      if (hrProfile?.active) {
        await writeAuditLog(db, {
          actorRole: 'hr',
          actorScope: hrProfile.scope,
          actorOfficeId: hrProfile.officeId,
          action: 'hr_login_google',
          targetType: 'session',
          targetId: hrProfile.id,
          officeId: hrProfile.officeId,
          summary: `HR Google login for ${email}`,
          metadata: { email, scope: hrProfile.scope },
        })

        const response = NextResponse.json({ ok: true, role: 'hr', scope: hrProfile.scope })
        response.cookies.set({
          name: getHrSessionCookieName(),
          value: createHrSessionCookieValue({
            scope: hrProfile.scope,
            officeId: hrProfile.officeId,
            email,
            hrUserId: hrProfile.id,
          }),
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: getHrSessionMaxAge(),
        })
        return response
      }

      const existingAdminCount = await getAdminCount(db)
      if (existingAdminCount === 0 && getAllowedEmails('ADMIN_ALLOWED_EMAILS').includes(email)) {
        const record = await db.collection('admins').add({
          email,
          displayName: decoded.name || email,
          scope: 'regional',
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        const response = NextResponse.json({ ok: true, role: 'admin', scope: 'regional' })
        response.cookies.set({
          name: getAdminSessionCookieName(),
          value: createAdminSessionCookieValue({
            scope: 'regional',
            officeId: '',
            email,
            uid: decoded.uid,
          }),
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: getAdminSessionMaxAge(),
        })
        return response
      }

      const existingHrCount = await getHrCount(db)
      if (existingHrCount === 0 && getAllowedEmails('HR_ALLOWED_EMAILS').includes(email)) {
        const record = await db.collection('hr_users').add({
          email,
          displayName: email,
          scope: 'office',
          active: true,
          pinHash: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        const response = NextResponse.json({ ok: true, role: 'hr', scope: 'office' })
        response.cookies.set({
          name: getHrSessionCookieName(),
          value: createHrSessionCookieValue({
            scope: 'office',
            officeId: '',
            email,
            hrUserId: record.id,
          }),
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: getHrSessionMaxAge(),
        })
        return response
      }

      return NextResponse.json(
        { ok: false, message: 'This account does not have access.' },
        { status: 403 },
      )
    }

    if (loginType === 'pin') {
      if (!pin) {
        return NextResponse.json({ ok: false, message: 'PIN is required.' }, { status: 400 })
      }

      const configuredPin = getRegionalPin()
      if (configuredPin && safeEqual(pin, configuredPin)) {
        await writeAuditLog(db, {
          actorRole: 'admin',
          actorScope: 'regional',
          actorOfficeId: '',
          action: 'admin_login_pin',
          targetType: 'session',
          targetId: 'regional-pin-admin',
          officeId: '',
          summary: 'Regional PIN login',
        })

        const response = NextResponse.json({ ok: true, role: 'admin', scope: 'regional' })
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
      }

      const hrSnapshots = await db.collection('hr_users').where('active', '==', true).get()
      for (const doc of hrSnapshots.docs) {
        const data = doc.data()
        if (data.pinHash && verifyPin(pin, data.pinHash)) {
          await writeAuditLog(db, {
            actorRole: 'hr',
            actorScope: data.scope || 'office',
            actorOfficeId: data.officeId || '',
            action: 'hr_login_pin',
            targetType: 'session',
            targetId: doc.id,
            officeId: data.officeId || '',
            summary: `HR PIN login for ${data.email}`,
          })

          const response = NextResponse.json({ ok: true, role: 'hr', scope: data.scope || 'office' })
          response.cookies.set({
            name: getHrSessionCookieName(),
            value: createHrSessionCookieValue({
              scope: data.scope || 'office',
              officeId: data.officeId || '',
              email: data.email,
              hrUserId: doc.id,
            }),
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: getHrSessionMaxAge(),
          })
          return response
        }
      }

      return NextResponse.json({ ok: false, message: 'Invalid PIN.' }, { status: 401 })
    }

    return NextResponse.json({ ok: false, message: 'Invalid login type.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Login failed.' },
      { status: 500 },
    )
  }
}