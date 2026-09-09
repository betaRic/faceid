import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizePhoneScanReport } from '../lib/scan-report-policy.js'
import { createScanFailureReporter } from '../lib/scan-failure-reporter.js'
import { createPhoneScanPost } from '../lib/routes/phone-scan-report.js'

const id = '12345678-1234-4234-8234-123456789abc'
const payload = () => ({ id, sessionId: id, reason: 'no_usable_face', stage: 'capture', elapsedMs: 300,
  metrics: { capturedFrames: 0, trackWidth: 1280 }, device: 'mobile', browser: 'Chrome' })

test('phone report allowlist drops secrets and rejects malformed evidence', () => {
  const result = sanitizePhoneScanReport({ ...payload(), accessCode: 'secret', photo: 'data:image/jpeg;base64,secret',
    metrics: { ...payload().metrics, descriptor: [1,2], trackHeight: Infinity }, employeeId: 'private' })
  assert.equal(result.metrics.trackWidth, 1280)
  assert.equal(result.metrics.trackHeight, undefined)
  assert.equal(JSON.stringify(result).includes('secret'), false)
  assert.equal(JSON.stringify(result).includes('private'), false)
  assert.equal(sanitizePhoneScanReport({ ...payload(), reason: 'free text' }), null)
  assert.equal(sanitizePhoneScanReport({ ...payload(), id: 'x' }), null)
})

test('reporter swallows failures, bounds pending work and reuses ID on retry', async () => {
  const bodies = [], timers = []
  const report = createScanFailureReporter({ createId: () => id, now: () => 10000,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => {},
    fetchImpl: async (_, options) => { bodies.push(JSON.parse(options.body)); throw new Error('offline') } })
  assert.equal(report(payload()), true)
  assert.equal(report(payload()), false)
  await new Promise(resolve => setImmediate(resolve))
  const retry = timers.find(timer => timer.ms === 2000)
  assert.ok(retry)
  retry.fn()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(bodies.length, 2)
  assert.equal(bodies[0].id, bodies[1].id)
})

test('endpoint refuses origin, oversized body and rate abuse without saving', async () => {
  let writes = 0
  const deps = { guard: async () => null, rate: async () => ({ ok: true }), save: async () => { writes++ } }
  const request = body => new Request('http://localhost/api/scan-reports', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body })
  assert.equal((await createPhoneScanPost({ ...deps, guard: async () => new Response(null, { status: 403 }) })(request('{}'))).status, 403)
  assert.equal((await createPhoneScanPost(deps)(request(' '.repeat(3000)))).status, 413)
  assert.equal((await createPhoneScanPost({ ...deps, rate: async () => ({ ok: false }) })(request(JSON.stringify(payload())))).status, 429)
  assert.equal(writes, 0)
  assert.equal((await createPhoneScanPost(deps)(request(JSON.stringify(payload())))).status, 202)
  assert.equal(writes, 1)
  assert.equal((await createPhoneScanPost({ ...deps, save: async () => { throw Error('private') } })(request(JSON.stringify(payload())))).status, 503)
})
