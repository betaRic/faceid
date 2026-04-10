import 'server-only'

import { normalizeOfficeRecord } from './offices'

/**
 * lib/office-directory.js
 * Office list cache — KV primary (5-min TTL, cross-instance), in-memory fallback.
 * Production: all instances share one KV entry — Firestore reads drop to near zero.
 * Dev (no KV): falls back to 60-second in-memory cache per instance.
 */

const KV_KEY = 'offices:list'
const KV_TTL_SECONDS = 5 * 60
const MEMORY_TTL_MS = 60 * 1000

let memCache = { expiresAt: 0, offices: null }

async function kvGet(key) {
  try {
    const { kv } = await import('@vercel/kv')
    return await kv.get(key)
  } catch {
    return null
  }
}

async function kvSet(key, value, ttlSeconds) {
  try {
    const { kv } = await import('@vercel/kv')
    await kv.set(key, value, { ex: ttlSeconds })
  } catch {}
}

async function kvDel(key) {
  try {
    const { kv } = await import('@vercel/kv')
    await kv.del(key)
  } catch {}
}

export async function listOfficeRecords(db, { forceRefresh = false } = {}) {
  // 1. Try KV (cross-instance, warm production instances)
  if (!forceRefresh) {
    const cached = await kvGet(KV_KEY)
    if (cached) {
      // Refresh in-memory too so next call in same instance is instant
      memCache = { offices: cached, expiresAt: Date.now() + MEMORY_TTL_MS }
      return cached
    }
  }

  // 2. Try in-memory (same instance, dev or KV miss)
  if (!forceRefresh && memCache.offices && memCache.expiresAt > Date.now()) {
    return memCache.offices
  }

  // 3. Fetch from Firestore
  const snapshot = await db.collection('offices').orderBy('name').get()
  const offices = snapshot.docs.map(record => normalizeOfficeRecord({ id: record.id, ...record.data() }))

  // Populate both caches
  await kvSet(KV_KEY, offices, KV_TTL_SECONDS)
  memCache = { offices, expiresAt: Date.now() + MEMORY_TTL_MS }

  return offices
}

export async function getOfficeRecord(db, officeId, options = {}) {
  if (!officeId) return null
  const offices = await listOfficeRecords(db, options)
  return offices.find(office => office.id === officeId) || null
}

/**
 * Call this whenever an office is created, updated, or deleted.
 * Invalidates KV immediately so next request sees fresh data.
 */
export async function clearOfficeRecordCache() {
  await kvDel(KV_KEY)
  memCache = { expiresAt: 0, offices: null }
}
