export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { postgresEnabled } from '@/lib/postgres/client'
import { getLocalPersonById, regenerateLocalAccessCode } from '@/lib/postgres/person-store'

export async function POST(request, { params }) {
  const originGuard = createOriginGuard()
  const originError = await originGuard(request)
  if (originError) return originError

  const { personId } = await params
  if (!personId) return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })

  try {
    if (!postgresEnabled()) {
      return NextResponse.json({ ok: false, message: 'Access-code management is available on the local server runtime only.' }, { status: 503 })
    }

    const db = null
    const session = await resolveEmployeeManagementSession(request, db)
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Admin or HR employee-management access is required.' }, { status: 403 })
    }

    const person = await getLocalPersonById(personId)
    if (!person) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    if (!sessionAllowsOffice(session, person.officeId || '')) {
      return NextResponse.json({ ok: false, message: 'This session cannot update that employee access code.' }, { status: 403 })
    }

    const updated = await regenerateLocalAccessCode(personId)
    if (!updated) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })

    await writeAuditLog(db, {
      actorRole: session.role,
      actorScope: session.scope,
      actorOfficeId: session.officeId,
      action: 'person_access_code_regenerated',
      targetType: 'person',
      targetId: personId,
      officeId: person.officeId || '',
      summary: `Regenerated VeriFace access code for ${person.name || person.employeeId || personId}`,
      metadata: { employeeId: person.employeeId || '' },
    })

    return NextResponse.json({ ok: true, accessCode: updated.accessCode })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to regenerate the access code.' },
      { status: 500 },
    )
  }
}
