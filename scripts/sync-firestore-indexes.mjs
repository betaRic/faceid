import { summarizeFirestoreIndexSync, syncFirestoreIndexes } from '../lib/firestore-index-admin.js'

async function main() {
  const summary = await syncFirestoreIndexes()
  console.log(summarizeFirestoreIndexSync(summary))
  console.log(JSON.stringify(summary, null, 2))

  if (!summary.ok) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error)
  process.exit(1)
})
