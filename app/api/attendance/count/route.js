export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/http/server-error'
import { countLocalAttendanceForDate } from '@/lib/postgres/report-store'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()

  if (!date) {
    return NextResponse.json({ ok: false, count: 0 }, { status: 400 })
  }

  try {
    const count = await countLocalAttendanceForDate(date)
    return NextResponse.json({ ok: true, count })
  } catch (error) {
    return serverErrorResponse(error, {
      context: 'api/attendance/count:GET',
      publicMessage: 'Failed to load attendance count.',
    })
  }
}

