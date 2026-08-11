export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit-log'
import { getOfficeRecord } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { deleteLocalPerson, getLocalPersonById, updateLocalPersonProfile } from '@/lib/postgres/person-store'
import { PERSON_LIFECYCLE_ACTIVE, PERSON_LIFECYCLE_INACTIVE, PERSON_LIFECYCLE_PENDING, normalizePersonLifecycleStatus } from '@/lib/person-approval'
import { normalizeEmployeeNameFields } from '@/lib/person-name'
import { normalizeEmployeeWfhDays } from '@/lib/employee-wfh'
import { normalizeWeeklySchedule } from '@/lib/workforce-policy'

function normalizeBody(body) {
  const names = normalizeEmployeeNameFields(body || {})
  return {
    ...names,
    employeeId: String(body?.employeeId || '').trim(), position: String(body?.position || '').trim(),
    officeId: String(body?.officeId || '').trim(), officeName: String(body?.officeName || '').trim(),
    divisionId: String(body?.divisionId || '').trim(), divisionName: String(body?.divisionName || '').trim(),
    individualWfhDays: normalizeEmployeeWfhDays(body?.individualWfhDays),
    lifecycleStatus: typeof body?.lifecycleStatus === 'string' ? normalizePersonLifecycleStatus(body.lifecycleStatus, '') : '',
    weeklySchedule: Object.prototype.hasOwnProperty.call(body || {}, 'weeklySchedule') ? normalizeWeeklySchedule(body?.weeklySchedule) : undefined,
    flexitime: Object.prototype.hasOwnProperty.call(body || {}, 'flexitime') ? { enabled: body?.flexitime?.enabled === true, requiredMinutes: Number(body?.flexitime?.requiredMinutes) || null } : undefined,
  }
}

function validateBody(body) {
  if (!body.lastName) return 'Last name is required.'
  if (!body.firstName) return 'First name is required.'
  if (body.employeeId && (body.employeeId.length < 3 || body.employeeId.length > 20 || !/^\d+$/.test(body.employeeId))) return 'Employee ID must contain 3-20 digits only.'
  if (!body.position || body.position.length < 2 || body.position.length > 80) return 'Position must be 2-80 characters.'
  if (!body.officeId) return 'Assigned office is required.'
  if (body.lifecycleStatus && ![PERSON_LIFECYCLE_PENDING, PERSON_LIFECYCLE_ACTIVE, PERSON_LIFECYCLE_INACTIVE].includes(body.lifecycleStatus)) return 'Lifecycle status is not valid.'
  return ''
}

function validateDivision(body, office) {
  if (String(office?.officeType || '') !== 'Regional Office') return ''
  if (!body.divisionId) return 'Division or unit is required for Regional Office staff.'
  return Array.isArray(office.divisions) && office.divisions.some(division => division?.id === body.divisionId) ? '' : 'Selected division or unit is not configured for this office.'
}

