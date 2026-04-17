export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { getAdminDb } from '@/lib/firebase-admin'

function toNumber(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export async function GET(request) {
  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const limit = Math.max(1, Math.min(100, toNumber(url.searchParams.get('limit'), 25)))
    const days = Math.max(1, Math.min(60, toNumber(url.searchParams.get('days'), 14)))
    const sinceTs = Date.now() - (days * 24 * 60 * 60 * 1000)

    const biometricsSnapshot = await db
      .collection('person_biometrics')
      .where('needsReenrollment', '==', true)
      .limit(limit * 2)
      .get()

    const candidates = biometricsSnapshot.docs
      .map(record => ({ id: record.id, ...record.data() }))
      .filter(candidate => adminSessionAllowsOffice(resolvedSession, candidate.officeId))
      .slice(0, limit)

    const noMatchSnapshot = await db
      .collection('scan_events')
      .where('timestamp', '>=', sinceTs)
      .limit(800)
      .get()

    const noMatchCounts = new Map()
    noMatchSnapshot.docs.forEach(record => {
      const data = record.data() || {}
      if (data.decisionCode !== 'blocked_no_reliable_match') return
      const personId = String(data.personId || '').trim()
      const employeeId = String(data.employeeId || '').trim()
      const key = personId || employeeId
      if (!key) return
      noMatchCounts.set(key, (noMatchCounts.get(key) || 0) + 1)
    })

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      days,
      candidates: candidates.map(candidate => {
        const key = String(candidate.personId || candidate.id || '').trim() || String(candidate.employeeId || '').trim()
        return {
          personId: candidate.personId || candidate.id,
          employeeId: candidate.employeeId || '',
          name: candidate.name || '',
          officeId: candidate.officeId || '',
          officeName: candidate.officeName || '',
          descriptorCount: Number(candidate.descriptorCount || 0),
          qualityScore: Number.isFinite(candidate.qualityScore) ? Number(candidate.qualityScore) : null,
          reenrollmentReason: candidate.reenrollmentReason || '',
          needsReenrollment: Boolean(candidate.needsReenrollment),
          noMatchCount: noMatchCounts.get(key) || 0,
        }
      }).sort((left, right) => (
        (right.noMatchCount - left.noMatchCount)
        || ((left.qualityScore ?? Number.POSITIVE_INFINITY) - (right.qualityScore ?? Number.POSITIVE_INFINITY))
        || left.name.localeCompare(right.name)
      )),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load reenrollment candidates.' },
      { status: 500 },
    )
  }
}
