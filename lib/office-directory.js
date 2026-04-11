import 'server-only'
import { normalizeOfficeRecord } from './offices'

const KV_KEY = 'offices:list'
const KV_TTL_SECONDS = 5 * 60

export async function listOfficeRecords(db, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    try {
      const { kv } = await import('@vercel/kv')
      const cached = await kv.get(KV_KEY)
      if (cached) return cached
    } catch {}
  }

  const snapshot = await db.collection('offices').orderBy('name').get()
  const offices = snapshot.docs.map(record =>
    normalizeOfficeRecord({ id: record.id, ...record.data() }),
  )

  try {
    const { kv } = await import('@vercel/kv')
    await kv.set(KV_KEY, offices, { ex: KV_TTL_SECONDS })
  } catch {}

  return offices
}

export async function clearOfficeRecordCache() {
  try {
    const { kv } = await import('@vercel/kv')
    await kv.del(KV_KEY)
  } catch {}
}

/**
 * Fetch a single office record by ID.
 * Guards against empty/invalid officeId before touching Firestore —
 * prevents the "documentPath must be a non-empty string" crash.
 */
export async function getOfficeRecord(db, officeId) {
  if (!officeId || typeof officeId !== 'string' || !officeId.trim()) return null

  const snapshot = await db.collection('offices').doc(officeId.trim()).get()
  if (!snapshot.exists) return null
  return normalizeOfficeRecord({ id: snapshot.id, ...snapshot.data() })
}
