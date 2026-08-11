export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { getLocalPersonById, resetLocalPersonBiometrics } from '@/lib/postgres/person-store'

// This is an authorized, per-person correction only. There is no bulk reset.
export async function POST(request, { params }) {
  const originError = await createOriginGuard()(request)
  if (originError) return originError
  const { personId } = await params
  if (!personId) return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })

  try {
    const session = await resolveEmployeeManagementSession(request, null)
    if (!session) return NextResponse.json({ ok: false, message: 'Admin or HR employee-management access is required.' }, { status: 403 })
    const person = await getLocalPersonById(personId)
    if (!person) return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })
    if (!sessionAllowsOffice(session, person.officeId)) return NextResponse.json({ ok: false, message: 'This session cannot reset that employee.' }, { status: 403 })

    const previousSampleCount = Array.isArray(person.descriptors) ? person.descriptors.length : 0
    await resetLocalPersonBiometrics(personId)
    await writeAuditLog(null, {
      actorRole: session.role, actorScope: session.scope, actorOfficeId: session.officeId,
      action: 'person_biometric_reset', targetType: 'person', targetId: personId, officeId: person.officeId || '',
      summary: `Biometric reset for ${person.name} — ${previousSampleCount} sample(s) cleared, pending admin re-enrollment`,
      metadata: { employeeId: person.employeeId || '', previousSampleCount, officeName: person.officeName || '' },
    })
    return NextResponse.json({ ok: true, message: `Face data cleared. Re-enroll ${person.name} through the authorized employee editor, then approve the record.` })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Biometric reset failed.' }, { status: 500 })
  }
}
