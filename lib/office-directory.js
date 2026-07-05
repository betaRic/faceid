import 'server-only'
import { normalizeOfficeRecord } from './offices'
import {
  getLocalOfficeEmployeeCounts,
  getLocalOfficeRecord,
  listLocalOfficeRecords,
} from './postgres/attendance-store'

export async function listOfficeRecords(db, { forceRefresh = false } = {}) {
  return listLocalOfficeRecords()
}

export async function clearOfficeRecordCache() {
}

export async function clearOfficeEmployeeCountsCache() {
}

export async function getOfficeEmployeeCounts(db, officeIds, { forceRefresh = false } = {}) {
  const ids = Array.from(new Set((officeIds || []).filter(Boolean)))
  if (ids.length === 0) return {}
  return getLocalOfficeEmployeeCounts(ids)
}

export async function getOfficeRecord(db, officeId) {
  if (!officeId || typeof officeId !== 'string' || !officeId.trim()) return null
  return getLocalOfficeRecord(officeId)
}
