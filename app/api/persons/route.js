export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getOfficeRecord } from '@/lib/office-directory'
import { buildAuthoritativeEnrollmentPayload } from '@/lib/biometrics/server-enrollment'
import {
  enrollLocalPerson,
  loadLocalPersonDirectory,
  listLocalPersons,
} from '@/lib/postgres/person-store'
import { parseDirectoryParams } from '@/lib/persons'
import { encodePersonDirectoryCursor } from '@/lib/person-directory'
import { normalizeDataImage } from '@/lib/images/safe-data-image'
import { createPersonsPostHandler } from '@/lib/routes/persons-route'
import {
  getSessionOfficeFilter,
  resolveEmployeeManagementSession,
  sessionAllowsOffice,
} from '@/lib/employee-access'

function createRouteTimer(operation) {
  const startedAt = Date.now()
  const marks = []
  return {
    mark(label) {
      marks.push({ label, elapsedMs: Date.now() - startedAt })
    },
    warnIfSlow(thresholdMs = 3000) {
      const elapsedMs = Date.now() - startedAt
      if (elapsedMs < thresholdMs) return
      console.warn(`[PersonsAPI] Slow ${operation}`, { elapsedMs, marks })
    },
  }
}

export async function GET(request) {
  const timer = createRouteTimer('GET /api/persons')
  try {
    const db = null
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    timer.mark('session')
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR employee-management access is required.' }, { status: 403 })
    }

    if (new URL(request.url).searchParams.get('mode') === 'directory') {
      const params = parseDirectoryParams(request)
      const effectiveOfficeId = getSessionOfficeFilter(resolvedSession, params.officeId)
      if (params.divisionId) {
        if (!effectiveOfficeId) {
          return NextResponse.json({ ok: false, message: 'Choose the regional office before filtering by division.' }, { status: 400 })
        }
        const office = await getOfficeRecord(db, effectiveOfficeId)
        const validDivision = Array.isArray(office?.divisions)
          && office.divisions.some((division) => division?.id === params.divisionId)
        if (!validDivision) {
          return NextResponse.json({ ok: false, message: 'The selected division does not belong to this office.' }, { status: 400 })
        }
      }
      const directory = await loadLocalPersonDirectory({
        ...params,
        officeId: effectiveOfficeId,
      })
      const lastPerson = directory.persons[directory.persons.length - 1]
      const nextCursor = directory.hasMore && lastPerson
        ? encodePersonDirectoryCursor(lastPerson, params.searchMode)
        : ''
      return NextResponse.json({
        ok: true,
        persons: directory.persons,
        page: {
          limit: params.limit,
          hasMore: directory.hasMore,
          nextCursor,
          total: directory.total,
          approved: directory.approved,
          pending: directory.pending,
          rejected: directory.rejected,
          searchMode: params.searchMode,
        },
      })
    }

    const persons = (await listLocalPersons({
      officeId: getSessionOfficeFilter(resolvedSession),
    }))
      .filter(person => sessionAllowsOffice(resolvedSession, person.officeId))
    return NextResponse.json({ ok: true, persons })
  } catch (error) {
    timer.warnIfSlow(1000)
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' },
      { status: 500 },
    )
  }
}

export const POST = createPersonsPostHandler({
  buildAuthoritativeEnrollmentPayload,
  enrollLocalPerson,
  normalizeDataImage,
  writeTelemetry: async ({ elapsedMs, marks }) => {
    if (elapsedMs < 3000) return
    console.warn('[PersonsAPI] Slow POST /api/persons', { elapsedMs, marks })
  },
})

