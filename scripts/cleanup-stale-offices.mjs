import { loadRepoEnv } from './lib/load-local-env.mjs'
import { getAdminDb } from './lib/firebase-admin-client.mjs'

loadRepoEnv()

const SEEDED_OFFICE_IDS = new Set([
  'dilg-r12',
  'dilg-south-cotabato',
  'dilg-cotabato',
  'dilg-sultan-kudarat',
  'dilg-sarangani',
  'dilg-general-santos',
])

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const db = getAdminDb()
const snapshot = await db.collection('offices').get()

const kept = []
const toDelete = []

for (const doc of snapshot.docs) {
  const data = doc.data() || {}
  const summary = {
    id: doc.id,
    name: data.name || '(no name)',
    code: data.code || '',
    employeesField: Number(data.employees ?? 0),
  }
  if (SEEDED_OFFICE_IDS.has(doc.id)) {
    kept.push(summary)
  } else {
    toDelete.push(summary)
  }
}

if (toDelete.length === 0) {
  console.log(JSON.stringify({ ok: true, message: 'No stale offices found.', kept }, null, 2))
  process.exit(0)
}

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    kept,
    wouldDelete: toDelete,
    note: 'Re-run without --dry-run to actually delete.',
  }, null, 2))
  process.exit(0)
}

if (!force) {
  console.log(JSON.stringify({
    ok: false,
    message: 'Refusing to delete without --force flag. Run with --dry-run first to preview.',
    kept,
    wouldDelete: toDelete,
  }, null, 2))
  process.exit(1)
}

const deleted = []
const failed = []
for (const office of toDelete) {
  try {
    await db.collection('offices').doc(office.id).delete()
    deleted.push(office)
  } catch (error) {
    failed.push({ ...office, error: error?.message || String(error) })
  }
}

console.log(JSON.stringify({
  ok: failed.length === 0,
  kept,
  deleted,
  failed,
  note: 'Refresh the admin office page. The stale rows should be gone.',
}, null, 2))
