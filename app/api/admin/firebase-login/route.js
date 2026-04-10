import { NextResponse } from 'next/server'
import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
} from '../../../../lib/admin-auth'
import { getAdminAuth, getAdminDb } from '../../../../lib/firebase-admin'
import { writeAuditLog } from '../../../../lib/audit-log'
import { getAdminCount, getAdminProfileByEmail } from '../../../../lib/admin-directory'
import { FieldValue } from 'firebase-admin/firestore'
import { enforceRateLimit, getRequestIp } from '../../../../lib/rate-limit'

function getAllowedEmails() {
  return String(process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const idToken = String(body?.idToken || '').trim()

  if (!idToken) {
    return NextResponse.json({ ok: false, message: 'Firebase ID token is required.' }, { status: 400 })
  }

  try {
    const adminAuth = getAdminAuth()
    const decoded = await adminAuth.verifyIdToken(idToken, true)
    const email = String(decoded.email || '').trim().toLowerCase()
    const db = getAdminDb()
    const allowedEmails = getAllowedEmails()
    const ip = getRequestIp(request)

    const ipLimit = await enforceRateLimit(db, {
      key: `admin-login-ip:${ip}`,
      limit: 12,
      windowMs: 10 * 60 * 1000,
    })

    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many admin login attempts from this network. Try again later.' },
        { status: 429 },
      )
    }

    if (!email || !decoded.email_verified) {
      return NextResponse.json({ ok: false, message: 'A verified Google account is required.' }, { status: 403 })
    }

    const emailLimit = await enforceRateLimit(db, {
      key: `admin-login-email:${email}`,
      limit: 8,
      windowMs: 10 * 60 * 1000,
    })

    if (!emailLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many admin login attempts for this account. Try again later.' },
        { status: 429 },
      )
    }

    const adminProfile = await getAdminProfileByEmail(db, email)
    if (adminProfile) {
      return createScopedResponse(db, decoded, email, adminProfile)
    }

    const existingAdminCount = await getAdminCount(db)
    if (existingAdminCount === 0) {
      if (allowedEmails.length === 0) {
        return NextResponse.json(
          { ok: false, message: 'ADMIN_ALLOWED_EMAILS is required only to bootstrap the first regional admin.' },
          { status: 503 },
        )
      }

      if (!allowedEmails.includes(email)) {
        return NextResponse.json(
          { ok: false, message: 'This Google account is not allowed to bootstrap the first regional admin.' },
          { status: 403 },
        )
      }

      const record = await db.collection('admins').add({
        email,
        displayName: decoded.name || email,
        scope: 'regional',
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      return createScopedResponse(db, decoded, email, {
        id: record.id,
        role: 'admin',
        scope: 'regional',
        officeId: '',
      })
    }

    return NextResponse.json(
      { ok: false, message: 'This Google account does not have an admin record.' },
      { status: 403 },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to verify Firebase login.' },
      { status: 401 },
    )
  }
}

async function createScopedResponse(db, decoded, email, adminProfile) {
  try {
    await writeAuditLog(db, {
      actorRole: 'admin',
      actorScope: adminProfile.scope,
      actorOfficeId: adminProfile.officeId,
      action: 'admin_login_google',
      targetType: 'session',
      targetId: decoded.uid,
      officeId: adminProfile.officeId,
      summary: `Google admin login for ${email}`,
      metadata: {
        uid: decoded.uid,
        email,
        scope: adminProfile.scope,
        adminRecordId: adminProfile.id || '',
      },
    })
  } catch {}

  const response = NextResponse.json({ ok: true })
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

