export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase-admin'
import { adminSessionAllowsOffice, isRegionalAdminSession, parseAdminSessionCookieValue, getAdminSessionCookieName, resolveAdminSession } from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { clearOfficeRecordCache } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'
import { normalizeDivisionList, REGIONAL_OFFICE_TYPE } from '@/lib/offices'

function normalizeOfficePayload(officeId, payload) {
  return {
    id: officeId,
    code: String(payload?.code || '').trim(),
    name: String(payload?.name || '').trim(),
    shortName: String(payload?.shortName || '').trim(),
    officeType: String(payload?.officeType || '').trim(),
    location: String(payload?.location || '').trim(),
    provinceOrCity: String(payload?.provinceOrCity || '').trim(),
    headName: String(payload?.headName || '').trim(),
    headPosition: String(payload?.headPosition || '').trim(),
    divisions: normalizeDivisionList(payload?.divisions),
    wifiSsid: Array.isArray(payload?.wifiSsid)
      ? payload.wifiSsid.map(s => String(s || '').trim()).filter(Boolean)
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

  if (!office.headName || !office.headPosition) {
    return 'Office head name and head position are required.'
  }

  if (office.officeType === REGIONAL_OFFICE_TYPE) {
    if (!Array.isArray(office.divisions) || office.divisions.length === 0) {
      return 'Regional offices must define at least one division or unit.'
    }
    for (const division of office.divisions) {
      if (!division.name || !division.shortName) {
        return 'Each division must have a name and short name.'
      }
      if (!division.headName || !division.headPosition) {
        return `Division ${division.shortName || division.name} requires a head name and position.`
      }
    }
  }

  return null
}

export async function PUT(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { officeId } = await params
  if (!officeId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const office = normalizeOfficePayload(officeId, body?.office)
  const validationError = validateOffice(office)

  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!adminSessionAllowsOffice(resolvedSession, officeId)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot edit that office.' }, { status: 403 })
    }

    await db.collection('offices').doc(office.id).set({
      ...office,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    await clearOfficeRecordCache()

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
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

export async function DELETE(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { officeId } = await params
  if (!officeId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const officeRef = db.collection('offices').doc(officeId)
    const officeSnapshot = await officeRef.get()
    if (!officeSnapshot.exists) {
      return NextResponse.json({ ok: false, message: 'Office not found.' }, { status: 404 })
    }

    const [personCount, adminCount, attendanceCount, dailyCount] = await Promise.all([
      db.collection('persons').where('officeId', '==', officeId).count().get(),
      db.collection('admins').where('officeId', '==', officeId).count().get(),
      db.collection('attendance').where('officeId', '==', officeId).count().get(),
      db.collection('attendance_daily').where('officeId', '==', officeId).count().get(),
    ])

    const references = {
      persons: personCount.data().count,
      admins: adminCount.data().count,
      attendance: attendanceCount.data().count,
      attendanceDaily: dailyCount.data().count,
    }

    if (Object.values(references).some(count => Number(count) > 0)) {
      return NextResponse.json({
        ok: false,
        message: 'This office is still referenced by employee, admin, or attendance records. Mark it inactive instead of deleting it.',
        references,
      }, { status: 409 })
    }

    const office = officeSnapshot.data() || {}
    await officeRef.delete()
    await clearOfficeRecordCache()

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'office_delete',
      targetType: 'office',
      targetId: officeId,
      officeId,
      summary: `Deleted office ${office.name || officeId}`,
      metadata: { references },
    })

    return NextResponse.json({ ok: true, officeId })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to delete office.' },
      { status: 500 },
    )
  }
}
