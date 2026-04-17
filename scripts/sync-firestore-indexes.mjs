import { loadRepoEnv } from './lib/load-local-env.mjs'
import { syncFirestoreIndexes, summarizeFirestoreIndexSync } from '../lib/firestore-index-admin.js'

loadRepoEnv()

const result = await syncFirestoreIndexes()

console.log(JSON.stringify({
  ...result,
  summary: summarizeFirestoreIndexSync(result),
  syncedAt: new Date().toISOString(),
}, null, 2))

if (!result.ok) {
  process.exit(1)
}
