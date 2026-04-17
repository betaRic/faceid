import { loadRepoEnv } from './lib/load-local-env.mjs'
import { getAdminDb } from './lib/firebase-admin-client.mjs'
import {
  closeRedisClient,
  countBiometricCacheKeys,
  createRedisClientFromEnv,
  warmBiometricIndexCache,
} from './lib/biometric-index-ops.mjs'

loadRepoEnv()

const db = getAdminDb()
const redis = await createRedisClientFromEnv({ required: true })
const officeSnapshot = await db.collection('offices').get()
const officeIds = officeSnapshot.docs.map(record => record.id).filter(Boolean)

try {
  const before = await countBiometricCacheKeys(redis)
  const warmed = await warmBiometricIndexCache(db, redis, officeIds)
  const after = await countBiometricCacheKeys(redis)

  console.log(JSON.stringify({
    ok: true,
    officeCount: officeIds.length,
    warmed,
    cacheBefore: {
      available: true,
      keyCount: before,
    },
    cacheAfter: {
      available: true,
      keyCount: after,
    },
    completedAt: new Date().toISOString(),
  }, null, 2))
} finally {
  await closeRedisClient(redis)
}
