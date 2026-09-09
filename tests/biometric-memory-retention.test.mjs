import test from 'node:test'
import assert from 'node:assert/strict'
import { startMemoryRetention } from '../lib/biometrics/memory-retention.js'

test('retention runs independently of collection and never overlaps', async () => {
  let callback, release, count = 0
  const stop = startMemoryRetention({
    purge: async () => { count++; await new Promise(resolve => { release = resolve }) },
    every: fn => { callback = fn; return { unref() {} } }, cancel: () => {}, onFailure: () => {},
  })
  assert.equal(count, 1)
  await callback()
  assert.equal(count, 1)
  release(); await new Promise(resolve => setImmediate(resolve))
  const next = callback(); assert.equal(count, 2); release(); await next
  stop()
})
