import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeTestDatabaseUrl } from './test-database.mjs'

test('accepts only loopback faceid_rc databases', () => {
  const url = assertSafeTestDatabaseUrl('postgres://postgres@127.0.0.1:55432/faceid_rc_local')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.pathname, '/faceid_rc_local')
})

test('does not fall back to DATABASE_URL', () => {
  const originalTestUrl = process.env.FACEID_TEST_DATABASE_URL
  const originalDatabaseUrl = process.env.DATABASE_URL
  try {
    delete process.env.FACEID_TEST_DATABASE_URL
    process.env.DATABASE_URL = 'postgres://user@production.example/faceid_rc_production'
    assert.throws(() => assertSafeTestDatabaseUrl(), /FACEID_TEST_DATABASE_URL/)
  } finally {
    if (originalTestUrl === undefined) delete process.env.FACEID_TEST_DATABASE_URL
    else process.env.FACEID_TEST_DATABASE_URL = originalTestUrl
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
  }
})

for (const unsafe of [
  '',
  'postgres://postgres@db.example.com/faceid_rc_local',
  'postgres://postgres@127.0.0.1:55432/faceid',
  'postgres://user@example.site4now.net/faceid_rc_remote',
  'mysql://postgres@127.0.0.1:55432/faceid_rc_local',
  'postgres://postgres@127.0.0.1:55432/faceid_rc_a/other',
  'postgres://postgres@127.0.0.1:55432/faceid_rc_a%2Fb',
  'postgres://user@127.0.0.1/faceid_rc_safe?host=production.example',
]) {
  test(`rejects unsafe test URL ${unsafe || '<empty>'}`, () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl(unsafe),
      /FACEID_TEST_DATABASE_URL|loopback|faceid_rc_/,
    )
  })
}
