import 'server-only'

import {
  getLocalHrCount,
  getLocalHrProfileByEmail,
  getLocalHrProfileById,
  listLocalHrProfiles,
} from './postgres/user-store'

export async function getHrProfileByEmail(_db, email) {
  return getLocalHrProfileByEmail(email)
}

export async function getHrProfileById(_db, hrUserId) {
  return getLocalHrProfileById(hrUserId)
}

export async function listHrProfiles(_db) {
  return listLocalHrProfiles()
}

export async function getHrCount(_db) {
  return getLocalHrCount()
}
