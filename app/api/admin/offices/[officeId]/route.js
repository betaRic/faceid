import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../../../lib/firebase-admin'
import { adminSessionAllowsOffice, parseAdminSessionCookieValue, getAdminSessionCookieName, revalidateAdminSession } from '../../../../../lib/admin-auth'
import { writeAuditLog } from '../../../../../lib/audit-log'

function normalizeOfficePayload(officeId, payload) {
  return {
    id: officeId,
    name: String(payload?.name || '').trim(),
    officeType: String(payload?.officeType || '').trim(),
    location: String(payload?.location || '').trim(),
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
    },
  }
}

function validateOffice(office) {
  if (!office.id || !office.name || !office.officeType || !office.location) {
    return 'Office ID, name, type, and location are required.'
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

export async function PUT(request, { params }) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  if (!adminSessionAllowsOffice(session, params.officeId)) {
    return NextResponse.json({ ok: false, message: 'This admin session cannot edit that office.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const office = normalizeOfficePayload(params.officeId, body?.office)
  const validationError = validateOffice(office)

  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const stillActive = await revalidateAdminSession(db, session)
    if (!stillActive) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    await db.collection('offices').doc(office.id).set({
      ...office,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    await writeAuditLog(db, {
      actorRole: session.role,
      actorScope: session.scope,
      actorOfficeId: session.officeId,
      action: 'office_update',
      targetType: 'office',
      targetId: office.id,
      officeId: office.id,
      summary: `Updated office configuration for ${office.name}`,
      metadata: {
        officeType: office.officeType,
        location: office.location,
        radiusMeters: office.gps.radiusMeters,
      },
    })

    return NextResponse.json({ ok: true, office })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed to save office configuration.',
      },
      { status: 500 },
    )
  }
}
