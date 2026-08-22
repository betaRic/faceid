import 'server-only'

import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import {
  employeeViewSessionMatchesPerson,
  resolveEmployeeViewSessionRequest,
} from '@/lib/employee-view-auth'
import {
  getHrSessionCookieName,
  hrSessionAllowsOffice,
  parseHrSessionCookieValue,
  resolveHrSession,
} from '@/lib/hr-auth'
import { getLocalPersonByEmployeeId } from '@/lib/postgres/attendance-store'
import { getLocalPersonById } from '@/lib/postgres/person-store'

function normalizeEmployeeId(value) {
  return String(value || '').trim()
}

const ATTENDANCE_VIEW_PERSON_FIELDS = [
  'name',
  'employeeId',
  'familyName',
  'firstName',
  'givenName',
  'lastName',
  'middleInitial',
  'middleName',
  'surname',
  'position',
  'officeId',
  'officeName',
  'divisionId',
  'divisionName',
  'active',
  'approvalStatus',
]

export function sessionAllowsOffice(resolvedSession, officeId) {
  if (resolvedSession?.role === 'admin') return adminSessionAllowsOffice(resolvedSession, officeId)
  if (resolvedSession?.role === 'hr') return hrSessionAllowsOffice(resolvedSession, officeId)
  return false
}

export function sessionCanManageEmployees(resolvedSession) {
  if (!resolvedSession?.active) return false
  const permissions = Array.isArray(resolvedSession.permissions) ? resolvedSession.permissions : []
  // Legacy local user records may not have a permissions array. Admin and HR
  // accounts are role-managed, so preserve their standard employee access.
  return permissions.includes('employees') || resolvedSession.role === 'admin' || resolvedSession.role === 'hr'
}

export function sessionCanViewAttendance(resolvedSession) {
  if (!resolvedSession?.active) return false
  const permissions = Array.isArray(resolvedSession.permissions) ? resolvedSession.permissions : []
  if (resolvedSession.role === 'admin') {
    return permissions.includes('summary') || permissions.includes('employees') || permissions.includes('dashboard')
  }
  if (resolvedSession.role === 'hr') {
    return permissions.length === 0 || permissions.includes('summary') || permissions.includes('employees') || permissions.includes('dtr')
  }
  return false
}

export async function resolveEmployeeManagementSession(request, db) {
  const adminSession = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (adminSession) {
    const resolvedAdminSession = await resolveAdminSession(db, adminSession)
    if (resolvedAdminSession?.active && sessionCanManageEmployees(resolvedAdminSession)) {
      return resolvedAdminSession
    }
  }

  const hrSession = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  if (hrSession) {
    const resolvedHrSession = await resolveHrSession(db, hrSession)
    if (resolvedHrSession?.active && sessionCanManageEmployees(resolvedHrSession)) {
      return resolvedHrSession
    }
  }

  return null
}

export async function resolveStaffAttendanceSession(request, db) {
  const adminSession = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (adminSession) {
    const resolvedAdminSession = await resolveAdminSession(db, adminSession)
    if (sessionCanViewAttendance(resolvedAdminSession)) return resolvedAdminSession
  }

  const hrSession = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  if (hrSession) {
    const resolvedHrSession = await resolveHrSession(db, hrSession)
    if (sessionCanViewAttendance(resolvedHrSession)) return resolvedHrSession
  }

  return null
}

export async function loadPersonByEmployeeId(db, employeeId) {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId)
  if (!normalizedEmployeeId) return null

  return getLocalPersonByEmployeeId(normalizedEmployeeId)
}

export async function loadPersonByPersonId(db, personId) {
  const normalizedPersonId = normalizeEmployeeId(personId)
  if (!normalizedPersonId || normalizedPersonId.includes('/')) return null

  return getLocalPersonById(normalizedPersonId)
}

export async function loadPersonByEmployeeIdentifier(db, employeeIdentifier) {
  return (
    await loadPersonByPersonId(db, employeeIdentifier)
    || await loadPersonByEmployeeId(db, employeeIdentifier)
  )
}

export async function resolveAttendanceViewer(request, db, employeeId) {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId)

  const staffSession = normalizedEmployeeId
    ? await resolveStaffAttendanceSession(request, db)
    : null
  if (staffSession) {
    const person = await loadPersonByEmployeeId(db, normalizedEmployeeId)
    if (!person) {
      return { viewer: null, person: null, status: 404, message: 'Employee record was not found.' }
    }
    if (!sessionAllowsOffice(staffSession, person.officeId)) {
      return { viewer: null, person, status: 403, message: 'This session cannot access that employee attendance.' }
    }
    return { viewer: staffSession, person, status: 200, message: '', source: 'staff' }
  }

  const employeeSession = await resolveEmployeeViewSessionRequest(request, db)

  if (employeeSession?.personId) {
    const person = await loadPersonByPersonId(db, employeeSession.personId)
    if (!person) {
      return { viewer: null, person: null, status: 404, message: 'Employee record was not found.' }
    }
    if (!employeeViewSessionMatchesPerson(employeeSession, person.id)) {
      return { viewer: null, person: null, status: 403, message: 'This session does not match the requested employee.' }
    }
    if (normalizedEmployeeId && normalizeEmployeeId(person.employeeId) !== normalizedEmployeeId) {
      return { viewer: null, person: null, status: 403, message: 'This session does not match the requested employee.' }
    }
    return { viewer: employeeSession, person, status: 200, message: '', source: 'employee' }
  }

  if (!normalizedEmployeeId) {
    return { viewer: null, person: null, status: 400, message: 'Employee identity is required.' }
  }

  return {
    viewer: null,
    person: null,
    status: 401,
    message: 'A valid admin, HR, or recent kiosk attendance session is required.',
  }
}
