import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { buildSystemEvidence } from '../lib/maintenance/system-evidence.js'
import { REQUIRED_DATABASE_UPDATES } from '../lib/maintenance/required-database-updates.js'

const versions = (await readdir(new URL('../db/migrations/', import.meta.url))).filter(file => file.endsWith('.sql')).sort()
test('bundled requirements cover every source migration', () => {
  assert.deepEqual([...REQUIRED_DATABASE_UPDATES].sort(), versions)
})
async function report(applied, unavailable = false) {
  return buildSystemEvidence({
    query: async sql => {
      if (/FROM schema_migrations/.test(sql)) {
        if (unavailable) throw new Error('private database error')
        return { rows: applied.map(version => ({ version })) }
      }
      return { rows: [{}] }
    },
    access: async () => {},
    readFile: async () => 'test-build',
    readdir: async () => { throw new Error('SQL files are not deployed') },
  })
}

test('installed database stays healthy without deployed SQL files or historical seed sources', async () => {
  const result = await report([...versions, '0005_seed_dilg_r12_offices.sql'])
  assert.equal(result.migrations.status, 'healthy')
  assert.equal(result.actions.some(action => action.id === 'migrations'), false)
  assert.deepEqual(result.migrations.pending, [])
})

test('missing required update still produces a database update action', async () => {
  const result = await report(versions.slice(0, -1))
  assert.equal(result.migrations.status, 'failing')
  assert.deepEqual(result.migrations.pending, [versions.at(-1)])
  assert.equal(result.actions.find(action => action.id === 'migrations').title, 'Database update required')
})

test('unreadable installed history stays unknown rather than claiming up to date', async () => {
  const result = await report([], true)
  assert.equal(result.migrations.status, 'unknown')
  assert.equal(result.actions.find(action => action.id === 'migrations').title, 'Database update check unavailable')
  assert.doesNotMatch(JSON.stringify(result), /private database error/)
})
