import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeTestDatabaseUrl } from './test-database.mjs'

test('accepts only loopback faceid_rc databases', () => {
  const url = assertSafeTestDatabaseUrl('postgres://postgres@127.0.0.1:55432/faceid_rc_local')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.pathname, '/faceid_rc_local')
})

for (const unsafe of [
  '',
  'postgres://postgres@db.example.com/faceid_rc_local',
  'postgres://postgres@127.0.0.1:55432/faceid',
  'postgres://user@example.site4now.net/faceid_rc_remote',
]) {
  test(`rejects unsafe test URL ${unsafe || '<empty>'}`, () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl(unsafe),
      /FACEID_TEST_DATABASE_URL|loopback|faceid_rc_/,
    )
  })
}
