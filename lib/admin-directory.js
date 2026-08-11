import 'server-only'
import {
  getLocalActiveRegionalAdminCount,
  getLocalAdminCount,
  getLocalAdminProfileByEmail,
  listLocalAdminProfiles,
} from './postgres/user-store'

function getDefaultPermissions(scope) {
  if (scope === 'regional') {
    return ['dashboard', 'office', 'employees', 'summary', 'roles']
  }
  return ['dashboard', 'office', 'employees', 'summary']
}

export async function getAdminProfileByEmail(_db, email) {
  return getLocalAdminProfileByEmail(email)
}

export async function listAdminProfiles(_db) {
  return listLocalAdminProfiles()
}

export async function getAdminCount(_db) {
  return getLocalAdminCount()
}

export async function getActiveRegionalAdminCount(_db, excludeId = '') {
  return getLocalActiveRegionalAdminCount(excludeId)
}
