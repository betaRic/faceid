import test from 'node:test'
import assert from 'node:assert/strict'
import { staffSessionCookieOptions } from '../lib/staff-session-cookie.js'

test('staff session cookie options are secure and bounded', () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    assert.deepEqual(staffSessionCookieOptions({ maxAge: 28_800 }), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 28_800,
    })
    assert.equal(staffSessionCookieOptions({ maxAge: 0 }).maxAge, 0)
    assert.throws(() => staffSessionCookieOptions({ maxAge: -1 }), /maxAge/)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
})
