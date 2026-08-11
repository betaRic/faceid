export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
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
    return NextResponse.json({ ok: false, count: 0, message: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

