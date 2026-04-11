export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { listOfficeRecords } from '@/lib/office-directory'
import { warmBiometricIndexCache } from '@/lib/biometric-index'

export const runtime = 'nodejs'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminDb()
  const offices = await listOfficeRecords(db)
  const officeIds = offices.map(o => o.id)

  const warmed = await warmBiometricIndexCache(db, officeIds)

  return NextResponse.json({ ok: true, warmed, officeCount: officeIds.length })
}
