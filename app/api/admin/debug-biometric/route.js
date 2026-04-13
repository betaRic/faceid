export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'

export async function GET(request) {
  const db = getAdminDb()
  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }
  const resolvedSession = await resolveAdminSession(db, session)
  if (!resolvedSession) {
    return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const personId = searchParams.get('personId')

  let query = db.collection('biometric_index').limit(10)
  if (personId) {
    query = db.collection('biometric_index').where('personId', '==', personId)
  }

  const snapshot = await query.get()

  const samples = snapshot.docs.map(doc => {
    const data = doc.data()
    return {
      id: doc.id,
      personId: data.personId,
      sampleIndex: data.sampleIndex,
      employeeId: data.employeeId,
      name: data.name,
      officeId: data.officeId,
      approvalStatus: data.approvalStatus,
      active: data.active,
      bucketA: data.bucketA,
      bucketB: data.bucketB,
      descriptorLength: data.descriptor?.length,
      normalizedLength: data.normalizedDescriptor?.length,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    }
  })

  const bucketStats = {}
  snapshot.docs.forEach(doc => {
    const data = doc.data()
    if (data.bucketA) bucketStats[data.bucketA] = (bucketStats[data.bucketA] || 0) + 1
    if (data.bucketB) bucketStats[data.bucketB] = (bucketStats[data.bucketB] || 0) + 1
  })

  return NextResponse.json({
    samples,
    totalSamples: snapshot.size,
    uniqueBuckets: Object.keys(bucketStats).length,
    bucketStats: Object.entries(bucketStats).slice(0, 20),
  })
}