import 'server-only'

import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import {
  employeeViewSessionMatchesEmployee,
  parseEmployeeViewSessionRequest,
} from '@/lib/employee-view-auth'
import {
  getHrSessionCookieName,
  hrSessionAllowsOffice,
  parseHrSessionCookieValue,
  resolveHrSession,
} from '@/lib/hr-auth'

function normalizeEmployeeId(value) {
  return String(value || '').trim()
}

export function sessionAllowsOffice(resolvedSession, officeId) {
  if (resolvedSession?.role === 'admin') return adminSessionAllowsOffice(resolvedSession, officeId)
  if (resolvedSession?.role === 'hr') return hrSessionAllowsOffice(resolvedSession, officeId)
  return false
}

export function sessionCanManageEmployees(resolvedSession) {
  return Array.isArray(resolvedSession?.permissions) && resolvedSession.permissions.includes('employees')
}

export function sessionCanViewAttendance(resolvedSession) {
  if (!resolvedSession?.active) return false
  const permissions = Array.isArray(resolvedSession.permissions) ? resolvedSession.permissions : []
  if (resolvedSession.role === 'admin') {
    return permissions.includes('summary') || permissions.includes('employees') || permissions.includes('dashboard')
  }
  if (resolvedSession.role === 'hr') {
    return permissions.includes('summary') || permissions.includes('employees') || permissions.includes('dtr')
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

  const snapshot = await db
    .collection('persons')
    .where('employeeId', '==', normalizedEmployeeId)
    .limit(1)
    .get()

  if (snapshot.empty) return null

  const record = snapshot.docs[0]
  return { id: record.id, ...record.data() }
}

export async function resolveAttendanceViewer(request, db, employeeId) {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId)
  if (!normalizedEmployeeId) {
    return { viewer: null, person: null, status: 400, message: 'Employee ID is required.' }
  }

  const staffSession = await resolveStaffAttendanceSession(request, db)
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

  const employeeSession = parseEmployeeViewSessionRequest(request)

  if (employeeViewSessionMatchesEmployee(employeeSession, normalizedEmployeeId)) {
    const person = await loadPersonByEmployeeId(db, normalizedEmployeeId)
    return { viewer: employeeSession, person, status: 200, message: '', source: 'employee' }
  }

  return {
    viewer: null,
    person: null,
    status: 401,
    message: 'A valid admin, HR, or recent kiosk attendance session is required.',
  }
}
