import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import {
  closePostgresPool,
  queryPostgres,
} from '../../lib/postgres/client.js'

after(async () => {
  await closePostgresPool()
})

test('pool shutdown permits a fresh usable PostgreSQL pool', async () => {
  const before = await queryPostgres(`
    SELECT current_database() AS name, pg_backend_pid() AS backend_pid
  `)

  assert.equal(before.rows[0]?.name, 'faceid_rc_local')
  await closePostgresPool()

  const afterClose = await queryPostgres(`
    SELECT current_database() AS name, pg_backend_pid() AS backend_pid
  `)

  assert.equal(afterClose.rows[0]?.name, 'faceid_rc_local')
  assert.notEqual(afterClose.rows[0]?.backend_pid, before.rows[0]?.backend_pid)
})
