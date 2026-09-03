import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SafeRequestError,
  serverErrorResponse,
} from '../lib/http/server-error.js'

test('unexpected server errors return tracking ID without internal text', async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const response = serverErrorResponse(
      new Error('postgres://private-user:private-password@private-host/database'),
      { context: 'test', publicMessage: 'Request could not be completed.' },
    )
    const payload = await response.json()
    assert.equal(response.status, 500)
    assert.equal(payload.message, `Request could not be completed. Reference: ${payload.errorId}`)
    assert.match(payload.errorId, /^[0-9a-f-]{36}$/i)
    assert.doesNotMatch(JSON.stringify(payload), /private-user|private-password|private-host/i)
  } finally {
    console.error = originalError
  }
})

test('declared request errors keep only their approved public message', async () => {
  const response = serverErrorResponse(
    new SafeRequestError('Choose a valid holiday year.', { status: 400, code: 'invalid_holiday_year' }),
    { context: 'test' },
  )
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    ok: false,
    code: 'invalid_holiday_year',
    message: 'Choose a valid holiday year.',
  })
})
