import 'server-only'
import { normalizeOfficeRecord } from './offices'
import {
  getLocalOfficeEmployeeCounts,
  getLocalOfficeRecord,
  listLocalOfficeRecords,
} from './postgres/attendance-store'

const OFFICE_CACHE_TTL_MS = 30_000
const OFFICE_COUNTS_CACHE_TTL_MS = 15_000

let officeCache = null
let officeCacheAt = 0
let officeLoadPromise = null
const officeCountsCache = new Map()

function isTransientConnectionError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('connection timeout')
    || message.includes('connection terminated')
    || message.includes('connect etimedout')
    || message.includes('econnreset')
}

async function retryOfficeRead(load) {
  try {
    return await load()
  } catch (error) {
    if (!isTransientConnectionError(error)) throw error
    await new Promise(resolve => setTimeout(resolve, 180))
    return load()
  }
}

export async function listOfficeRecords(db, { forceRefresh = false } = {}) {
  const now = Date.now()
  if (!forceRefresh && officeCache && now - officeCacheAt < OFFICE_CACHE_TTL_MS) return officeCache
  if (officeLoadPromise) return officeLoadPromise

  officeLoadPromise = retryOfficeRead(() => listLocalOfficeRecords())
    .then(records => {
      officeCache = records
      officeCacheAt = Date.now()
      return records
    })
    .finally(() => {
      officeLoadPromise = null
    })
  return officeLoadPromise
}

export async function clearOfficeRecordCache() {
  officeCache = null
  officeCacheAt = 0
  officeLoadPromise = null
}

export async function clearOfficeEmployeeCountsCache() {
  officeCountsCache.clear()
}

export async function getOfficeEmployeeCounts(db, officeIds, { forceRefresh = false } = {}) {
  const ids = Array.from(new Set((officeIds || []).filter(Boolean)))
  if (ids.length === 0) return {}
  const key = ids.slice().sort().join('|')
  const cached = officeCountsCache.get(key)
  if (!forceRefresh && cached && Date.now() - cached.at < OFFICE_COUNTS_CACHE_TTL_MS) return cached.value
  const value = await retryOfficeRead(() => getLocalOfficeEmployeeCounts(ids))
  officeCountsCache.set(key, { value, at: Date.now() })
  return value
}

export async function getOfficeRecord(db, officeId) {
  if (!officeId || typeof officeId !== 'string' || !officeId.trim()) return null
  return getLocalOfficeRecord(officeId)
}