export async function PUT(request, { params }) {
  const originError = await createOriginGuard()(request)
  if (originError) return originError
  const { personId } = await params
  if (!personId) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  const body = normalizeBody(await request.json().catch(() => null))
  const validation = validateBody(body)
  if (validation) return NextResponse.json({ ok: false, message: validation }, { status: 400 })

  try {
    const session = await resolveEmployeeManagementSession(request, null)
    if (!session) return NextResponse.json({ ok: false, message: 'Admin or HR employee-management access is required.' }, { status: 403 })
    const existing = await getLocalPersonById(personId)
    if (!existing) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    const office = await getOfficeRecord(null, body.officeId)
    if (!office) return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 400 })
    const divisionError = validateDivision(body, office)
    if (divisionError) return NextResponse.json({ ok: false, message: divisionError }, { status: 400 })
    if (!sessionAllowsOffice(session, existing.officeId) || !sessionAllowsOffice(session, office.id)) return NextResponse.json({ ok: false, message: 'This session cannot update that employee.' }, { status: 403 })

    const updateResult = await updateLocalPersonProfile(personId, body, office, session)
    if (!updateResult) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    const lifecycleChanged = updateResult.existing.lifecycleStatus !== updateResult.nextPerson.lifecycleStatus
    const scheduleChanged = JSON.stringify(updateResult.existing.weeklySchedule || {}) !== JSON.stringify(updateResult.nextPerson.weeklySchedule || {})
      || JSON.stringify(updateResult.existing.flexitime || {}) !== JSON.stringify(updateResult.nextPerson.flexitime || {})
    const action = lifecycleChanged
      ? `person_lifecycle_${updateResult.nextPerson.lifecycleStatus}`
      : updateResult.officeChanged ? 'person_transfer' : 'person_update'
    await writeAuditLog(null, {
      actorRole: session.role, actorScope: session.scope, actorOfficeId: session.officeId, action,
      targetType: 'person', targetId: personId, officeId: office.id, summary: `Updated employee record for ${body.name}`,
      metadata: { employeeId: updateResult.existing.employeeId || '', officeName: office.name, lifecycleStatus: updateResult.nextPerson.lifecycleStatus },
    })
    if (scheduleChanged) {
      await writeAuditLog(null, {
        actorRole: session.role, actorScope: session.scope, actorOfficeId: session.officeId,
        action: 'workforce.update', targetType: 'workforce_employee_schedule', targetId: personId, officeId: office.id,
        summary: `Updated employee schedule and flexitime for ${body.name}`,
        metadata: {
          before: { weeklySchedule: updateResult.existing.weeklySchedule || {}, flexitime: updateResult.existing.flexitime || {} },
          after: { weeklySchedule: updateResult.nextPerson.weeklySchedule || {}, flexitime: updateResult.nextPerson.flexitime || {} },
        },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = Number(error?.status)
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to update employee.' }, { status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500 })
  }
}

export async function DELETE(request, { params }) {
  const originError = await createOriginGuard()(request)
  if (originError) return originError
  const { personId } = await params
  if (!personId) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  const { searchParams } = new URL(request.url)
  const hardDelete = searchParams.get('hard') === 'true'
  const confirmName = String(searchParams.get('confirm') || '').trim().toLowerCase()
  try {
    const session = await resolveEmployeeManagementSession(request, null)
    if (!session) return NextResponse.json({ ok: false, message: 'Admin or HR login with employee access is required.' }, { status: 401 })
    const person = await getLocalPersonById(personId)
    if (!person) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    if (!sessionAllowsOffice(session, person.officeId)) return NextResponse.json({ ok: false, message: 'This session cannot delete that employee.' }, { status: 403 })
    if (hardDelete && (!confirmName || confirmName !== String(person.name || '').trim().toLowerCase())) return NextResponse.json({ ok: false, message: 'Hard delete requires the exact employee name confirmation.' }, { status: 400 })

    const deleted = await deleteLocalPerson(personId, { hardDelete })
    const { deleteLocalEnrollmentPhoto } = await import('@/lib/postgres/photo-store')
    const photoDeleted = await deleteLocalEnrollmentPhoto(person)
    await writeAuditLog(null, {
      actorRole: session.role, actorScope: session.scope, actorOfficeId: session.officeId,
      action: hardDelete ? 'person_hard_delete' : 'person_delete', targetType: 'person', targetId: personId, officeId: person.officeId || '',
      summary: `${hardDelete ? 'Hard deleted' : 'Deleted'} employee record for ${person.name || personId}`,
      metadata: { employeeId: person.employeeId || '', officeName: person.officeName || '', ...(deleted?.counts || {}), photoDeleted },
    })
    return NextResponse.json({ ok: true, hardDeleted: hardDelete, deletedCounts: { ...(deleted?.counts || {}), photoDeleted } })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to delete employee.' }, { status: 500 })
  }
}
