export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { postgresEnabled, queryPostgres } from '@/lib/postgres/client'

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
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const limit = Math.max(1, Math.min(100, toNumber(url.searchParams.get('limit'), 25)))
    const days = Math.max(1, Math.min(60, toNumber(url.searchParams.get('days'), 14)))
    const sinceTs = Date.now() - (days * 24 * 60 * 60 * 1000)

    if (usePostgres) {
      const [personsResult, eventsResult] = await Promise.all([
        queryPostgres(
          `
            SELECT *
            FROM persons
            WHERE active = true
              AND (sample_count = 0 OR approval_status = 'pending')
            ORDER BY updated_at DESC
            LIMIT $1
          `,
          [limit * 2],
        ),
        queryPostgres(
          `
            SELECT person_id, employee_id, count(*)::integer AS count
            FROM scan_events
            WHERE timestamp_ms >= $1 AND decision_code = 'blocked_no_reliable_match'
            GROUP BY person_id, employee_id
          `,
          [sinceTs],
        ),
      ])

      const noMatchCounts = new Map()
      eventsResult.rows.forEach(row => {
        const key = String(row.person_id || row.employee_id || '').trim()
        if (key) noMatchCounts.set(key, Number(row.count || 0))
      })

      const candidates = personsResult.rows
        .map(row => ({
          personId: row.id,
          employeeId: row.employee_id || '',
          name: row.name || '',
          officeId: row.office_id || '',
          officeName: row.office_name || '',
          descriptorCount: Number(row.sample_count || 0),
          qualityScore: Number.isFinite(row.data?.biometricQualityScore) ? Number(row.data.biometricQualityScore) : null,
          reenrollmentReason: row.sample_count > 0 ? 'Pending approval' : 'No active biometric samples',
          needsReenrollment: Number(row.sample_count || 0) === 0,
          noMatchCount: noMatchCounts.get(String(row.id)) || noMatchCounts.get(String(row.employee_id || '')) || 0,
        }))
        .filter(candidate => adminSessionAllowsOffice(resolvedSession, candidate.officeId))
        .slice(0, limit)

      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        days,
        candidates: candidates.sort((left, right) => (
          (right.noMatchCount - left.noMatchCount)
          || ((left.qualityScore ?? Number.POSITIVE_INFINITY) - (right.qualityScore ?? Number.POSITIVE_INFINITY))
          || left.name.localeCompare(right.name)
        )),
      })
    }

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

