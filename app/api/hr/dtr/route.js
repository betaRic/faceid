export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { loadPersonByEmployeeId, resolveStaffAttendanceSession, sessionAllowsOffice } from '@/lib/employee-access'
import { listOfficeRecords } from '@/lib/office-directory'
import { buildDtrDocument, getDaysInMonth } from '@/lib/dtr'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'

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

  if (!employeeId || !month || !year) {
    return NextResponse.json({ ok: false, message: 'employeeId, month, and year are required.' }, { status: 400 })
  }

  const targetMonth = Number.parseInt(month, 10)
  const targetYear = Number.parseInt(year, 10)

  if (!Number.isFinite(targetMonth) || !Number.isFinite(targetYear) || targetMonth < 1 || targetMonth > 12) {
    return NextResponse.json({ ok: false, message: 'month and year must be valid numbers.' }, { status: 400 })
  }

  try {
    const personData = await loadPersonByEmployeeId(db, employeeId)
    if (!personData) {
      return NextResponse.json({ ok: false, message: 'Employee not found.' }, { status: 404 })
    }

    const officeId = personData.officeId || ''
    if (!sessionAllowsOffice(resolvedSession, officeId)) {
      return NextResponse.json({ ok: false, message: 'This session cannot access that employee DTR.' }, { status: 403 })
    }

    const allOffices = await listOfficeRecords(db)
    const office = allOffices.find(o => o.id === officeId) || {}

    const daysInMonth = getDaysInMonth(targetYear, targetMonth)
    const monthLabel = String(targetMonth).padStart(2, '0')
    const startDate = new Date(`${targetYear}-${monthLabel}-01T00:00:00+08:00`)
    const endDate = new Date(`${targetYear}-${monthLabel}-${String(daysInMonth).padStart(2, '0')}T23:59:59.999+08:00`)

    const empId = personData.employeeId || employeeId
    const snapshot = await db
      .collection('attendance')
      .where('employeeId', '==', empId)
      .where('timestamp', '>=', startDate.getTime())
      .where('timestamp', '<=', endDate.getTime())
      .orderBy('timestamp', 'asc')
      .get()

    const logs = snapshot.docs.map(doc => doc.data())

    const logsByDate = {}
    logs.forEach(log => {
      const dateKey = log.dateKey
      if (!logsByDate[dateKey]) logsByDate[dateKey] = []
      logsByDate[dateKey].push(log)
    })

    // Use canonical deriveDailyAttendanceRecord (same logic as daily summary panel)
    // so DTR and HR dashboard always agree on times, late minutes, and undertime.
    const dayRecords = []
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayLogs = (logsByDate[dateKey] || []).sort((a, b) => a.timestamp - b.timestamp)
      const derived = deriveDailyAttendanceRecord({
        logs: dayLogs,
        person: personData,
        office,
        targetDateKey: dateKey,
      })

      dayRecords.push({
        day,
        dateKey,
        amIn: derived.amIn !== '--' ? derived.amIn : '',
        amOut: derived.amOut !== '--' ? derived.amOut : '',
        pmIn: derived.pmIn !== '--' ? derived.pmIn : '',
        pmOut: derived.pmOut !== '--' ? derived.pmOut : '',
        undertime: derived.undertimeMinutes,
        totalHours: derived.workingMinutes,
      })
    }

    const dtr = buildDtrDocument({
      employee: {
        id: personData.id || employeeId,
        name: personData.name || '',
        employeeId: personData.employeeId || '',
        position: personData.position || '',
        office: office.name || personData.officeName || '',
      },
      month: targetMonth,
      year: targetYear,
      range,
      customStartDay,
      customEndDay,
      dayRecords,
    })

    return NextResponse.json({ ok: true, dtr })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to generate DTR.' },
      { status: 500 },
    )
  }
}

