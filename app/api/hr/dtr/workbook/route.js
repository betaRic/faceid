export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { loadPersonByEmployeeIdentifier, resolveStaffAttendanceSession, sessionAllowsOffice } from '@/lib/employee-access'
import { buildEmployeeDtrDocument } from '@/lib/dtr-server'
import { postgresEnabled } from '@/lib/postgres/client'
import {
  buildDtrWorkbookBytes,
  buildDtrWorkbookFilename,
  createDtrWorkbookResponse,
} from '@/lib/dtr-excel'

export async function POST(request) {
  const db = null
  const resolvedSession = await resolveStaffAttendanceSession(request, db)
  if (!resolvedSession || !resolvedSession.active) {
    return NextResponse.json({ ok: false, message: 'Admin or HR login is required.' }, { status: 401 })
  }

  let payload = {}
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid DTR workbook request.' }, { status: 400 })
  }

  const employeeIds = Array.isArray(payload.employeeIds)
    ? [...new Set(payload.employeeIds.map(value => String(value || '').trim()).filter(Boolean))]
    : []
  const targetMonth = Number.parseInt(payload.month, 10)
  const targetYear = Number.parseInt(payload.year, 10)
  const range = payload.range || 'full'
  const customStartDay = payload.customStartDay
  const customEndDay = payload.customEndDay
  const signatoryName = String(payload.signatoryName || '').trim()
  const signatoryPosition = String(payload.signatoryPosition || '').trim()
  const signatoryOverride = (signatoryName || signatoryPosition)
    ? { name: signatoryName, position: signatoryPosition }
    : null

  if (employeeIds.length === 0) {
    return NextResponse.json({ ok: false, message: 'Select at least one employee.' }, { status: 400 })
  }

  if (!Number.isFinite(targetMonth) || !Number.isFinite(targetYear) || targetMonth < 1 || targetMonth > 12) {
    return NextResponse.json({ ok: false, message: 'month and year must be valid numbers.' }, { status: 400 })
  }

  try {
    const officeCache = new Map()
    const dtrs = []

    for (const employeeId of employeeIds) {
      const personData = await loadPersonByEmployeeIdentifier(db, employeeId)
      if (!personData) continue

      if (!sessionAllowsOffice(resolvedSession, personData.officeId || '')) {
        return NextResponse.json({ ok: false, message: 'This session cannot access one or more selected employees.' }, { status: 403 })
      }

      dtrs.push(await buildEmployeeDtrDocument(db, {
        employeeIdentifier: employeeId,
        personData,
        officeCache,
        signatoryOverride,
        month: targetMonth,
        year: targetYear,
        range,
        customStartDay,
        customEndDay,
      }))
    }

    if (dtrs.length === 0) {
      return NextResponse.json({ ok: false, message: 'No selected employee records were found.' }, { status: 404 })
    }

    const bytes = await buildDtrWorkbookBytes(dtrs)
    const filename = buildDtrWorkbookFilename(dtrs, {
      month: targetMonth,
      year: targetYear,
      rangeLabel: dtrs[0]?.rangeSpec?.label,
    })

    return createDtrWorkbookResponse(bytes, filename)
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to generate DTR workbook.' },
      { status: error?.status || 500 },
    )
  }
}

