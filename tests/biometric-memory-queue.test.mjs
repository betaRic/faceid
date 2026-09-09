import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleMemoryCollection } from '../lib/biometrics/memory-queue.js'

const candidate = () => ({ attendanceId: 'a', personId: 'p', originalAccepted: true, fieldDutyPending: false,
  frames: [{ descriptor: Array(1024).fill(0) }, { descriptor: Array(1024).fill(0) }] })

test('disabled memory does no work and pending or adaptive-only attendance cannot teach', () => {
  let scheduled = 0
  const schedule = () => scheduled++
  scheduleMemoryCollection(candidate(), { enabled: false, schedule })
  scheduleMemoryCollection({ ...candidate(), fieldDutyPending: true }, { enabled: true, schedule })
  scheduleMemoryCollection({ ...candidate(), originalAccepted: false }, { enabled: true, schedule })
  assert.equal(scheduled, 0)
})
test('collection runs after scheduling and failure cannot escape into attendance', async () => {
  let job, calls = 0, failures = 0
  assert.equal(scheduleMemoryCollection(candidate(), { enabled: true, schedule: fn => { job = fn },
    collect: async () => { calls++; throw new Error('private database detail') }, onFailure: () => failures++ }), true)
  assert.equal(calls, 0)
  await job()
  assert.equal(calls, 1)
  assert.equal(failures, 1)
  assert.doesNotThrow(() => scheduleMemoryCollection(candidate(), { enabled: true, schedule: () => { throw new Error('no request context') } }))
})
