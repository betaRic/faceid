export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auditActorFromSession, writeAuditLog } from '@/lib/audit-log'
import { getOfficeRecord } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import {
  deactivateLocalPerson,
  getLocalPersonById,
  hardDeleteLocalPerson,
  transitionLocalPersonLifecycle,
  updateLocalPersonProfile,
} from '@/lib/postgres/person-store'
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
  const rawBody = await request.json().catch(() => null)

  try {
    const session = await resolveEmployeeManagementSession(request, null)
    if (!session) return NextResponse.json({ ok: false, message: 'Admin or HR employee-management access is required.' }, { status: 403 })
    const existing = await getLocalPersonById(personId)
    if (!existing) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })

    if (rawBody?.command) {
      if (rawBody.command !== 'transitionLifecycle') {
        return NextResponse.json({ ok: false, message: 'Employee command is not valid.' }, { status: 400 })
      }
      if (!sessionAllowsOffice(session, existing.officeId)) {
        return NextResponse.json({ ok: false, message: 'This session cannot update that employee.' }, { status: 403 })
      }
      const transitionResult = await transitionLocalPersonLifecycle(personId, {
        lifecycleStatus: rawBody.lifecycleStatus,
        reason: rawBody.reason,
      }, session)
      if (!transitionResult) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
      return NextResponse.json({
        ok: true,
        person: {
          id: transitionResult.nextPerson.id,
          lifecycleStatus: transitionResult.nextPerson.lifecycleStatus,
          active: transitionResult.nextPerson.active,
          approvalStatus: transitionResult.nextPerson.approvalStatus,
        },
      })
    }

    const body = normalizeBody(rawBody)
    const validation = validateBody(body)
    if (validation) return NextResponse.json({ ok: false, message: validation }, { status: 400 })
    const office = await getOfficeRecord(null, body.officeId)
    if (!office) return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 400 })
    const divisionError = validateDivision(body, office)
    if (divisionError) return NextResponse.json({ ok: false, message: divisionError }, { status: 400 })
    if (!sessionAllowsOffice(session, existing.officeId) || !sessionAllowsOffice(session, office.id)) return NextResponse.json({ ok: false, message: 'This session cannot update that employee.' }, { status: 403 })

    const updateResult = await updateLocalPersonProfile(personId, body, office, session)
    if (!updateResult) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    const scheduleChanged = JSON.stringify(updateResult.existing.weeklySchedule || {}) !== JSON.stringify(updateResult.nextPerson.weeklySchedule || {})
      || JSON.stringify(updateResult.existing.flexitime || {}) !== JSON.stringify(updateResult.nextPerson.flexitime || {})
    const action = updateResult.officeChanged ? 'person_transfer' : 'person_update'
    await writeAuditLog(null, {
      actorRole: session.role, actorScope: session.scope, actorOfficeId: session.officeId, ...auditActorFromSession(session), action,
      targetType: 'person', targetId: personId, officeId: office.id, summary: `Updated employee record for ${body.name}`,
      metadata: { employeeId: updateResult.existing.employeeId || '', officeName: office.name, lifecycleStatus: updateResult.nextPerson.lifecycleStatus },
    })
    if (scheduleChanged) {
      await writeAuditLog(null, {
        actorRole: session.role, actorScope: session.scope, actorOfficeId: session.officeId, ...auditActorFromSession(session),
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
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 499 ? status : 500
    const message = safeStatus === 500 ? 'Failed to update employee.' : error.message
    return NextResponse.json({ ok: false, message }, { status: safeStatus })
  }
}

export async function DELETE(request, { params }) {
  const originError = await createOriginGuard()(request)
  if (originError) return originError
  const { personId } = await params
  if (!personId) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  const body = await request.json().catch(() => ({}))
  const command = String(body?.command || '').trim()
  try {
    const session = await resolveEmployeeManagementSession(request, null)
    if (!session) return NextResponse.json({ ok: false, message: 'Admin or HR login with employee access is required.' }, { status: 401 })

    if (command && command !== 'hardDelete') {
      return NextResponse.json({ ok: false, message: 'Employee deletion command is not valid.' }, { status: 400 })
    }

    if (command === 'hardDelete') {
      if (session.role !== 'admin' || session.scope !== 'regional') {
        return NextResponse.json({ ok: false, message: 'Regional Admin access is required for hard deletion.' }, { status: 403 })
      }
      const { processEnrollmentPhotoDeletionJobs } = await import('@/lib/postgres/photo-store')
      const person = await getLocalPersonById(personId)
      if (!person) {
        const cleanup = await processEnrollmentPhotoDeletionJobs({ personId })
        if (cleanup.attempted === 0 && cleanup.pending === 0) {
          return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
        }
        const completed = cleanup.pending === 0
        return NextResponse.json({
          ok: true,
          completed,
          deactivated: false,
          hardDeleted: true,
          photoCleanupPending: !completed,
          cleanup,
          message: completed
            ? 'Employee data and queued enrollment photo were removed.'
            : 'Employee data was removed, but secure photo cleanup is still pending. Retry this request.',
        }, { status: completed ? 200 : 202 })
      }
      if (!sessionAllowsOffice(session, person.officeId)) {
        return NextResponse.json({ ok: false, message: 'This session cannot delete that employee.' }, { status: 403 })
      }
      const deleted = await hardDeleteLocalPerson(personId, session, body?.confirmation)
      if (!deleted) {
        return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
      }
      const cleanup = await processEnrollmentPhotoDeletionJobs({ personId }).catch(error => {
        console.error('[PersonDelete] Queued photo cleanup failed', { code: error?.code || 'unknown' })
        return { attempted: 0, completed: 0, failed: 1, pending: deleted.photoPath ? 1 : 0 }
      })
      if (cleanup.pending > 0) {
        return NextResponse.json({
          ok: true,
          completed: false,
          deactivated: false,
          hardDeleted: true,
          photoCleanupPending: true,
          cleanup,
          message: 'Employee data was removed, but secure photo cleanup is still pending. Retry this request.',
        }, { status: 202 })
      }
      return NextResponse.json({
        ok: true,
        completed: true,
        deactivated: false,
        hardDeleted: true,
        deletedCounts: { ...(deleted.counts || {}), photoDeleted: cleanup.completed > 0 },
      })
    }

    const person = await getLocalPersonById(personId)
    if (!person) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    if (!sessionAllowsOffice(session, person.officeId)) return NextResponse.json({ ok: false, message: 'This session cannot delete that employee.' }, { status: 403 })

    const deactivated = await deactivateLocalPerson(personId, session)
    if (!deactivated) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    return NextResponse.json({
      ok: true,
      deactivated: true,
      hardDeleted: false,
      person: {
        id: deactivated.nextPerson.id,
        lifecycleStatus: deactivated.nextPerson.lifecycleStatus,
        active: deactivated.nextPerson.active,
        approvalStatus: deactivated.nextPerson.approvalStatus,
      },
    })
  } catch (error) {
    const status = Number(error?.status)
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 499 ? status : 500
    return NextResponse.json({
      ok: false,
      code: safeStatus === 500 ? 'employee_delete_failed' : (error?.code || 'employee_delete_rejected'),
      message: safeStatus === 500 ? 'Failed to update employee status.' : error.message,
    }, { status: safeStatus })
  }
}
