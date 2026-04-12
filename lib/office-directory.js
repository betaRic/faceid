import 'server-only'
import { normalizeOfficeRecord } from './offices'
import { kvGet, kvSet, kvDel } from './kv-utils'

const KV_KEY = 'offices:list'
const KV_TTL_SECONDS = 5 * 60

const FIRESTORE_TIMEOUT_MS = 8000

function withFirestoreTimeout(promise, label = 'Firestore query') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${FIRESTORE_TIMEOUT_MS}ms`)),
        FIRESTORE_TIMEOUT_MS,
      ),
    ),
  ])
}

export async function listOfficeRecords(db, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await kvGet(KV_KEY)
    if (cached) return cached
  }

  const snapshot = await withFirestoreTimeout(
    db.collection('offices').orderBy('name').get(),
    'offices.orderBy(name).get()',
  )

  const offices = snapshot.docs.map(record =>
    normalizeOfficeRecord({ id: record.id, ...record.data() }),
  )

  // Fire-and-forget cache write — don't block on it
  kvSet(KV_KEY, offices, { ex: KV_TTL_SECONDS }).catch(() => {})

  return offices
}

export async function clearOfficeRecordCache() {
  await kvDel(KV_KEY)
}

/**
 * Fetch a single office record by ID.
 * Guards against empty/invalid officeId before touching Firestore.
 */
export async function getOfficeRecord(db, officeId) {
  if (!officeId || typeof officeId !== 'string' || !officeId.trim()) return null

  const snapshot = await withFirestoreTimeout(
    db.collection('offices').doc(officeId.trim()).get(),
    `offices/${officeId}.get()`,
  )

  if (!snapshot.exists) return null
  return normalizeOfficeRecord({ id: snapshot.id, ...snapshot.data() })
}
