export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveAttendanceViewer } from '@/lib/employee-access'
import { buildEmployeeDtrDocument } from '@/lib/dtr-server'
import { postgresEnabled } from '@/lib/postgres/client'
import {
  buildDtrWorkbookBytes,
  buildDtrWorkbookFilename,
  createDtrWorkbookResponse,
} from '@/lib/dtr-excel'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = String(searchParams.get('employeeId') || '').trim()
  const targetMonth = Number.parseInt(searchParams.get('month'), 10)
  const targetYear = Number.parseInt(searchParams.get('year'), 10)
  const range = searchParams.get('range') || 'full'
  const customStartDay = searchParams.get('customStartDay')
  const customEndDay = searchParams.get('customEndDay')

  if (!employeeId) {
    return NextResponse.json({ ok: false, message: 'Employee ID required.' }, { status: 400 })
  }

  if (!Number.isFinite(targetMonth) || !Number.isFinite(targetYear) || targetMonth < 1 || targetMonth > 12) {
    return NextResponse.json({ ok: false, message: 'month and year must be valid numbers.' }, { status: 400 })
  }

  try {
    const db = null
    const access = await resolveAttendanceViewer(request, db, employeeId)
    if (!access.viewer) {
      return NextResponse.json({ ok: false, message: access.message }, { status: access.status })
    }

    const dtr = await buildEmployeeDtrDocument(db, {
      employeeIdentifier: employeeId,
      personData: access.person,
      month: targetMonth,
      year: targetYear,
      range,
      customStartDay,
      customEndDay,
    })

    const bytes = await buildDtrWorkbookBytes([dtr])
    const filename = buildDtrWorkbookFilename([dtr], {
      month: targetMonth,
      year: targetYear,
      rangeLabel: dtr.rangeSpec?.label,
    })

    return createDtrWorkbookResponse(bytes, filename)
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to generate DTR workbook.' },
      { status: error?.status || 500 },
    )
  }
}

