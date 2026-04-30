export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { normalizeDescriptor, euclideanDistance } from '@/lib/biometrics/descriptor-utils'
import { buildDescriptorBuckets } from '@/lib/biometric-index'
import { getActiveThresholds } from '@/lib/thresholds'
import { createOriginGuard } from '@/lib/csrf'

/**
 * POST /api/debug/match-test
 *
 * Diagnostic endpoint: send a descriptor and get back distances to ALL index entries.
 * Shows exactly why matching is failing.
 *
 * Body: { descriptor: number[] }
 *
 * Also available as GET to show index health without a descriptor.
 */

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ error: 'Regional admin access required' }, { status: 403 })
    }

    const [snapshot, thresholds] = await Promise.all([
      db.collection('biometric_index')
        .where('active', '==', true)
        .where('approvalStatus', '==', 'approved')
        .get(),
      getActiveThresholds(db),
    ])

    const entries = snapshot.docs.map(doc => {
      const data = doc.data()
      const nd = Array.isArray(data.normalizedDescriptor) ? data.normalizedDescriptor : []
      const magnitude = Math.sqrt(nd.reduce((s, v) => s + Number(v) * Number(v), 0))
      return {
        id: doc.id,
        personId: data.personId,
        name: data.name,
        officeId: data.officeId,
        biometricEnabled: data.biometricEnabled === true,
        active: data.active !== false,
        approvalStatus: data.approvalStatus,
        bucketA: data.bucketA,
        bucketB: data.bucketB,
        descriptorLength: nd.length,
        descriptorMagnitude: magnitude,
        descriptorSample: nd.slice(0, 5).map(Number),
        hasValidDescriptor: nd.length === 1024 && magnitude > 0.9 && magnitude < 1.1,
      }
    })

    const healthy = entries.filter(e => e.hasValidDescriptor).length
    const broken = entries.filter(e => !e.hasValidDescriptor).length
    const biometricEnabledTrue = entries.filter(e => e.biometricEnabled).length
    const biometricEnabledFalse = entries.filter(e => !e.biometricEnabled).length
    const byOffice = Object.entries(entries.reduce((acc, entry) => {
      const officeId = String(entry.officeId || '(none)')
      acc[officeId] = (acc[officeId] || 0) + 1
      return acc
    }, {})).sort((left, right) => right[1] - left[1])

    return NextResponse.json({
      total: entries.length,
      healthy,
      broken,
      biometricEnabledTrue,
      biometricEnabledFalse,
      byOffice,
      threshold: thresholds.kioskMatchDistance,
      ambiguousMargin: thresholds.ambiguousMargin,
      entries,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ error: 'Regional admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const rawDescriptor = Array.isArray(body?.descriptor) ? body.descriptor.map(Number) : []

    if (rawDescriptor.length !== 1024) {
      return NextResponse.json(
        { error: `Descriptor must be 1024 dimensions, got ${rawDescriptor.length}` },
        { status: 400 },
      )
    }

    const queryNormalized = normalizeDescriptor(rawDescriptor)
    const queryMagnitude = Math.sqrt(rawDescriptor.reduce((s, v) => s + v * v, 0))
    const { bucketA: queryBucketA, bucketB: queryBucketB } = buildDescriptorBuckets(rawDescriptor)

    const [snapshot, thresholds] = await Promise.all([
      db.collection('biometric_index')
        .where('active', '==', true)
        .where('approvalStatus', '==', 'approved')
        .get(),
      getActiveThresholds(db),
    ])

    const results = []
    for (const doc of snapshot.docs) {
      const data = doc.data()
      const storedNd = Array.isArray(data.normalizedDescriptor)
        ? data.normalizedDescriptor.map(Number)
        : []

      if (storedNd.length !== 1024) {
        results.push({
          id: doc.id,
          personId: data.personId,
          name: data.name,
          distance: null,
          error: `Descriptor length ${storedNd.length}, expected 1024`,
          bucketMatch: false,
        })
        continue
      }

      const distance = euclideanDistance(storedNd, queryNormalized)
      const storedMagnitude = Math.sqrt(storedNd.reduce((s, v) => s + v * v, 0))

      results.push({
        id: doc.id,
        personId: data.personId,
        name: data.name,
        distance: Math.round(distance * 10000) / 10000,
        withinThreshold: distance <= thresholds.kioskMatchDistance,
        storedMagnitude: Math.round(storedMagnitude * 10000) / 10000,
        bucketA: data.bucketA,
        bucketB: data.bucketB,
        bucketAMatch: data.bucketA === queryBucketA,
        bucketBMatch: data.bucketB === queryBucketB,
      })
    }

    results.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999))

    // Group by person (best distance per person)
    const byPerson = new Map()
    for (const r of results) {
      const existing = byPerson.get(r.personId)
      if (!existing || (r.distance != null && (existing.distance == null || r.distance < existing.distance))) {
        byPerson.set(r.personId, r)
      }
    }
    const ranked = Array.from(byPerson.values()).sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999))

    return NextResponse.json({
      query: {
        descriptorLength: rawDescriptor.length,
        rawMagnitude: Math.round(queryMagnitude * 10000) / 10000,
        normalizedMagnitude: Math.round(Math.sqrt(queryNormalized.reduce((s, v) => s + v * v, 0)) * 10000) / 10000,
        bucketA: queryBucketA,
        bucketB: queryBucketB,
        sample: queryNormalized.slice(0, 5),
      },
      config: {
        threshold: thresholds.kioskMatchDistance,
        ambiguousMargin: thresholds.ambiguousMargin,
      },
      totalCandidates: snapshot.docs.length,
      matchesWithinThreshold: ranked.filter(r => r.withinThreshold).length,
      rankedByPerson: ranked,
      allSampleDistances: results,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
