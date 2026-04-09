import 'server-only'

import { normalizeOfficeRecord } from './offices'

const OFFICE_CACHE_TTL_MS = 60 * 1000

let officeCache = {
  expiresAt: 0,
  offices: null,
}

export async function listOfficeRecords(db, { forceRefresh = false } = {}) {
  const now = Date.now()

  if (!forceRefresh && officeCache.offices && officeCache.expiresAt > now) {
    return officeCache.offices
  }

  const snapshot = await db.collection('offices').orderBy('name').get()
  const offices = snapshot.docs.map(record => normalizeOfficeRecord({ id: record.id, ...record.data() }))

  officeCache = {
    offices,
    expiresAt: now + OFFICE_CACHE_TTL_MS,
  }

  return offices
}

export async function getOfficeRecord(db, officeId, options = {}) {
  if (!officeId) return null

  const offices = await listOfficeRecords(db, options)
  return offices.find(office => office.id === officeId) || null
}

export function clearOfficeRecordCache() {
  officeCache = {
    expiresAt: 0,
    offices: null,
  }
}
