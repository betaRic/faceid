export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { toLegacyAttendanceDate } from '@/lib/attendance-time'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()

  if (!date) {
    return NextResponse.json({ ok: false, count: 0 }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const legacyDateLabel = toLegacyAttendanceDate(date)

    const snapshot = await db
      .collection('attendance')
      .where('dateKey', '==', date)
      .get()

    let count = snapshot.size

    if (count === 0) {
      const legacySnapshot = await db
        .collection('attendance')
        .where('date', '==', legacyDateLabel)
        .get()

      count = legacySnapshot.size
    }

    return NextResponse.json({ ok: true, count })
  } catch (error) {
    return NextResponse.json({ ok: false, count: 0, message: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
