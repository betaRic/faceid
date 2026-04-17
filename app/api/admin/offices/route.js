export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { clearOfficeRecordCache } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeOfficePayload(payload) {
  return {
    id: String(payload?.id || '').trim(),
    code: String(payload?.code || '').trim(),
    name: String(payload?.name || '').trim(),
    shortName: String(payload?.shortName || '').trim(),
    officeType: String(payload?.officeType || '').trim(),
    location: String(payload?.location || '').trim(),
    provinceOrCity: String(payload?.provinceOrCity || '').trim(),
    wifiSsid: Array.isArray(payload?.wifiSsid)
      ? payload.wifiSsid.map(value => String(value || '').trim()).filter(Boolean)
      : String(payload?.wifiSsid || '').trim()
        ? [String(payload?.wifiSsid || '').trim()]
        : [],
    status: String(payload?.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active',
    employees: Number(payload?.employees ?? 0),
    gps: {
      latitude: Number(payload?.gps?.latitude),
      longitude: Number(payload?.gps?.longitude),
      radiusMeters: Number(payload?.gps?.radiusMeters),
    },
    workPolicy: {
      schedule: String(payload?.workPolicy?.schedule || '').trim(),
      workingDays: Array.isArray(payload?.workPolicy?.workingDays)
        ? payload.workPolicy.workingDays.map(Number).filter(Number.isFinite)
        : [],
      wfhDays: Array.isArray(payload?.workPolicy?.wfhDays)
        ? payload.workPolicy.wfhDays.map(Number).filter(Number.isFinite)
        : [],
      morningIn: String(payload?.workPolicy?.morningIn || '08:00'),
      morningOut: String(payload?.workPolicy?.morningOut || '12:00'),
      afternoonIn: String(payload?.workPolicy?.afternoonIn || '13:00'),
      afternoonOut: String(payload?.workPolicy?.afternoonOut || '17:00'),
      gracePeriodMinutes: Number(payload?.workPolicy?.gracePeriodMinutes ?? 0),
      checkInCooldownMinutes: Number(payload?.workPolicy?.checkInCooldownMinutes ?? 30),
      checkOutCooldownMinutes: Number(payload?.workPolicy?.checkOutCooldownMinutes ?? 5),
    },
  }
}

function validateOffice(office) {
  if (!office.name || !office.officeType || !office.location) {
    return 'Office name, type, and location are required.'
  }
  if (
    !Number.isFinite(office.gps.latitude) ||
    !Number.isFinite(office.gps.longitude) ||
    !Number.isFinite(office.gps.radiusMeters)
  ) {
    return 'Valid office GPS coordinates and radius are required.'
  }
  if (office.gps.radiusMeters <= 0) {
    return 'Office radius must be greater than zero.'
  }
  if (!office.workPolicy.schedule) {
    return 'Schedule label is required.'
  }
  return null
}

function buildOfficeId(office) {
  return slugify(office.id || office.code || office.shortName || office.name)
}

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const office = normalizeOfficePayload(body?.office)
  office.id = buildOfficeId(office)

  if (!office.id) {
    return NextResponse.json({ ok: false, message: 'Office code, short name, or name is required to generate an office ID.' }, { status: 400 })
  }

  const validationError = validateOffice(office)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const existing = await db.collection('offices').doc(office.id).get()
    if (existing.exists) {
      return NextResponse.json({ ok: false, message: 'An office with the same generated ID already exists. Change the code, short name, or name.' }, { status: 409 })
    }

    await db.collection('offices').doc(office.id).set({
      ...office,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await clearOfficeRecordCache()

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'office_create',
      targetType: 'office',
      targetId: office.id,
      officeId: office.id,
      summary: `Created office ${office.name}`,
      metadata: {
        code: office.code,
        officeType: office.officeType,
        location: office.location,
      },
    })

    return NextResponse.json({ ok: true, office }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to create office.' },
      { status: 500 },
    )
  }
}
