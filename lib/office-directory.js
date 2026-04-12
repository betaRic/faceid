import 'server-only'
import { normalizeOfficeRecord } from './offices'

const KV_KEY = 'offices:list'
const KV_TTL_SECONDS = 5 * 60
let kvClient = null

async function getKvClient() {
  if (kvClient) return kvClient

  const redisUrl = process.env.REDIS_URL
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN

  if (redisUrl) {
    const { Redis } = await import('@upstash/redis')
    kvClient = new Redis({ url: redisUrl, token: 'dummy' })
    return kvClient
  }

  if (kvUrl && kvToken) {
    const { Redis } = await import('@upstash/redis')
    kvClient = new Redis({ url: kvUrl, token: kvToken })
    return kvClient
  }

  return null
}

export async function listOfficeRecords(db, { forceRefresh = false } = {}) {
  const kv = await getKvClient()
  
  if (!forceRefresh && kv) {
    try {
      const cached = await kv.get(KV_KEY)
      if (cached) return cached
    } catch {}
  }

  const snapshot = await db.collection('offices').orderBy('name').get()
  const offices = snapshot.docs.map(record =>
    normalizeOfficeRecord({ id: record.id, ...record.data() }),
  )

  if (kv) {
    try {
      await kv.set(KV_KEY, offices, { ex: KV_TTL_SECONDS })
    } catch {}
  }

  return offices
}

export async function clearOfficeRecordCache() {
  const kv = await getKvClient()
  if (kv) {
    try {
      await kv.del(KV_KEY)
    } catch {}
  }
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
