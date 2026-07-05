import 'server-only'

import { kvGet, kvSet } from './kv-utils'
import { postgresEnabled } from './postgres/client'
import {
  getLocalHrCount,
  getLocalHrProfileByEmail,
  getLocalHrProfileById,
  listLocalHrProfiles,
} from './postgres/user-store'

const HR_COLLECTION = 'hr_users'
const CACHE_TTL_SECONDS = 60

export async function getHrProfileByEmail(db, email) {
  if (postgresEnabled()) return getLocalHrProfileByEmail(email)

  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null

  const snapshots = await db
    .collection(HR_COLLECTION)
    .where('email', '==', normalizedEmail)
    .limit(2)
    .get()

  if (snapshots.empty) return null
  if (snapshots.size > 1) {
    console.warn(`[HrDirectory] Multiple HR profiles found for email: ${normalizedEmail}`)
  }

  const doc = snapshots.docs[0]
  const data = doc.data()
  return {
    id: doc.id,
    email: data.email || '',
    displayName: data.displayName || '',
    scope: data.scope || 'office',
    officeId: data.officeId || '',
    role: 'hr',
    active: data.active !== false,
  }
}

export async function getHrProfileById(db, hrUserId) {
  if (postgresEnabled()) return getLocalHrProfileById(hrUserId)

  if (!hrUserId) return null

  const doc = await db.collection(HR_COLLECTION).doc(hrUserId).get()
  if (!doc.exists) return null

  const data = doc.data()
  return {
    id: doc.id,
    email: data.email || '',
    displayName: data.displayName || '',
    scope: data.scope || 'office',
    officeId: data.officeId || '',
    role: 'hr',
    active: data.active !== false,
  }
}

export async function listHrProfiles(db) {
  if (postgresEnabled()) return listLocalHrProfiles()

  const snapshot = await db.collection(HR_COLLECTION).orderBy('displayName', 'asc').get()

  return snapshot.docs.map(doc => {
    const data = doc.data()
    return {
      id: doc.id,
      email: data.email || '',
      displayName: data.displayName || '',
      scope: data.scope || 'office',
      officeId: data.officeId || '',
      role: 'hr',
      active: data.active !== false,
    }
  })
}

export async function getHrCount(db) {
  if (postgresEnabled()) return getLocalHrCount()

  const snapshot = await db.collection(HR_COLLECTION).count().get()
  return snapshot.data().count || 0
}
