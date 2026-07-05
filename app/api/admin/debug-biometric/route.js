export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { DESCRIPTOR_LENGTH } from '@/lib/config'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { createOriginGuard } from '@/lib/csrf'
import {
  collectDuplicateCandidatePersons,
  evaluateDuplicateFaceCandidates,
} from '@/lib/persons/duplicate-face'
import { postgresEnabled, queryPostgres } from '@/lib/postgres/client'
import { listLocalPersons } from '@/lib/postgres/person-store'

export async function GET(request) {
  const usePostgres = postgresEnabled()
  const db = null
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

  if (usePostgres) {
    const result = await queryPostgres(
      `
        SELECT *
        FROM biometric_index
        WHERE ($1 = '' OR person_id = $1)
        ORDER BY updated_at DESC
        LIMIT 10
      `,
      [String(personId || '').trim()],
    )
    const samples = result.rows.map(row => ({
      id: row.id,
      personId: row.person_id,
      sampleIndex: row.sample_index,
      employeeId: row.employee_id,
      name: row.name,
      officeId: row.office_id,
      approvalStatus: row.approval_status,
      active: row.active,
      bucketA: row.bucket_a,
      bucketB: row.bucket_b,
      descriptorLength: Array.isArray(row.descriptor) ? row.descriptor.length : 0,
      normalizedLength: Array.isArray(row.normalized_descriptor) ? row.normalized_descriptor.length : 0,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    }))
    const bucketStats = {}
    samples.forEach(sample => {
      if (sample.bucketA) bucketStats[sample.bucketA] = (bucketStats[sample.bucketA] || 0) + 1
      if (sample.bucketB) bucketStats[sample.bucketB] = (bucketStats[sample.bucketB] || 0) + 1
    })

    return NextResponse.json({
      samples,
      totalSamples: samples.length,
      uniqueBuckets: Object.keys(bucketStats).length,
      bucketStats: Object.entries(bucketStats).slice(0, 20),
    })
  }

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

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const usePostgres = postgresEnabled()
  const db = null
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

  const body = await request.json().catch(() => null)
  const descriptors = Array.isArray(body?.descriptors) ? body.descriptors : []
  const excludePersonId = String(body?.excludePersonId || '').trim()

  if (descriptors.length === 0) {
    return NextResponse.json({ ok: false, message: 'Descriptors are required.' }, { status: 400 })
  }

  for (const descriptor of descriptors) {
    if (
      !Array.isArray(descriptor)
      || descriptor.length !== DESCRIPTOR_LENGTH
      || descriptor.some(value => !Number.isFinite(Number(value)))
    ) {
      return NextResponse.json({ ok: false, message: 'Invalid descriptor batch.' }, { status: 400 })
    }
  }

  const candidates = usePostgres
    ? (await listLocalPersons())
        .filter(person => person?.active !== false)
        .filter(person => ['approved', 'pending'].includes(String(person.approvalStatus || 'pending')))
        .filter(person => Array.isArray(person.descriptors) && person.descriptors.length > 0)
    : collectDuplicateCandidatePersons(await db.collection('persons').get())
  const evaluation = evaluateDuplicateFaceCandidates(candidates, descriptors, excludePersonId)

  return NextResponse.json({
    ok: true,
    descriptorCount: descriptors.length,
    evaluation,
  })
}

