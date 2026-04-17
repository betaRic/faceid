import { loadRepoEnv } from './lib/load-local-env.mjs'
import { getAdminDb } from './lib/firebase-admin-client.mjs'
import {
  closeRedisClient,
  createRedisClientFromEnv,
  syncPersonBiometricIndex,
} from './lib/biometric-index-ops.mjs'

loadRepoEnv()

const db = getAdminDb()
const redis = await createRedisClientFromEnv()
const snapshot = await db.collectionGroup('persons').get()

let synced = 0
let failed = 0
const failures = []

try {
  for (const record of snapshot.docs) {
    try {
      await syncPersonBiometricIndex(db, redis, record.id, record.data() || {})
      synced += 1
    } catch (error) {
      failed += 1
      failures.push({
        personId: record.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
} finally {
  await closeRedisClient(redis)
}

console.log(JSON.stringify({
  ok: failed === 0,
  scanned: snapshot.size,
  synced,
  failed,
  failures,
  completedAt: new Date().toISOString(),
}, null, 2))

if (failed > 0) {
  process.exit(1)
}
