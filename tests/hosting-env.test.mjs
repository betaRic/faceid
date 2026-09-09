import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { assessHostingEnvironment } from '../scripts/lib/hosting-env-policy.mjs'

test('allows ignored development files but blocks every implicitly loaded settings file', () => {
  assert.deepEqual(assessHostingEnvironment({ files: ['.env.development.local', '.env.example'], env: {}, settingNames: [] }), [])
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    assert.ok(assessHostingEnvironment({ files: [file], env: {}, settingNames: [] }).some(message => message.includes(file)))
  }
})
test('rejects inherited app settings without revealing their values', () => {
  const issues = assessHostingEnvironment({ files: [], env: { DATABASE_URL: 'private-secret', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', FACEID_TEST_DATABASE_URL: 'private-test', NODE_ENV: 'development' }, settingNames: ['DATABASE_URL'] })
  assert.equal(issues.length, 4)
  assert.equal(issues.join(' ').includes('private'), false)
  assert.equal(issues.join(' ').includes('localhost'), false)
  assert.deepEqual(assessHostingEnvironment({ files: [], env: { NODE_ENV: 'production', PATH: 'normal' }, settingNames: [] }), [])
})

test('hosting command guards before cleanup and CLI rejects injected settings without exposing them', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(pkg.scripts['build:hosting'].startsWith('node scripts/check-hosting-env.mjs && '))
  const result = spawnSync(process.execPath, ['scripts/check-hosting-env.mjs'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'do-not-print-this-fixture' },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DATABASE_URL/)
  assert.equal((result.stdout + result.stderr).includes('do-not-print-this-fixture'), false)
})
