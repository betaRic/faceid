export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { loadPersonByEmployeeIdentifier, resolveStaffAttendanceSession, sessionAllowsOffice } from '@/lib/employee-access'
import { buildEmployeeDtrDocument } from '@/lib/dtr-server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)

  const db = getAdminDb()
  const resolvedSession = await resolveStaffAttendanceSession(request, db)
  if (!resolvedSession || !resolvedSession.active) {
    return NextResponse.json({ ok: false, message: 'Admin or HR login is required.' }, { status: 401 })
  }

  const employeeId = searchParams.get('employeeId')
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const range = searchParams.get('range') || 'full'
  const customStartDay = searchParams.get('customStartDay')
  const customEndDay = searchParams.get('customEndDay')
  const signatoryName = String(searchParams.get('signatoryName') || '').trim()
  const signatoryPosition = String(searchParams.get('signatoryPosition') || '').trim()

  if (!employeeId || !month || !year) {
    return NextResponse.json({ ok: false, message: 'employeeId, month, and year are required.' }, { status: 400 })
  }

  const targetMonth = Number.parseInt(month, 10)
  const targetYear = Number.parseInt(year, 10)

  if (!Number.isFinite(targetMonth) || !Number.isFinite(targetYear) || targetMonth < 1 || targetMonth > 12) {
    return NextResponse.json({ ok: false, message: 'month and year must be valid numbers.' }, { status: 400 })
  }

  try {
    const personData = await loadPersonByEmployeeIdentifier(db, employeeId)
    if (!personData) {
      return NextResponse.json({ ok: false, message: 'Employee not found.' }, { status: 404 })
    }

    const officeId = personData.officeId || ''
    if (!sessionAllowsOffice(resolvedSession, officeId)) {
      return NextResponse.json({ ok: false, message: 'This session cannot access that employee DTR.' }, { status: 403 })
    }

    const dtr = await buildEmployeeDtrDocument(db, {
      employeeIdentifier: employeeId,
      personData,
      signatoryOverride: (signatoryName || signatoryPosition)
        ? { name: signatoryName, position: signatoryPosition }
        : null,
      month: targetMonth,
      year: targetYear,
      range,
      customStartDay,
      customEndDay,
    })

    return NextResponse.json({ ok: true, dtr })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to generate DTR.' },
      { status: 500 },
    )
  }
}

