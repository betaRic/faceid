export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { queryPostgres } from '@/lib/postgres/client'

function toNumber(value, fallback) {
  if (value == null || String(value).trim() === '') return fallback
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
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const limit = Math.max(1, Math.min(100, toNumber(url.searchParams.get('limit'), 25)))
    const days = Math.max(1, Math.min(60, toNumber(url.searchParams.get('days'), 14)))
    const sinceTs = Date.now() - (days * 24 * 60 * 60 * 1000)
    const officeId = resolvedSession.scope === 'office'
      ? String(resolvedSession.officeId || '')
      : ''

    const [pendingResult, followUpResult] = await Promise.all([
        queryPostgres(
          `
            SELECT
              id,
              employee_id,
              name,
              office_id,
              office_name,
              sample_count,
              data
            FROM persons
            WHERE lifecycle_status = 'pending'
              AND ($1 = '' OR office_id = $1)
            ORDER BY updated_at DESC
            LIMIT $2
          `,
          [officeId, limit],
        ),
        queryPostgres(
          `
            SELECT
              p.id,
              p.employee_id,
              p.name,
              p.office_id,
              p.office_name,
              p.sample_count,
              p.data,
              COALESCE(mismatch.claimed_mismatch_count, 0)::integer AS claimed_mismatch_count
            FROM persons p
            LEFT JOIN LATERAL (
              SELECT count(*)::integer AS claimed_mismatch_count
              FROM scan_events event
              WHERE event.timestamp_ms >= $1
                AND event.decision_code = 'blocked_claimed_employee_mismatch'
                AND (
                  COALESCE(
                    NULLIF(event.person_id, ''),
                    NULLIF(event.match_debug->>'resolvedPersonId', '')
                  ) = p.id
                  OR (
                    COALESCE(
                      NULLIF(event.person_id, ''),
                      NULLIF(event.match_debug->>'resolvedPersonId', '')
                    ) IS NULL
                    AND p.employee_id <> ''
                    AND NULLIF(event.match_debug->>'resolvedEmployeeId', '') = p.employee_id
                    AND COALESCE(
                      NULLIF(event.match_debug->>'officeId', ''),
                      NULLIF(event.office_id, '')
                    ) = p.office_id
                    AND NOT EXISTS (
                      SELECT 1
                      FROM persons duplicate_person
                      WHERE duplicate_person.id <> p.id
                        AND duplicate_person.employee_id = p.employee_id
                        AND duplicate_person.office_id = p.office_id
                        AND duplicate_person.lifecycle_status = 'active'
                        AND duplicate_person.active = true
                        AND duplicate_person.approval_status = 'approved'
                    )
                  )
                )
            ) mismatch ON true
            WHERE p.lifecycle_status = 'active'
              AND p.active = true
              AND p.approval_status = 'approved'
              AND ($2 = '' OR p.office_id = $2)
              AND (p.sample_count = 0 OR COALESCE(mismatch.claimed_mismatch_count, 0) >= 2)
            ORDER BY
              COALESCE(mismatch.claimed_mismatch_count, 0) DESC,
              p.sample_count ASC,
              p.name ASC
            LIMIT $3
          `,
          [sinceTs, officeId, limit],
        ),
      ])

      const mapPerson = row => ({
          personId: row.id,
          employeeId: row.employee_id || '',
          name: row.name || '',
          officeId: row.office_id || '',
          officeName: row.office_name || '',
          descriptorCount: Number(row.sample_count || 0),
          qualityScore: Number.isFinite(row.data?.biometricQualityScore) ? Number(row.data.biometricQualityScore) : null,
        })
      const pendingApproval = pendingResult.rows.map(row => ({
        ...mapPerson(row),
        queueReason: 'pending_approval',
      }))
      const biometricFollowUp = followUpResult.rows.map(row => ({
        ...mapPerson(row),
        claimedMismatchCount: Number(row.claimed_mismatch_count || 0),
        followUpReason: Number(row.sample_count || 0) === 0
          ? 'missing_biometrics'
          : 'repeated_claimed_mismatch',
      }))

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      days,
      pendingApproval,
      biometricFollowUp,
    })
  } catch (error) {
    console.error('[biometric-follow-up] query failed', {
      code: error?.code,
      name: error?.name,
    })
    return NextResponse.json(
      { ok: false, message: 'Failed to load biometric follow-up.' },
      { status: 500 },
    )
  }
}

