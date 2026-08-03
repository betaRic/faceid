export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { clearOfficeRecordCache, getOfficeRecord } from '@/lib/office-directory'
import { normalizeOfficeRecord } from '@/lib/offices'
import { postgresEnabled } from '@/lib/postgres/client'
import { upsertLocalOffice } from '@/lib/postgres/report-store'

function resolveOfficeHrSession(request) {
  return parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
}

function normalizeDays(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
}

function normalizeTime(value) {
  const time = String(value || '').trim()
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : ''
}

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 && number <= 720 ? number : fallback
}

function validateOfficeHrSettings(payload) {
  const location = String(payload?.location || '').trim()
  const provinceOrCity = String(payload?.provinceOrCity || '').trim()
  const latitude = Number(payload?.gps?.latitude)
  const longitude = Number(payload?.gps?.longitude)
  const workPolicy = payload?.workPolicy || {}
  const morningIn = normalizeTime(workPolicy.morningIn)
  const morningOut = normalizeTime(workPolicy.morningOut)
  const afternoonIn = normalizeTime(workPolicy.afternoonIn)
  const afternoonOut = normalizeTime(workPolicy.afternoonOut)
  const schedule = String(workPolicy.schedule || '').trim()
  const workingDays = normalizeDays(workPolicy.workingDays)

  if (!location) return { error: 'Location label is required.' }
  if (!provinceOrCity) return { error: 'Province or city is required.' }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: 'Enter valid GPS coordinates.' }
  }
  if (!schedule) return { error: 'Schedule label is required.' }
  if (workingDays.length === 0) return { error: 'Choose at least one working day.' }
  if (!morningIn || !morningOut || !afternoonIn || !afternoonOut) return { error: 'Complete all session times before saving.' }
  if (morningIn >= morningOut) return { error: 'AM check-out must be later than AM check-in.' }
  if (afternoonIn >= afternoonOut) return { error: 'PM check-out must be later than PM check-in.' }

  return {
    value: {
      location,
      provinceOrCity,
      gps: { latitude, longitude },
      workPolicy: {
        schedule,
        workingDays,
        wfhDays: normalizeDays(workPolicy.wfhDays),
        morningIn,
        morningOut,
        afternoonIn,
        afternoonOut,
        gracePeriodMinutes: normalizeNonNegativeInteger(workPolicy.gracePeriodMinutes, 0),
        checkInCooldownMinutes: normalizeNonNegativeInteger(workPolicy.checkInCooldownMinutes, 30),
        checkOutCooldownMinutes: normalizeNonNegativeInteger(workPolicy.checkOutCooldownMinutes, 5),
      },
    },
  }
}

async function getOfficeForOfficeHr(request) {
  const session = resolveOfficeHrSession(request)
  if (!session) return { error: NextResponse.json({ ok: false, message: 'HR login is required.' }, { status: 401 }) }

  const resolvedSession = await resolveHrSession(null, session)
  if (!resolvedSession?.active || resolvedSession.scope !== 'office' || !resolvedSession.officeId) {
    return { error: NextResponse.json({ ok: false, message: 'Office HR access is required.' }, { status: 403 }) }
  }

  const office = await getOfficeRecord(null, resolvedSession.officeId)
  if (!office) return { error: NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 404 }) }
  return { resolvedSession, office: normalizeOfficeRecord(office) }
}

export async function GET(request) {
  try {
    const access = await getOfficeForOfficeHr(request)
    if (access.error) return access.error
    return NextResponse.json({ ok: true, office: access.office })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load office settings.' }, { status: 500 })
  }
}

export async function PUT(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  try {
    const access = await getOfficeForOfficeHr(request)
    if (access.error) return access.error
    if (!postgresEnabled()) {
      return NextResponse.json({ ok: false, message: 'Office HR settings are available on the local server runtime only.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const parsed = validateOfficeHrSettings(body)
    if (parsed.error) return NextResponse.json({ ok: false, message: parsed.error }, { status: 400 })

    const updatedOffice = normalizeOfficeRecord({
      ...access.office,
      location: parsed.value.location,
      provinceOrCity: parsed.value.provinceOrCity,
      gps: {
        ...access.office.gps,
        latitude: parsed.value.gps.latitude,
        longitude: parsed.value.gps.longitude,
        // Geofence radius is deliberately preserved: only an admin can change it.
        radiusMeters: access.office.gps.radiusMeters,
      },
      workPolicy: {
        ...access.office.workPolicy,
        ...parsed.value.workPolicy,
      },
    })

    await upsertLocalOffice(updatedOffice)
    await clearOfficeRecordCache()
    await writeAuditLog(null, {
      actorRole: 'hr',
      actorScope: access.resolvedSession.scope,
      actorOfficeId: access.resolvedSession.officeId,
      action: 'office_hr_settings_update',
      targetType: 'office',
      targetId: updatedOffice.id,
      officeId: updatedOffice.id,
      summary: `Office HR updated allowed settings for ${updatedOffice.name}`,
      metadata: {
        locationChanged: access.office.location !== updatedOffice.location
          || access.office.gps.latitude !== updatedOffice.gps.latitude
          || access.office.gps.longitude !== updatedOffice.gps.longitude,
        workPolicyChanged: JSON.stringify(access.office.workPolicy) !== JSON.stringify(updatedOffice.workPolicy),
        geofenceRadiusMeters: updatedOffice.gps.radiusMeters,
      },
    })

    return NextResponse.json({ ok: true, office: updatedOffice })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Unable to save office settings.' }, { status: 500 })
  }
}
