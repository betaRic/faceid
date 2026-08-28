import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { strFromU8, unzipSync } from 'fflate'
import sharp from 'sharp'
import { normalizeDataImage } from '../../lib/images/safe-data-image.js'
import { createPersonsPostHandler } from '../../lib/routes/persons-route.js'
import { closePostgresPool, getPostgresPool, queryPostgres } from '../../lib/postgres/client.js'
import { enrollLocalPerson, getLocalPersonById, refreshLocalPersonBiometrics } from '../../lib/postgres/person-store.js'
import { issueAttendanceChallenge } from '../../lib/attendance-challenge.js'
import {
  getLocalFileStorageRoot,
  saveNormalizedEnrollmentPhoto,
} from '../../lib/postgres/photo-store.js'
import { sameOriginRequest } from './route-request.mjs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
} from '../../lib/admin-auth.js'
import {
  createEmployeeViewSessionCookieValue,
  parseEmployeeViewSessionCookieValue,
} from '../../lib/employee-view-auth.js'
import {
  createHrSessionCookieValue,
  getHrSessionCookieName,
  parseHrSessionCookieValue,
} from '../../lib/hr-auth.js'
import { hashLocalPin } from '../../lib/postgres/user-store.js'
import { POST as login } from '../../app/api/login/route.js'
import {
  GET as getRegionalPinControl,
  POST as updateRegionalPinControl,
} from '../../app/api/admin/regional-pin/route.js'
import {
  GET as getGlobalThresholds,
  POST as updateGlobalThresholds,
} from '../../app/api/admin/thresholds/route.js'
import { GET as getMaintenanceEvidence } from '../../app/api/admin/biometric-benchmark/route.js'
import { GET as getReenrollmentCandidates } from '../../app/api/admin/reenrollment-candidates/route.js'
import { GET as getHealth } from '../../app/api/health/route.js'
import {
  DEFAULTS as THRESHOLD_DEFAULTS,
  getActiveThresholdsForUpdate,
} from '../../lib/thresholds.js'
import { isRegionalPinEnabled } from '../../lib/bootstrap-pin.js'
import { GET as getPersons } from '../../app/api/persons/route.js'
import {
  DELETE as deletePerson,
  PUT as updatePerson,
} from '../../app/api/persons/[personId]/route.js'
import {
  createPersonReenrollHandler,
  POST as reenrollPerson,
} from '../../app/api/persons/[personId]/reenroll/route.js'
import { GET as getAttendanceTable } from '../../app/api/attendance/table/route.js'
import { GET as getAttendanceDtr } from '../../app/api/attendance/dtr/route.js'
import {
  POST as createAttendanceCorrection,
} from '../../app/api/admin/attendance/route.js'
import {
  DELETE as deleteAttendanceCorrection,
} from '../../app/api/admin/attendance/[attendanceId]/route.js'
import { GET as rebuildDailySummary } from '../../app/api/cron/rebuild-daily-summary/route.js'
import { formatAttendanceDateKey } from '../../lib/attendance-time.js'
import { createAttendanceV2PostHandler } from '../../app/api/attendance/v2/route.js'
import { consumePostgresRateLimit, hashRateLimitKey } from '../../lib/postgres/rate-limit-store.js'
import { enforceRateLimit, getRequestIp } from '../../lib/rate-limit.js'
import {
  GET as getHrOfficeSettings,
  PUT as updateHrOfficeSettings,
} from '../../app/api/hr/office-settings/route.js'

const office = {
  id: 'office-route-test',
  name: 'Route Test Field Office',
  officeType: 'Field Office',
  divisions: [],
}
const otherOffice = {
  id: 'office-route-test-other',
  name: 'Other Route Test Office',
  officeType: 'Field Office',
  divisions: [],
}
let registrationSequence = 0

before(async () => {
  process.env.ADMIN_SESSION_SECRET = 'route-test-admin-session-secret'
  process.env.EMPLOYEE_VIEW_SESSION_SECRET = 'route-test-employee-session-secret'
  process.env.HR_SESSION_SECRET = 'route-test-hr-session-secret'
  process.env.LOCAL_PIN_SALT = 'route-test-local-pin-salt'
  await queryPostgres(`
    INSERT INTO offices (
      id, name, name_lower, office_type, latitude, longitude, radius_meters, divisions
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
  `, [office.id, office.name, office.name.toLowerCase(), office.officeType, 6.1164, 125.1716, 500, '[]'])
  await queryPostgres(`
    INSERT INTO offices (
      id, name, name_lower, office_type, latitude, longitude, radius_meters, work_policy, divisions, data
    )
    VALUES ($1, $2, $3, $4, 7.1, 126.2, 750, $5::jsonb, '[]'::jsonb, $6::jsonb)
  `, [
    otherOffice.id,
    otherOffice.name,
    otherOffice.name.toLowerCase(),
    otherOffice.officeType,
    JSON.stringify({ schedule: 'Other policy', workingDays: [1, 2, 3, 4, 5] }),
    JSON.stringify({ ...otherOffice, location: 'Secret other location', wifiSsid: ['SECRET-OTHER-WIFI'] }),
  ])
  await queryPostgres(`
    INSERT INTO admin_users (
      id, email, email_lower, name, role, scope, office_id, active, data
    ) VALUES ($1, $2, $2, $3, 'admin', 'regional', '', true, $4::jsonb)
  `, [
    'route-test-admin',
    'route-test-admin@example.test',
    'Route Test Admin',
    JSON.stringify({ permissions: ['employees'] }),
  ])
  await queryPostgres(`
    INSERT INTO admin_users (
      id, email, email_lower, name, role, scope, office_id, active, data
    ) VALUES ($1, $2, $2, $3, 'admin', 'office', $4, true, $5::jsonb)
  `, [
    'route-test-office-admin',
    'route-test-office-admin@example.test',
    'Route Test Office Admin',
    office.id,
    JSON.stringify({ permissions: ['employees'] }),
  ])
  await queryPostgres(`
    INSERT INTO hr_users (
      id, email, email_lower, name, display_name, scope, office_id, active, data
    ) VALUES
      ('route-test-office-hr', 'route-test-office-hr@example.test', 'route-test-office-hr@example.test', 'Route Test Office HR', 'Route Test Office HR', 'office', $1, true, $2::jsonb),
      ('route-test-regional-hr', 'route-test-regional-hr@example.test', 'route-test-regional-hr@example.test', 'Route Test Regional HR', 'Route Test Regional HR', 'regional', '', true, $2::jsonb)
  `, [office.id, JSON.stringify({ permissions: ['employees', 'summary', 'dtr'] })])
  await queryPostgres(
    'UPDATE admin_users SET pin_hash = $1 WHERE id = $2',
    [hashLocalPin('7351'), 'route-test-admin'],
  )
  await queryPostgres(
    'UPDATE hr_users SET pin_hash = $1 WHERE id = $2',
    [hashLocalPin('8462'), 'route-test-office-hr'],
  )
})

after(async () => {
  await closePostgresPool()
})

async function pngDataUrl({ width = 2, height = 2 } = {}) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 80, b: 140, alpha: 1 },
    },
  }).png().toBuffer()
  return `data:image/png;base64,${buffer.toString('base64')}`
}

function registrationFixture({
  employeeId,
  lastName = 'Route',
  photoDataUrl,
} = {}) {
  const fixtureIndex = registrationSequence++
  const resolvedEmployeeId = employeeId === undefined ? String(700000 + fixtureIndex) : employeeId
  const phaseIds = ['center', 'center', 'side_a', 'side_a', 'side_b', 'side_b', 'chin_down', 'chin_down']
  return {
    profile: {
      employeeId: resolvedEmployeeId,
      lastName,
      firstName: 'Test',
      middleName: '',
      position: 'Tester',
      officeId: office.id,
      officeName: office.name,
      divisionId: '',
      photoDataUrl,
      privacyConsent: true,
      privacyNoticeVersion: '2026-07-28',
      captureMetadata: {
        phasesCaptured: ['center', 'side_a', 'side_b', 'chin_down'],
        genuinelyDiverse: true,
        keptCount: 8,
        phaseSampleCounts: { center: 2, side_a: 2, side_b: 2, chin_down: 2 },
        testDescriptorSeed: fixtureIndex + 1,
      },
    },
    sampleFrames: phaseIds.map((phaseId, index) => ({
      phaseId,
      frameDataUrl: `data:image/jpeg;base64,AAA${index}`,
    })),
  }
}

async function deterministicEnrollmentPayload(_sampleFrames, captureMetadata = {}) {
  const fixtureSeed = Number(captureMetadata.testDescriptorSeed || 1)
  return {
    descriptors: Array.from({ length: 8 }, (_, sampleIndex) => seededDescriptor(fixtureSeed * 100 + sampleIndex)),
    captureMetadata: { qualityScore: 0.9 },
    biometricModelVersion: 'route-test-model-v1',
    diagnostics: {},
  }
}

function seededDescriptor(seed) {
  let state = Math.max(1, Number(seed) || 1) >>> 0
  const values = Array.from({ length: 128 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state / 0x100000000) * 2 - 1
  })
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1
  return values.map(value => value / magnitude)
}

function adminCookie({
  email = 'route-test-admin@example.test',
  uid = 'route-test-admin',
  scope = 'regional',
  officeId = '',
} = {}) {
  const value = createAdminSessionCookieValue({
    email,
    uid,
    scope,
    officeId,
  })
  return `${getAdminSessionCookieName()}=${value}`
}

function hrCookie({
  email = 'route-test-office-hr@example.test',
  uid = 'route-test-office-hr',
  hrUserId = 'route-test-office-hr',
  scope = 'office',
  officeId = office.id,
} = {}) {
  const value = createHrSessionCookieValue({ email, uid, hrUserId, scope, officeId })
  return `${getHrSessionCookieName()}=${value}`
}

async function transitionLifecycle(personId, lifecycleStatus, reason = `Route test transition to ${lifecycleStatus}`) {
  const response = await updatePerson(
    sameOriginRequest(`/api/persons/${personId}`, {
      method: 'PUT',
      headers: { cookie: adminCookie() },
      body: { command: 'transitionLifecycle', lifecycleStatus, reason },
    }),
    { params: Promise.resolve({ personId }) },
  )
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
  return response
}

function registrationHandler(overrides = {}) {
  return createPersonsPostHandler({
    buildAuthoritativeEnrollmentPayload: deterministicEnrollmentPayload,
    enrollLocalPerson,
    normalizeDataImage,
    writeTelemetry: async () => {},
    ...overrides,
  })
}

async function register(body, overrides) {
  return registrationHandler(overrides)(sameOriginRequest('/api/persons', {
    method: 'POST',
    body,
  }))
}

test('shared Regional PIN remains usable while a named Regional Admin exists', async () => {
  process.env.ADMIN_REGIONAL_PIN = '8042'
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('regional_pin_access', '{"enabled":true}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)

  const response = await login(sameOriginRequest('/api/login', {
    method: 'POST',
    body: { loginType: 'pin', pin: '8042' },
  }))

  assert.equal(response.status, 200)
  const cookie = response.cookies.get(getAdminSessionCookieName())
  assert.ok(cookie?.value)
  assert.equal(parseAdminSessionCookieValue(cookie.value).authMethod, 'shared_regional_pin')
})

test('shared Regional PIN requires an explicit enabled PostgreSQL control row', async () => {
  await queryPostgres("DELETE FROM system_config WHERE key = 'regional_pin_access'")
  assert.equal(await isRegionalPinEnabled(), false)
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('regional_pin_access', '{"enabled":true}'::jsonb, now())
  `)
})

test('legacy shared Regional PIN session keeps shared attribution', () => {
  const now = Math.floor(Date.now() / 1000)
  const encoded = Buffer.from(JSON.stringify({
    role: 'admin',
    scope: 'regional',
    officeId: '',
    email: 'regional-pin-admin@local',
    uid: 'regional-pin-admin',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')
  const signature = crypto
    .createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
    .update(encoded)
    .digest('base64url')

  const session = parseAdminSessionCookieValue(`${encoded}.${signature}`)
  assert.equal(session.authMethod, 'shared_regional_pin')
})

test('public health reports process liveness without claiming dependency readiness', async () => {
  const response = await getHealth()
  const payload = await response.json()
  assert.deepEqual(payload, {
    ok: true,
    kind: 'process-liveness',
    service: 'faceattend',
    timestamp: payload.timestamp,
  })
})

test('maintenance evidence scopes before the server detail cap and reports honest truncation', async () => {
  const baseTimestamp = Date.parse('2026-08-27T09:00:00+08:00')
  await queryPostgres(
    `
      INSERT INTO scan_events (
        status, decision_code, timestamp_ms, office_id, match_debug,
        performance, scan_diagnostics, capture_context
      )
      SELECT
        'accepted', 'accepted', $1::bigint + sequence, $2,
        jsonb_build_object('resolvedPersonId', 'other-person-' || sequence),
        '{"totalMeasuredMs":125}'::jsonb,
        '{"bestFaceAreaRatio":0.18,"deviceClass":"desktop"}'::jsonb,
        '{"authoritativeDescriptorSource":"server","serverEmbeddingFrames":2}'::jsonb
      FROM generate_series(1, 1205) AS sequence
    `,
    [baseTimestamp, otherOffice.id],
  )
  await queryPostgres(
    `
      INSERT INTO scan_events (
        status, decision_code, timestamp_ms, office_id, match_debug,
        performance, scan_diagnostics, capture_context
      ) VALUES (
        'blocked', 'blocked_claimed_employee_mismatch', $1, $2,
        '{"resolvedPersonId":"office-person","resolvedEmployeeId":"office-employee","bestDistance":0.82,"threshold":0.75}'::jsonb,
        '{"totalMeasuredMs":150}'::jsonb,
        '{"bestFaceAreaRatio":0.17,"deviceClass":"mobile"}'::jsonb,
        '{"authoritativeDescriptorSource":"server","serverEmbeddingFrames":2}'::jsonb
      )
    `,
    [baseTimestamp - 1, office.id],
  )
  await queryPostgres(
    `
      INSERT INTO scan_events (
        status, decision_code, timestamp_ms, office_id, match_debug
      ) VALUES (
        'blocked', 'blocked_claimed_employee_mismatch', $1, $2,
        jsonb_build_object(
          'resolvedPersonId', 'resolved-other-person',
          'resolvedEmployeeId', 'resolved-other-employee',
          'officeId', $3::text,
          'bestDistance', 0.83,
          'threshold', 0.75
        )
      )
    `,
    [baseTimestamp - 2, office.id, otherOffice.id],
  )

  const officeResponse = await getMaintenanceEvidence(sameOriginRequest('/api/admin/biometric-benchmark?date=2026-08-27', {
    headers: { cookie: adminCookie({
      email: 'route-test-office-admin@example.test',
      uid: 'route-test-office-admin',
      scope: 'office',
      officeId: office.id,
    }) },
  }))
  const officePayload = await officeResponse.json()
  assert.equal(officeResponse.status, 200, JSON.stringify(officePayload))
  assert.equal(officePayload.version, 2)
  assert.equal(officePayload.scope.officeId, office.id)
  assert.equal(officePayload.evidence.totalWindowEvents, 1)
  assert.equal(officePayload.evidence.loadedEvents, 1)
  assert.equal(officePayload.system, null)
  assert.equal(
    officePayload.breakdowns.categories.reduce((sum, item) => sum + item.count, 0),
    officePayload.evidence.loadedEvents,
  )

  const regionalResponse = await getMaintenanceEvidence(sameOriginRequest('/api/admin/biometric-benchmark?date=2026-08-27', {
    headers: { cookie: adminCookie() },
  }))
  const regionalPayload = await regionalResponse.json()
  assert.equal(regionalResponse.status, 200, JSON.stringify(regionalPayload))
  assert.equal(regionalPayload.version, 2)
  assert.equal(regionalPayload.evidence.totalWindowEvents, 1207)
  assert.equal(regionalPayload.evidence.loadedEvents, 1200)
  assert.equal(regionalPayload.evidence.truncated, true)
  assert.notEqual(regionalPayload.statuses.telemetry.status, 'sufficient')
  assert.notEqual(regionalPayload.statuses.verification1to1.status, 'stable')
  assert.ok(regionalPayload.system)
})

test('biometric follow-up stays separate from pending employee approval', async () => {
  const photoDataUrl = await pngDataUrl()
  const pendingResponse = await register(registrationFixture({ employeeId: '680001', lastName: 'Pendingqueue', photoDataUrl }))
  const pending = await pendingResponse.json()
  assert.equal(pendingResponse.status, 200, JSON.stringify(pending))

  const missingResponse = await register(registrationFixture({ employeeId: '680002', lastName: 'Missingsamples', photoDataUrl }))
  const missing = await missingResponse.json()
  assert.equal(missingResponse.status, 200, JSON.stringify(missing))
  await transitionLifecycle(missing.personId, 'active')
  await queryPostgres('DELETE FROM biometric_index WHERE person_id = $1', [missing.personId])
  await queryPostgres('UPDATE persons SET sample_count = 0 WHERE id = $1', [missing.personId])

  const mismatchResponse = await register(registrationFixture({ employeeId: '680003', lastName: 'Mismatchrepeat', photoDataUrl }))
  const mismatch = await mismatchResponse.json()
  assert.equal(mismatchResponse.status, 200, JSON.stringify(mismatch))
  await transitionLifecycle(mismatch.personId, 'active')
  await queryPostgres(
    `
      INSERT INTO scan_events (
        status, decision_code, timestamp_ms, employee_id, person_id,
        office_id, match_debug
      )
      SELECT
        'blocked', 'blocked_claimed_employee_mismatch', $1::bigint + sequence,
        'claimed-code', NULL, $2,
        jsonb_build_object(
          'resolvedPersonId', $3::text,
          'resolvedEmployeeId', '680003',
          'officeId', $2::text,
          'bestDistance', 0.82,
          'threshold', 0.75
        )
      FROM generate_series(1, 3) AS sequence
    `,
    [Date.now() - 1000, office.id, mismatch.personId],
  )
  const duplicateFallbackIds = ['route-test-duplicate-fallback-a', 'route-test-duplicate-fallback-b']
  for (const [index, personId] of duplicateFallbackIds.entries()) {
    await queryPostgres(
      `
        INSERT INTO persons (
          id, employee_id, employee_id_lower, name, name_lower,
          office_id, office_name, active, approval_status, lifecycle_status,
          sample_count, data, access_code
        ) VALUES ($1, 'DUP-FALLBACK', 'dup-fallback', $2, $3, $4, $5, true, 'approved', 'active', 8, '{}'::jsonb, $6)
      `,
      [personId, `Duplicate fallback ${index + 1}`, `duplicate fallback ${index + 1}`, office.id, office.name, `99${index + 1}0`],
    )
  }
  await queryPostgres(
    `
      INSERT INTO scan_events (
        status, decision_code, timestamp_ms, employee_id, person_id,
        office_id, match_debug
      ) VALUES (
        'blocked', 'blocked_claimed_employee_mismatch', $1,
        'DUP-FALLBACK', NULL, $2,
        jsonb_build_object(
          'resolvedEmployeeId', 'DUP-FALLBACK',
          'officeId', $2::text,
          'bestDistance', 0.82,
          'threshold', 0.75
        )
      )
    `,
    [Date.now(), office.id],
  )
  await queryPostgres(
    `
      INSERT INTO persons (
        id, employee_id, employee_id_lower, name, name_lower,
        office_id, office_name, active, approval_status, lifecycle_status,
        sample_count, data, access_code
      ) VALUES (
        'route-test-claimed-code-fallback', '8877', '8877',
        'Claimed code fallback', 'claimed code fallback', $1, $2,
        true, 'approved', 'active', 8, '{}'::jsonb, '9930'
      )
    `,
    [office.id, office.name],
  )
  await queryPostgres(
    `
      INSERT INTO scan_events (
        status, decision_code, timestamp_ms, employee_id, person_id,
        office_id, match_debug
      )
      SELECT
        'blocked', 'blocked_claimed_employee_mismatch', $1::bigint + sequence,
        '8877', NULL, $2,
        jsonb_build_object('officeId', $2::text, 'bestDistance', 0.82, 'threshold', 0.75)
      FROM generate_series(1, 2) AS sequence
    `,
    [Date.now() + 1, office.id],
  )

  const response = await getReenrollmentCandidates(sameOriginRequest('/api/admin/reenrollment-candidates?days=14', {
    headers: { cookie: adminCookie() },
  }))
  const payload = await response.json()
  assert.equal(response.status, 200, JSON.stringify(payload))
  assert.deepEqual(payload.pendingApproval.map(item => item.personId), [pending.personId])
  assert.equal(payload.biometricFollowUp.some(item => duplicateFallbackIds.includes(item.personId)), false)
  assert.equal(payload.biometricFollowUp.some(item => item.personId === 'route-test-claimed-code-fallback'), false)
  assert.deepEqual(
    new Set(payload.biometricFollowUp.map(item => item.personId)),
    new Set([missing.personId, mismatch.personId]),
  )
  assert.equal(
    payload.biometricFollowUp.find(item => item.personId === mismatch.personId).claimedMismatchCount,
    3,
  )
  assert.equal(payload.biometricFollowUp.some(item => item.personId === pending.personId), false)
})

test('named Admin PIN creates a named Admin session', async () => {
  const response = await login(sameOriginRequest('/api/login', {
    method: 'POST',
    body: { loginType: 'pin', pin: '7351' },
  }))

  assert.equal(response.status, 200)
  const cookie = response.cookies.get(getAdminSessionCookieName())
  assert.ok(cookie?.value)
  const session = parseAdminSessionCookieValue(cookie.value)
  assert.equal(session.uid, 'route-test-admin')
  assert.equal(session.authMethod, 'named_pin')
})

test('Office HR PIN creates a named office-scoped HR session', async () => {
  const response = await login(sameOriginRequest('/api/login', {
    method: 'POST',
    body: { loginType: 'pin', pin: '8462' },
  }))

  assert.equal(response.status, 200)
  const cookie = response.cookies.get(getHrSessionCookieName())
  assert.ok(cookie?.value)
  const session = parseHrSessionCookieValue(cookie.value)
  assert.equal(session.hrUserId, 'route-test-office-hr')
  assert.equal(session.officeId, office.id)
  assert.equal(session.authMethod, 'named_pin')
})

test('disabled shared Regional PIN does not disable named Admin PIN', async () => {
  process.env.ADMIN_REGIONAL_PIN = '8042'
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('regional_pin_access', '{"enabled":false}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)

  const sharedResponse = await login(sameOriginRequest('/api/login', {
    method: 'POST',
    body: { loginType: 'pin', pin: '8042' },
  }))
  const namedResponse = await login(sameOriginRequest('/api/login', {
    method: 'POST',
    body: { loginType: 'pin', pin: '7351' },
  }))

  assert.equal(sharedResponse.status, 401)
  assert.deepEqual(await sharedResponse.json(), { ok: false, message: 'Invalid PIN.' })
  assert.equal(namedResponse.status, 200)
})

test('unconfigured shared Regional PIN uses the non-enumerating invalid PIN response', async () => {
  const previous = process.env.ADMIN_REGIONAL_PIN
  delete process.env.ADMIN_REGIONAL_PIN
  try {
    const response = await login(sameOriginRequest('/api/login', {
      method: 'POST',
      body: { loginType: 'pin', pin: '8042' },
    }))
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { ok: false, message: 'Invalid PIN.' })
  } finally {
    if (previous === undefined) delete process.env.ADMIN_REGIONAL_PIN
    else process.env.ADMIN_REGIONAL_PIN = previous
  }
})

test('login rate limit blocks repeated attempts for one credential identity', async () => {
  const statuses = []
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await login(sameOriginRequest('/api/login', {
      method: 'POST',
      body: { loginType: 'pin', pin: '9917' },
    }))
    statuses.push(response.status)
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429, 429])
  const audit = await queryPostgres(`
    SELECT count(*)::integer AS count
    FROM audit_logs
    WHERE action = 'staff_login_rate_limited'
  `)
  assert.equal(audit.rows[0].count, 1)
})

test('invalid PIN audit does not persist the submitted PIN', async () => {
  const submittedPin = '6629'
  const response = await login(sameOriginRequest('/api/login', {
    method: 'POST',
    body: { loginType: 'pin', pin: submittedPin },
  }))
  assert.equal(response.status, 401)

  const audit = await queryPostgres(`
    SELECT summary, metadata::text AS metadata
    FROM audit_logs
    WHERE action = 'staff_login_failed'
    ORDER BY created_at DESC
    LIMIT 1
  `)
  assert.equal(audit.rowCount, 1)
  assert.equal(audit.rows[0].summary.includes(submittedPin), false)
  assert.equal(audit.rows[0].metadata.includes(submittedPin), false)
})

test('PIN collision cannot escalate a named Office HR user to Regional Admin', async () => {
  await queryPostgres('DELETE FROM request_rate_limits')
  process.env.ADMIN_REGIONAL_PIN = '8462'
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('regional_pin_access', '{"enabled":true}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)

  const response = await login(sameOriginRequest('/api/login', {
    method: 'POST',
    body: { loginType: 'pin', pin: '8462' },
  }))

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { ok: false, message: 'Invalid PIN.' })
  assert.equal(response.cookies.get(getAdminSessionCookieName()), undefined)
  assert.equal(response.cookies.get(getHrSessionCookieName()), undefined)
  const audit = await queryPostgres(`
    SELECT summary, metadata::text AS metadata
    FROM audit_logs
    WHERE action = 'staff_login_pin_collision'
    ORDER BY created_at DESC
    LIMIT 1
  `)
  assert.equal(audit.rowCount, 1)
  assert.equal(audit.rows[0].summary.includes('8462'), false)
  assert.equal(audit.rows[0].metadata.includes('8462'), false)
})

test('Regional PIN control rejects Office HR and office-scoped Admin', async () => {
  const hrResponse = await getRegionalPinControl(sameOriginRequest('/api/admin/regional-pin', {
    headers: { cookie: hrCookie() },
  }))
  const officeAdminResponse = await updateRegionalPinControl(sameOriginRequest('/api/admin/regional-pin', {
    method: 'POST',
    headers: { cookie: adminCookie({
      email: 'route-test-office-admin@example.test',
      uid: 'route-test-office-admin',
      scope: 'office',
      officeId: office.id,
    }) },
    body: { enabled: false },
  }))

  assert.equal(hrResponse.status, 403)
  assert.equal(officeAdminResponse.status, 403)
})

test('Regional PIN control rejects enabling an unconfigured PIN', async () => {
  const previous = process.env.ADMIN_REGIONAL_PIN
  delete process.env.ADMIN_REGIONAL_PIN
  try {
    const response = await updateRegionalPinControl(sameOriginRequest('/api/admin/regional-pin', {
      method: 'POST',
      headers: { cookie: adminCookie() },
      body: { enabled: true },
    }))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      ok: false,
      message: 'Regional PIN is not configured.',
    })
  } finally {
    if (previous === undefined) delete process.env.ADMIN_REGIONAL_PIN
    else process.env.ADMIN_REGIONAL_PIN = previous
  }
})

test('Regional PIN control commits configuration and audit together', async () => {
  process.env.ADMIN_REGIONAL_PIN = '8042'
  const response = await updateRegionalPinControl(sameOriginRequest('/api/admin/regional-pin', {
    method: 'POST',
    headers: { cookie: adminCookie() },
    body: { enabled: false },
  }))
  assert.equal(response.status, 200)

  const state = await queryPostgres(
    "SELECT value FROM system_config WHERE key = 'regional_pin_access'",
  )
  const audit = await queryPostgres(`
    SELECT summary
    FROM audit_logs
    WHERE action = 'regional_pin_access_update'
    ORDER BY created_at DESC
    LIMIT 1
  `)
  assert.equal(state.rows[0].value.enabled, false)
  assert.equal(audit.rowCount, 1)
  assert.match(audit.rows[0].summary, /Regional PIN disabled/)
  assert.doesNotMatch(audit.rows[0].summary, /bootstrap/i)
})

test('Regional PIN control rolls back configuration when audit write fails', async () => {
  process.env.ADMIN_REGIONAL_PIN = '8042'
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('regional_pin_access', '{"enabled":false}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
  await queryPostgres(`
    CREATE OR REPLACE FUNCTION route_test_reject_regional_pin_audit()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'regional_pin_access_update' THEN
        RAISE EXCEPTION 'route test audit failure';
      END IF;
      RETURN NEW;
    END
    $$;
    CREATE TRIGGER route_test_reject_regional_pin_audit
    BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION route_test_reject_regional_pin_audit();
  `)

  try {
    const response = await updateRegionalPinControl(sameOriginRequest('/api/admin/regional-pin', {
      method: 'POST',
      headers: { cookie: adminCookie() },
      body: { enabled: true },
    }))
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      ok: false,
      message: 'Failed to update Regional PIN access.',
    })
    const state = await queryPostgres(
      "SELECT value FROM system_config WHERE key = 'regional_pin_access'",
    )
    assert.equal(state.rows[0].value.enabled, false)
  } finally {
    await queryPostgres('DROP TRIGGER IF EXISTS route_test_reject_regional_pin_audit ON audit_logs')
    await queryPostgres('DROP FUNCTION IF EXISTS route_test_reject_regional_pin_audit()')
  }
})

test('global thresholds reject unauthenticated, Office HR, and office-scoped Admin reads', async () => {
  const unauthenticated = await getGlobalThresholds(sameOriginRequest('/api/admin/thresholds'))
  const hrResponse = await getGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
    headers: { cookie: hrCookie() },
  }))
  const officeAdminResponse = await getGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
    headers: { cookie: adminCookie({
      email: 'route-test-office-admin@example.test',
      uid: 'route-test-office-admin',
      scope: 'office',
      officeId: office.id,
    }) },
  }))

  assert.equal(unauthenticated.status, 401)
  assert.equal(hrResponse.status, 403)
  assert.equal(officeAdminResponse.status, 403)
})

test('global thresholds allow Regional Admin reads and reject office-scoped writes', async () => {
  const regionalResponse = await getGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
    headers: { cookie: adminCookie() },
  }))
  const officeAdminResponse = await updateGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
    method: 'POST',
    headers: { cookie: adminCookie({
      email: 'route-test-office-admin@example.test',
      uid: 'route-test-office-admin',
      scope: 'office',
      officeId: office.id,
    }) },
    body: { action: 'update', values: { kioskMatchDistance: 0.78 } },
  }))

  assert.equal(regionalResponse.status, 200)
  assert.equal(officeAdminResponse.status, 403)
})

test('global thresholds reject an entire payload containing unknown or invalid values', async () => {
  await queryPostgres("DELETE FROM system_config WHERE key = 'thresholds'")
  const cases = [
    { kioskMatchDistance: 0.78, unknownThreshold: 1 },
    { kioskMatchDistance: '0.78' },
    { kioskMatchDistance: 1.01 },
    { kioskMatchDistance: null },
  ]

  for (const values of cases) {
    const response = await updateGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
      method: 'POST',
      headers: { cookie: adminCookie() },
      body: { action: 'update', values },
    }))
    assert.equal(response.status, 400, JSON.stringify(values))
  }

  const stored = await queryPostgres("SELECT value FROM system_config WHERE key = 'thresholds'")
  assert.equal(stored.rowCount, 0)
})

test('global thresholds commit valid values and prior/new audit together', async () => {
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('thresholds', '{"kioskMatchDistance":0.76,"activeScanMs":150}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
  const response = await updateGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
    method: 'POST',
    headers: { cookie: adminCookie() },
    body: { action: 'update', values: { kioskMatchDistance: 0.77 } },
  }))
  assert.equal(response.status, 200)

  const stored = await queryPostgres("SELECT value FROM system_config WHERE key = 'thresholds'")
  const audit = await queryPostgres(`
    SELECT metadata
    FROM audit_logs
    WHERE action = 'thresholds.updated'
    ORDER BY created_at DESC
    LIMIT 1
  `)
  assert.equal(stored.rows[0].value.kioskMatchDistance, 0.77)
  assert.equal(stored.rows[0].value.activeScanMs, 150)
  assert.deepEqual(audit.rows[0].metadata.changed.kioskMatchDistance, { from: 0.76, to: 0.77 })
})

test('global thresholds reset audit records prior and default values', async () => {
  const response = await updateGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
    method: 'POST',
    headers: { cookie: adminCookie() },
    body: { action: 'reset' },
  }))
  assert.equal(response.status, 200)

  const stored = await queryPostgres("SELECT value FROM system_config WHERE key = 'thresholds'")
  const audit = await queryPostgres(`
    SELECT metadata
    FROM audit_logs
    WHERE action = 'thresholds.reset'
    ORDER BY created_at DESC
    LIMIT 1
  `)
  assert.equal(stored.rowCount, 0)
  assert.deepEqual(audit.rows[0].metadata.changed.kioskMatchDistance, {
    from: 0.77,
    to: THRESHOLD_DEFAULTS.kioskMatchDistance,
  })
  assert.deepEqual(audit.rows[0].metadata.changed.activeScanMs, {
    from: 150,
    to: THRESHOLD_DEFAULTS.activeScanMs,
  })
})

test('global thresholds roll back update and reset when audit write fails', async () => {
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('thresholds', '{"kioskMatchDistance":0.76}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
  await queryPostgres(`
    CREATE OR REPLACE FUNCTION route_test_reject_threshold_audit()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action IN ('thresholds.updated', 'thresholds.reset') THEN
        RAISE EXCEPTION 'route test threshold audit failure';
      END IF;
      RETURN NEW;
    END
    $$;
    CREATE TRIGGER route_test_reject_threshold_audit
    BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION route_test_reject_threshold_audit();
  `)

  try {
    const updateResponse = await updateGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
      method: 'POST',
      headers: { cookie: adminCookie() },
      body: { action: 'update', values: { kioskMatchDistance: 0.77 } },
    }))
    assert.equal(updateResponse.status, 500)
    assert.deepEqual(await updateResponse.json(), {
      ok: false,
      message: 'Failed to update thresholds.',
    })

    const resetResponse = await updateGlobalThresholds(sameOriginRequest('/api/admin/thresholds', {
      method: 'POST',
      headers: { cookie: adminCookie() },
      body: { action: 'reset' },
    }))
    assert.equal(resetResponse.status, 500)
    assert.deepEqual(await resetResponse.json(), {
      ok: false,
      message: 'Failed to update thresholds.',
    })

    const stored = await queryPostgres("SELECT value FROM system_config WHERE key = 'thresholds'")
    assert.equal(stored.rowCount, 1)
    assert.equal(stored.rows[0].value.kioskMatchDistance, 0.76)
  } finally {
    await queryPostgres('DROP TRIGGER IF EXISTS route_test_reject_threshold_audit ON audit_logs')
    await queryPostgres('DROP FUNCTION IF EXISTS route_test_reject_threshold_audit()')
  }
})

test('global threshold prior-value reads serialize concurrent transactions', async () => {
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('thresholds', '{"kioskMatchDistance":0.76}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
  const firstClient = await getPostgresPool().connect()
  const secondClient = await getPostgresPool().connect()
  let firstCommitted = false
  let secondResolved = false
  try {
    await firstClient.query('BEGIN')
    await secondClient.query('BEGIN')
    await getActiveThresholdsForUpdate(null, { client: firstClient })
    const secondRead = getActiveThresholdsForUpdate(null, { client: secondClient })
      .then(result => {
        secondResolved = true
        return result
      })

    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(secondResolved, false)
    await firstClient.query('COMMIT')
    firstCommitted = true
    const secondValues = await secondRead
    assert.equal(secondValues.kioskMatchDistance, 0.76)
  } finally {
    if (!firstCommitted) await firstClient.query('ROLLBACK').catch(() => {})
    await secondClient.query('ROLLBACK').catch(() => {})
    firstClient.release()
    secondClient.release()
  }
})

test('photo normalization rejects SVG and malformed image data', async () => {
  const disguisedSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>',
  ).toString('base64')
  await assert.rejects(
    normalizeDataImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    error => error?.status === 400 && error?.code === 'invalid_enrollment_photo',
  )
  await assert.rejects(
    normalizeDataImage(`data:image/jpeg;base64,${disguisedSvg}`),
    error => error?.status === 400 && error?.code === 'invalid_enrollment_photo',
  )
  await assert.rejects(
    normalizeDataImage('data:image/jpeg;base64,not-valid-base64%%%'),
    error => error?.status === 400 && error?.code === 'invalid_enrollment_photo',
  )
})

test('photo normalization enforces decoded-byte and pixel limits', async () => {
  const dataUrl = await pngDataUrl()
  await assert.rejects(normalizeDataImage(dataUrl, { maxBytes: 1 }), /too large/i)
  await assert.rejects(normalizeDataImage(dataUrl, { maxPixels: 3 }), /dimension|pixel/i)
})

test('photo normalization returns server-encoded JPEG bytes', async () => {
  const normalized = await normalizeDataImage(await pngDataUrl())
  const metadata = await sharp(normalized.buffer).metadata()

  assert.equal(normalized.extension, '.jpg')
  assert.equal(normalized.mimeType, 'image/jpeg')
  assert.equal(metadata.format, 'jpeg')
  assert.equal(metadata.width, 2)
  assert.equal(metadata.height, 2)
})

test('registration photo rejects SVG and malformed image data without leaking internals', async () => {
  for (const photoDataUrl of [
    'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
    'data:image/jpeg;base64,not-valid-base64%%%',
  ]) {
    const response = await register(registrationFixture({ photoDataUrl }))
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.doesNotMatch(payload.message, /sharp|SQL|bind|D:\\|node_modules/i)
  }
})

test('saved profile photo is server-encoded JPEG', async () => {
  const employeeId = '812345'
  const response = await register(registrationFixture({
    employeeId,
    lastName: 'Jpeg',
    photoDataUrl: await pngDataUrl(),
  }))
  const payload = await response.json()
  assert.equal(response.status, 200, JSON.stringify(payload))

  const saved = await queryPostgres(
    'SELECT photo_path, photo_content_type FROM persons WHERE employee_id = $1',
    [employeeId],
  )
  assert.match(saved.rows[0]?.photo_path || '', /\.jpg$/)
  assert.equal(saved.rows[0]?.photo_content_type, 'image/jpeg')
  const audit = await queryPostgres(
    "SELECT count(*)::integer AS count FROM audit_logs WHERE target_id = $1 AND action = 'person_submission_create'",
    [payload.personId],
  )
  assert.equal(audit.rows[0]?.count, 1)
})

test('photo persistence removes a new file when database update fails', async () => {
  const personId = 'missing-photo-person'
  const normalized = await normalizeDataImage(await pngDataUrl())
  await assert.rejects(
    saveNormalizedEnrollmentPhoto(personId, normalized),
    /employee record was not found/i,
  )
  const file = path.join(getLocalFileStorageRoot(), 'photos', 'enrollments', `${personId}.jpg`)
  await assert.rejects(stat(file), /ENOENT/)
})

test('photo persistence preserves the previous file when database update fails', async () => {
  const personId = 'existing-photo-person'
  const relativePath = `photos/enrollments/${personId}.jpg`
  const existingFile = path.join(getLocalFileStorageRoot(), ...relativePath.split('/'))
  await mkdir(path.dirname(existingFile), { recursive: true })
  await writeFile(existingFile, 'previous-photo')
  const normalized = await normalizeDataImage(await pngDataUrl())
  const client = {
    async query(sql) {
      if (/SELECT photo_path/i.test(sql)) {
        return { rowCount: 1, rows: [{ photo_path: relativePath }] }
      }
      throw new Error('forced update failure')
    },
  }

  await assert.rejects(
    saveNormalizedEnrollmentPhoto(personId, normalized, { client }),
    /forced update failure/,
  )
  assert.equal((await readFile(existingFile, 'utf8')), 'previous-photo')
})

test('public error response hides database and filesystem details', async () => {
  const response = await register(
    registrationFixture({ photoDataUrl: await pngDataUrl() }),
    {
      enrollLocalPerson: async () => {
        throw Object.assign(
          new Error('bind SQL failed in D:\\app\\node_modules\\pg'),
          { code: 'internal_database_failure' },
        )
      },
    },
  )
  const payload = await response.json()
  assert.equal(response.status, 500)
  assert.equal(payload.message, 'Registration could not be completed. Please try again or contact HR.')
  assert.doesNotMatch(JSON.stringify(payload), /bind|SQL|D:\\|node_modules/i)
})

test('post-commit biometric index warning is structured without changing registration success', async () => {
  const response = await register(
    registrationFixture({ photoDataUrl: await pngDataUrl() }),
    {
      enrollLocalPerson: async () => ({
        transactionResult: {
          personId: 'committed-warning-person',
          uniqueCount: 8,
          nextPerson: {
            accessCode: '1234',
            lifecycleStatus: 'pending',
            duplicateReviewStatus: 'clear',
          },
        },
        sampleCount: 8,
        indexSyncWarning: 'Biometric index refresh is pending.',
        duplicateReviewRequired: false,
      }),
    },
  )
  const payload = await response.json()
  assert.equal(response.status, 200, JSON.stringify(payload))
  assert.deepEqual(payload.warnings, ['Biometric index refresh is pending.'])
  assert.doesNotMatch(payload.message, /warning/i)
})

test('registration is visible as pending and lifecycle transitions are audited', async () => {
  const registration = await register(registrationFixture({
    employeeId: '823456',
    lastName: 'Lifecycle',
    photoDataUrl: await pngDataUrl(),
  }))
  const registered = await registration.json()
  assert.equal(registration.status, 200, JSON.stringify(registered))
  assert.equal(registered.lifecycleStatus, 'pending')

  const cookie = adminCookie()
  const pendingResponse = await getPersons(sameOriginRequest(
    '/api/persons?mode=directory&approval=pending',
    { headers: { cookie } },
  ))
  const pending = await pendingResponse.json()
  assert.equal(pendingResponse.status, 200, JSON.stringify(pending))
  assert.equal(pending.persons.some(person => person.id === registered.personId), true)

  const transition = lifecycleStatus => updatePerson(
    sameOriginRequest(`/api/persons/${registered.personId}`, {
      method: 'PUT',
      headers: { cookie },
      body: {
        command: 'transitionLifecycle',
        lifecycleStatus,
        reason: `Route test transition to ${lifecycleStatus}`,
      },
    }),
    { params: Promise.resolve({ personId: registered.personId }) },
  )

  const activeResponse = await transition('active')
  assert.equal(activeResponse.status, 200, JSON.stringify(await activeResponse.clone().json()))
  const duplicateActive = await transition('active')
  assert.equal(duplicateActive.status, 409)
  const backToPending = await transition('pending')
  assert.equal(backToPending.status, 200, JSON.stringify(await backToPending.clone().json()))
  const rejectedResponse = await transition('rejected')
  assert.equal(rejectedResponse.status, 200, JSON.stringify(await rejectedResponse.clone().json()))

  const profileResponse = await updatePerson(
    sameOriginRequest(`/api/persons/${registered.personId}`, {
      method: 'PUT',
      headers: { cookie },
      body: {
        lastName: 'Lifecycle',
        firstName: 'Test',
        middleName: '',
        employeeId: '823456',
        position: 'Tester',
        officeId: office.id,
        officeName: office.name,
        divisionId: '',
        lifecycleStatus: 'active',
      },
    }),
    { params: Promise.resolve({ personId: registered.personId }) },
  )
  assert.equal(profileResponse.status, 200, JSON.stringify(await profileResponse.clone().json()))

  const stored = await queryPostgres(
    'SELECT lifecycle_status, active, approval_status FROM persons WHERE id = $1',
    [registered.personId],
  )
  assert.deepEqual(stored.rows[0], {
    lifecycle_status: 'rejected',
    active: false,
    approval_status: 'rejected',
  })
  const audits = await queryPostgres(`
    SELECT actor_email, metadata
    FROM audit_logs
    WHERE target_id = $1 AND action = 'person_lifecycle_transition'
    ORDER BY id
  `, [registered.personId])
  assert.equal(audits.rowCount, 3)
  assert.equal(audits.rows[0].actor_email, 'route-test-admin@example.test')
  assert.equal(audits.rows[0].metadata.before.lifecycleStatus, 'pending')
  assert.equal(audits.rows[0].metadata.after.lifecycleStatus, 'active')
  assert.equal(audits.rows[1].metadata.before.lifecycleStatus, 'active')
  assert.equal(audits.rows[1].metadata.after.lifecycleStatus, 'pending')
  assert.equal(audits.rows[2].metadata.before.lifecycleStatus, 'pending')
  assert.equal(audits.rows[2].metadata.after.lifecycleStatus, 'rejected')
})

test('employee deletion deactivates and preserves biometric, photo, and attendance history', async () => {
  const registrationResponse = await register(registrationFixture({
    employeeId: '873456',
    lastName: 'PreserveDelete',
    photoDataUrl: await pngDataUrl(),
  }))
  const registered = await registrationResponse.json()
  assert.equal(registrationResponse.status, 200, JSON.stringify(registered))
  await transitionLifecycle(registered.personId, 'active', 'Activate deletion preservation fixture')

  const personBefore = await getLocalPersonById(registered.personId)
  assert.ok(personBefore?.photoPath)
  const photoPath = path.join(getLocalFileStorageRoot(), personBefore.photoPath)
  assert.equal((await stat(photoPath)).isFile(), true)

  await queryPostgres(`
    INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key)
    VALUES ($1, $2, $3, $4, 'checkin', 1787260800000, '2026-08-21')
  `, [`delete-preserve-attendance-${registered.personId}`, personBefore.employeeId, registered.personId, personBefore.name])
  await queryPostgres(`
    INSERT INTO attendance_daily (id, employee_id, person_id, date_key, name, log_count)
    VALUES ($1, $2, $3, '2026-08-21', $4, 1)
  `, [`delete-preserve-daily-${registered.personId}`, personBefore.employeeId, registered.personId, personBefore.name])
  await queryPostgres(`
    INSERT INTO attendance_locks (employee_id, office_id, last_timestamp_ms, last_attendance_id)
    VALUES ($1, $2, 1787260800000, $3)
  `, [registered.personId, office.id, `delete-preserve-attendance-${registered.personId}`])
  await queryPostgres(`
    INSERT INTO scan_events (status, decision_code, timestamp_ms, employee_id, person_id, name, office_id)
    VALUES ('accepted', 'accepted', 1787260800000, $1, $2, $3, $4)
  `, [personBefore.employeeId, registered.personId, personBefore.name, office.id])

  const preservedTables = ['biometric_index', 'attendance', 'attendance_daily', 'attendance_locks', 'scan_events']
  const beforeCounts = {}
  for (const table of preservedTables) {
    const column = table === 'attendance_locks' ? 'employee_id' : 'person_id'
    beforeCounts[table] = Number((await queryPostgres(
      `SELECT count(*)::integer AS count FROM ${table} WHERE ${column} = $1`,
      [registered.personId],
    )).rows[0].count)
  }

  const response = await deletePerson(
    sameOriginRequest(`/api/persons/${registered.personId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie() },
    }),
    { params: Promise.resolve({ personId: registered.personId }) },
  )
  const payload = await response.json()
  assert.equal(response.status, 200, JSON.stringify(payload))
  assert.equal(payload.deactivated, true)
  assert.equal(payload.hardDeleted, false)

  const personAfter = await getLocalPersonById(registered.personId)
  assert.equal(personAfter?.lifecycleStatus, 'inactive')
  assert.equal(personAfter?.active, false)
  assert.equal((await stat(photoPath)).isFile(), true)
  for (const table of preservedTables) {
    const column = table === 'attendance_locks' ? 'employee_id' : 'person_id'
    const afterCount = Number((await queryPostgres(
      `SELECT count(*)::integer AS count FROM ${table} WHERE ${column} = $1`,
      [registered.personId],
    )).rows[0].count)
    assert.equal(afterCount, beforeCounts[table], `${table} should be preserved`)
  }
})

test('Office HR settings expose and mutate only the assigned office work policy', async () => {
  const officeHrCookie = hrCookie()
  const getResponse = await getHrOfficeSettings(sameOriginRequest('/api/hr/office-settings', {
    headers: { cookie: officeHrCookie },
  }))
  const getPayload = await getResponse.json()
  assert.equal(getResponse.status, 200, JSON.stringify(getPayload))
  assert.deepEqual(Object.keys(getPayload.office).sort(), ['id', 'name', 'workPolicy'])
  assert.deepEqual(Object.keys(getPayload.office.workPolicy).sort(), [
    'afternoonIn',
    'afternoonOut',
    'checkInCooldownMinutes',
    'checkOutCooldownMinutes',
    'gracePeriodMinutes',
    'morningIn',
    'morningOut',
    'schedule',
    'wfhDays',
    'workingDays',
  ])
  assert.doesNotMatch(JSON.stringify(getPayload.office), /gps|latitude|longitude|radius|location|wifi|division|province/i)

  const regionalCookie = hrCookie({
    email: 'route-test-regional-hr@example.test',
    uid: 'route-test-regional-hr',
    hrUserId: 'route-test-regional-hr',
    scope: 'regional',
    officeId: '',
  })
  const regionalGet = await getHrOfficeSettings(sameOriginRequest('/api/hr/office-settings', {
    headers: { cookie: regionalCookie },
  }))
  assert.equal(regionalGet.status, 403, JSON.stringify(await regionalGet.clone().json()))

  const forgedOrigin = await updateHrOfficeSettings(sameOriginRequest('/api/hr/office-settings', {
    method: 'PUT',
    headers: { cookie: officeHrCookie, origin: 'https://evil.example.test' },
    body: { workPolicy: getPayload.office.workPolicy },
  }))
  assert.equal(forgedOrigin.status, 403, JSON.stringify(await forgedOrigin.clone().json()))

  const before = (await queryPostgres(`
    SELECT id, name, latitude, longitude, radius_meters, work_policy, data
    FROM offices
    WHERE id = ANY($1::text[])
    ORDER BY id
  `, [[office.id, otherOffice.id]])).rows
  const beforeCurrent = before.find(row => row.id === office.id)
  const beforeOther = before.find(row => row.id === otherOffice.id)
  const desiredPolicy = {
    schedule: 'Mon-Fri flexible office schedule',
    workingDays: [1, 2, 3, 4, 5],
    wfhDays: [5],
    morningIn: '07:30',
    morningOut: '12:00',
    afternoonIn: '13:00',
    afternoonOut: '16:30',
    gracePeriodMinutes: 10,
    checkInCooldownMinutes: 20,
    checkOutCooldownMinutes: 7,
  }
  const concurrentAdmin = {
    name: 'Concurrent Admin Office Name',
    latitude: 6.1165,
    longitude: 125.1717,
    radiusMeters: 888,
    data: { location: 'Concurrent Admin Location', wifiSsid: ['CONCURRENT-ADMIN-WIFI'] },
  }
  const adminClient = await getPostgresPool().connect()
  let putPromise
  let adminCommitted = false
  try {
    await adminClient.query('BEGIN')
    await adminClient.query(`
      UPDATE offices
      SET name = $2,
          name_lower = lower($2),
          latitude = $3,
          longitude = $4,
          radius_meters = $5,
          data = data || $6::jsonb
      WHERE id = $1
    `, [
      office.id,
      concurrentAdmin.name,
      concurrentAdmin.latitude,
      concurrentAdmin.longitude,
      concurrentAdmin.radiusMeters,
      JSON.stringify(concurrentAdmin.data),
    ])
    putPromise = updateHrOfficeSettings(sameOriginRequest('/api/hr/office-settings', {
      method: 'PUT',
      headers: { cookie: officeHrCookie },
      body: {
        id: otherOffice.id,
        name: 'Forged office name',
        location: 'Forged location',
        wifiSsid: ['FORGED-WIFI'],
        gps: { latitude: 0, longitude: 0, radiusMeters: 999999 },
        workPolicy: { ...desiredPolicy, radiusMeters: 999999, map: 'forged-map' },
      },
    }))
    let lockObserved = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const activity = await queryPostgres(`
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%offices%'
        LIMIT 1
      `)
      if (activity.rowCount > 0) {
        lockObserved = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.equal(lockObserved, true, 'Office HR update should wait for the concurrent Admin office update')
    await adminClient.query('COMMIT')
    adminCommitted = true
  } finally {
    if (!adminCommitted) await adminClient.query('ROLLBACK').catch(() => {})
    adminClient.release()
  }
  const putResponse = await putPromise
  const putPayload = await putResponse.json()
  assert.equal(putResponse.status, 200, JSON.stringify(putPayload))
  assert.deepEqual(Object.keys(putPayload.office).sort(), ['id', 'name', 'workPolicy'])
  assert.equal(putPayload.office.name, concurrentAdmin.name)
  assert.deepEqual(putPayload.office.workPolicy, desiredPolicy)
  assert.doesNotMatch(JSON.stringify(putPayload.office), /gps|latitude|longitude|radius|location|wifi|map/i)

  const after = (await queryPostgres(`
    SELECT id, name, latitude, longitude, radius_meters, work_policy, data
    FROM offices
    WHERE id = ANY($1::text[])
    ORDER BY id
  `, [[office.id, otherOffice.id]])).rows
  const afterCurrent = after.find(row => row.id === office.id)
  const afterOther = after.find(row => row.id === otherOffice.id)
  assert.equal(afterCurrent.name, concurrentAdmin.name)
  assert.equal(afterCurrent.latitude, concurrentAdmin.latitude)
  assert.equal(afterCurrent.longitude, concurrentAdmin.longitude)
  assert.equal(afterCurrent.radius_meters, concurrentAdmin.radiusMeters)
  assert.equal(afterCurrent.data.location, concurrentAdmin.data.location)
  assert.deepEqual(afterCurrent.data.wifiSsid, concurrentAdmin.data.wifiSsid)
  assert.deepEqual(afterCurrent.work_policy, desiredPolicy)
  assert.deepEqual(afterOther, beforeOther)

  const audits = await queryPostgres(`
    SELECT actor_role, actor_scope, actor_office_id, actor_id, actor_name, actor_email, target_id, office_id, summary, metadata
    FROM audit_logs
    WHERE action = 'office_hr_settings_update' AND target_id = $1
  `, [office.id])
  assert.deepEqual(audits.rows[0], {
    actor_role: 'hr',
    actor_scope: 'office',
    actor_office_id: office.id,
    actor_id: 'route-test-office-hr',
    actor_name: 'Route Test Office HR',
    actor_email: 'route-test-office-hr@example.test',
    target_id: office.id,
    office_id: office.id,
    summary: `Office HR updated allowed settings for ${concurrentAdmin.name}`,
    metadata: { workPolicyChanged: true },
  })

  const noOpResponse = await updateHrOfficeSettings(sameOriginRequest('/api/hr/office-settings', {
    method: 'PUT',
    headers: { cookie: officeHrCookie },
    body: { workPolicy: { ...desiredPolicy } },
  }))
  assert.equal(noOpResponse.status, 200, JSON.stringify(await noOpResponse.clone().json()))
  const noOpAudit = await queryPostgres(`
    SELECT metadata
    FROM audit_logs
    WHERE action = 'office_hr_settings_update' AND target_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [office.id])
  assert.deepEqual(noOpAudit.rows[0].metadata, { workPolicyChanged: false })

  await queryPostgres(`
    UPDATE offices
    SET name = $2,
        name_lower = lower($2),
        latitude = $3,
        longitude = $4,
        radius_meters = $5,
        work_policy = $6::jsonb,
        data = $7::jsonb
    WHERE id = $1
  `, [
    office.id,
    beforeCurrent.name,
    beforeCurrent.latitude,
    beforeCurrent.longitude,
    beforeCurrent.radius_meters,
    JSON.stringify(beforeCurrent.work_policy),
    JSON.stringify(beforeCurrent.data),
  ])
})

test('hard deletion requires Regional Admin confirmation and rejects protected history', async () => {
  const referencedResponse = await register(registrationFixture({
    employeeId: '883456',
    lastName: 'ReferencedDelete',
    photoDataUrl: await pngDataUrl(),
  }))
  const referenced = await referencedResponse.json()
  assert.equal(referencedResponse.status, 200, JSON.stringify(referenced))
  const referencedPerson = await getLocalPersonById(referenced.personId)
  const referencedPhotoPath = path.join(getLocalFileStorageRoot(), referencedPerson.photoPath)
  await queryPostgres(`
    INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key)
    VALUES ($1, $2, $3, $4, 'checkin', 1787260800000, '2026-08-21')
  `, [`hard-delete-reference-${referenced.personId}`, referencedPerson.employeeId, referenced.personId, referencedPerson.name])

  const officeAdminCookie = adminCookie({
    email: 'route-test-office-admin@example.test',
    uid: 'route-test-office-admin',
    scope: 'office',
    officeId: office.id,
  })
  const officeAdminAttempt = await deletePerson(
    sameOriginRequest(`/api/persons/${referenced.personId}`, {
      method: 'DELETE',
      headers: { cookie: officeAdminCookie },
      body: { command: 'hardDelete', confirmation: referencedPerson.name },
    }),
    { params: Promise.resolve({ personId: referenced.personId }) },
  )
  assert.equal(officeAdminAttempt.status, 403, JSON.stringify(await officeAdminAttempt.clone().json()))

  const wrongConfirmation = await deletePerson(
    sameOriginRequest(`/api/persons/${referenced.personId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie() },
      body: { command: 'hardDelete', confirmation: referencedPerson.name.toLowerCase() },
    }),
    { params: Promise.resolve({ personId: referenced.personId }) },
  )
  assert.equal(wrongConfirmation.status, 400, JSON.stringify(await wrongConfirmation.clone().json()))

  const referencedAttempt = await deletePerson(
    sameOriginRequest(`/api/persons/${referenced.personId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie() },
      body: { command: 'hardDelete', confirmation: referencedPerson.name },
    }),
    { params: Promise.resolve({ personId: referenced.personId }) },
  )
  const referencedPayload = await referencedAttempt.json()
  assert.equal(referencedAttempt.status, 409, JSON.stringify(referencedPayload))
  assert.equal(referencedPayload.code, 'person_history_exists')
  assert.ok(await getLocalPersonById(referenced.personId))
  assert.equal((await stat(referencedPhotoPath)).isFile(), true)

  const unreferencedResponse = await register(registrationFixture({
    employeeId: '893456',
    lastName: 'UnreferencedDelete',
    photoDataUrl: await pngDataUrl(),
  }))
  const unreferenced = await unreferencedResponse.json()
  assert.equal(unreferencedResponse.status, 200, JSON.stringify(unreferenced))
  const unreferencedPerson = await getLocalPersonById(unreferenced.personId)
  const unreferencedPhotoPath = path.join(getLocalFileStorageRoot(), unreferencedPerson.photoPath)

  const deleted = await deletePerson(
    sameOriginRequest(`/api/persons/${unreferenced.personId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie() },
      body: { command: 'hardDelete', confirmation: unreferencedPerson.name },
    }),
    { params: Promise.resolve({ personId: unreferenced.personId }) },
  )
  const deletedPayload = await deleted.json()
  assert.equal(deleted.status, 200, JSON.stringify(deletedPayload))
  assert.equal(deletedPayload.hardDeleted, true)
  assert.equal(await getLocalPersonById(unreferenced.personId), null)
  assert.equal(Number((await queryPostgres(
    'SELECT count(*)::integer AS count FROM biometric_index WHERE person_id = $1',
    [unreferenced.personId],
  )).rows[0].count), 0)
  await assert.rejects(
    queryPostgres(`
      INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key)
      VALUES ($1, '', $2, 'Deleted employee', 'checkin', 1787260800000, '2026-08-21')
    `, [`orphan-after-hard-delete-${unreferenced.personId}`, unreferenced.personId]),
    error => error?.code === '23503',
  )
  await assert.rejects(stat(unreferencedPhotoPath), error => error?.code === 'ENOENT')
  const audit = await queryPostgres(`
    SELECT actor_scope, action
    FROM audit_logs
    WHERE target_id = $1 AND action = 'person_hard_delete'
  `, [unreferenced.personId])
  assert.deepEqual(audit.rows[0], { actor_scope: 'regional', action: 'person_hard_delete' })

  const retryRelativePath = `photos/enrollments/retry-${unreferenced.personId}.jpg`
  const retryAbsolutePath = path.join(getLocalFileStorageRoot(), ...retryRelativePath.split('/'))
  await writeFile(retryAbsolutePath, 'queued-photo-cleanup')
  await queryPostgres(
    `
      INSERT INTO enrollment_photo_deletion_jobs (person_id, photo_path, claim_token, claimed_at)
      VALUES ($1, $2, 'other-cleanup-worker', now())
    `,
    [unreferenced.personId, retryRelativePath],
  )
  const leasedRetry = await deletePerson(
    sameOriginRequest(`/api/persons/${unreferenced.personId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie() },
      body: { command: 'hardDelete', confirmation: unreferencedPerson.name },
    }),
    { params: Promise.resolve({ personId: unreferenced.personId }) },
  )
  const leasedPayload = await leasedRetry.json()
  assert.equal(leasedRetry.status, 202, JSON.stringify(leasedPayload))
  assert.equal(leasedPayload.cleanup.completed, 0)
  assert.equal((await stat(retryAbsolutePath)).isFile(), true)

  await queryPostgres(
    "UPDATE enrollment_photo_deletion_jobs SET claimed_at = now() - interval '10 minutes' WHERE person_id = $1",
    [unreferenced.personId],
  )
  const retried = await deletePerson(
    sameOriginRequest(`/api/persons/${unreferenced.personId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie() },
      body: { command: 'hardDelete', confirmation: unreferencedPerson.name },
    }),
    { params: Promise.resolve({ personId: unreferenced.personId }) },
  )
  const retriedPayload = await retried.json()
  assert.equal(retried.status, 200, JSON.stringify(retriedPayload))
  assert.equal(retriedPayload.completed, true)
  assert.equal(retriedPayload.cleanup.completed, 1)
  await assert.rejects(stat(retryAbsolutePath), error => error?.code === 'ENOENT')
})

test('hard deletion queues the photo path from the locked person snapshot', async () => {
  const response = await register(registrationFixture({
    employeeId: '903456',
    lastName: 'ConcurrentPhotoDelete',
    photoDataUrl: await pngDataUrl(),
  }))
  const registered = await response.json()
  assert.equal(response.status, 200, JSON.stringify(registered))
  const before = await getLocalPersonById(registered.personId)
  const oldAbsolutePath = path.join(getLocalFileStorageRoot(), ...before.photoPath.split('/'))
  const client = await getPostgresPool().connect()
  let savedPhoto
  let deletePromise
  try {
    await client.query('BEGIN')
    savedPhoto = await saveNormalizedEnrollmentPhoto(
      registered.personId,
      await normalizeDataImage(await pngDataUrl({ width: 3, height: 3 })),
      { client },
    )
    const newAbsolutePath = path.join(getLocalFileStorageRoot(), ...savedPhoto.path.split('/'))
    deletePromise = deletePerson(
      sameOriginRequest(`/api/persons/${registered.personId}`, {
        method: 'DELETE',
        headers: { cookie: adminCookie() },
        body: { command: 'hardDelete', confirmation: before.name },
      }),
      { params: Promise.resolve({ personId: registered.personId }) },
    )

    let lockObserved = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const activity = await queryPostgres(`
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%FROM persons WHERE id = $1 LIMIT 1 FOR UPDATE%'
        LIMIT 1
      `)
      if (activity.rowCount > 0) {
        lockObserved = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.equal(lockObserved, true, 'hard delete should wait for the concurrent photo update lock')
    await client.query('COMMIT')
    await savedPhoto.finalize()

    const deleted = await deletePromise
    const payload = await deleted.json()
    assert.equal(deleted.status, 200, JSON.stringify(payload))
    assert.equal(payload.hardDeleted, true)
    await assert.rejects(stat(newAbsolutePath), error => error?.code === 'ENOENT')
    await assert.rejects(stat(oldAbsolutePath), error => error?.code === 'ENOENT')
    const pending = await queryPostgres(
      'SELECT count(*)::integer AS count FROM enrollment_photo_deletion_jobs WHERE person_id = $1',
      [registered.personId],
    )
    assert.equal(pending.rows[0].count, 0)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    await savedPhoto?.cleanup?.()
    await deletePromise?.catch?.(() => {})
    throw error
  } finally {
    client.release()
  }
})

test('PostgreSQL rate limits hash identities and persist window counts', async () => {
  const key = 'public-registration:Sensitive.User@example.test'
  const nowMs = Date.parse('2026-08-21T01:02:03.000Z')
  const first = await consumePostgresRateLimit({ key, limit: 2, windowMs: 60_000, nowMs })
  const second = await consumePostgresRateLimit({ key, limit: 2, windowMs: 60_000, nowMs })
  const blocked = await consumePostgresRateLimit({ key, limit: 2, windowMs: 60_000, nowMs })

  assert.deepEqual(
    [first.ok, second.ok, blocked.ok],
    [true, true, false],
  )
  assert.equal(first.backend, 'postgres')
  assert.equal(second.remaining, 0)
  assert.equal(blocked.remaining, 0)
  assert.equal(blocked.resetAt, nowMs - (nowMs % 60_000) + 60_000)

  const rows = await queryPostgres(`
    SELECT key_hash, request_count
    FROM request_rate_limits
    WHERE key_hash = $1
  `, [hashRateLimitKey(key)])
  assert.equal(rows.rowCount, 1)
  assert.equal(rows.rows[0].request_count, 3)
  assert.equal(rows.rows[0].key_hash.length, 64)
  assert.notEqual(rows.rows[0].key_hash, key)
})

test('parallel PostgreSQL rate limits clean expired identities without row contention', async () => {
  await queryPostgres(`
    INSERT INTO request_rate_limits (key_hash, window_start, request_count, expires_at)
    SELECT
      md5('expired-rate-limit-' || value::text),
      now() - interval '2 hours' - (value * interval '1 second'),
      1,
      now() - interval '1 hour'
    FROM generate_series(1, 250) AS value
  `)
  await Promise.all(Array.from({ length: 4 }, (_, index) => consumePostgresRateLimit({
    key: `rate-limit-cleanup-trigger-${index}`,
    limit: 2,
    windowMs: 60_000,
  })))
  const expired = await queryPostgres(`
    SELECT count(*)::integer AS count
    FROM request_rate_limits
    WHERE expires_at <= now()
  `)
  assert.equal(expired.rows[0].count, 0)
})

test('forwarded client IP is ignored unless the SmartASP proxy is trusted', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousTrustProxy = process.env.TRUST_SMARTASP_PROXY
  const request = sameOriginRequest('/api/attendance/v2', {
    headers: {
      'x-forwarded-for': '203.0.113.50, 10.0.0.2',
      'x-real-ip': '203.0.113.51',
    },
  })
  try {
    process.env.NODE_ENV = 'production'
    delete process.env.TRUST_SMARTASP_PROXY
    assert.equal(getRequestIp(request), 'rate-limit-ip-unavailable')
    process.env.TRUST_SMARTASP_PROXY = 'true'
    assert.equal(getRequestIp(request), '203.0.113.50')
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousTrustProxy === undefined) delete process.env.TRUST_SMARTASP_PROXY
    else process.env.TRUST_SMARTASP_PROXY = previousTrustProxy
  }
})

test('production rate limiting blocks an unavailable client identity before storage', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  let storageCalled = false
  try {
    const result = await enforceRateLimit(null, {
      key: 'login-ip:rate-limit-ip-unavailable',
      limit: 15,
      windowMs: 600_000,
    }, {
      consume: async () => {
        storageCalled = true
        return { ok: true, remaining: 14, backend: 'postgres' }
      },
    })
    assert.equal(storageCalled, false)
    assert.deepEqual(result, { ok: false, remaining: 0, backend: 'identity-unavailable' })
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('production rate limiting fails closed when PostgreSQL is unavailable', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const result = await enforceRateLimit(null, {
      key: 'production-fail-closed',
      limit: 5,
      windowMs: 60_000,
    }, {
      consume: async () => {
        throw Object.assign(new Error('simulated database outage'), { code: 'ECONNREFUSED' })
      },
    })
    assert.deepEqual(result, { ok: false, remaining: 0, backend: 'unavailable' })
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('missing Employee ID does not bypass duplicate face rejection', async () => {
  const candidateResponse = await register(registrationFixture({
    employeeId: '923456',
    lastName: 'DuplicateSource',
    photoDataUrl: await pngDataUrl(),
  }))
  const candidate = await candidateResponse.json()
  assert.equal(candidateResponse.status, 200, JSON.stringify(candidate))
  const activated = await updatePerson(
    sameOriginRequest(`/api/persons/${candidate.personId}`, {
      method: 'PUT',
      headers: { cookie: adminCookie() },
      body: {
        command: 'transitionLifecycle',
        lifecycleStatus: 'active',
        reason: 'Activate duplicate test source',
      },
    }),
    { params: Promise.resolve({ personId: candidate.personId }) },
  )
  assert.equal(activated.status, 200, JSON.stringify(await activated.clone().json()))

  const source = await queryPostgres(
    `
      SELECT descriptor
      FROM biometric_index
      WHERE person_id = $1
      ORDER BY sample_index
    `,
    [candidate.personId],
  )
  assert.equal(source.rowCount, 8)
  const response = await register(
    registrationFixture({ employeeId: '', lastName: 'DuplicateFace', photoDataUrl: await pngDataUrl() }),
    {
      buildAuthoritativeEnrollmentPayload: async () => ({
        descriptors: source.rows.map(row => row.descriptor),
        captureMetadata: { qualityScore: 0.9 },
        biometricModelVersion: 'route-test-model-v1',
        diagnostics: {},
      }),
    },
  )
  const payload = await response.json()
  assert.equal(response.status, 409, JSON.stringify(payload))
  assert.equal(payload.message, 'This registration matches an existing employee record and cannot be submitted again.')
})

test('re-enrollment is bound to person ID and preserves employee ownership fields', async () => {
  const personAResponse = await register(registrationFixture({
    employeeId: '933001',
    lastName: 'ReenrollA',
    photoDataUrl: await pngDataUrl(),
  }))
  const personBResponse = await register(registrationFixture({
    employeeId: '933002',
    lastName: 'ReenrollB',
    photoDataUrl: await pngDataUrl(),
  }))
  const personA = await personAResponse.json()
  const personB = await personBResponse.json()
  assert.equal(personAResponse.status, 200, JSON.stringify(personA))
  assert.equal(personBResponse.status, 200, JSON.stringify(personB))

  await queryPostgres(
    `UPDATE persons SET employee_id = '955555', employee_id_lower = '955555' WHERE id = ANY($1::text[])`,
    [[personA.personId, personB.personId]],
  )
  const tokenA = createEmployeeViewSessionCookieValue({
    personId: personA.personId,
    employeeId: '955555',
    officeId: office.id,
  })
  const forbidden = await reenrollPerson(
    sameOriginRequest(`/api/persons/${personB.personId}/reenroll`, {
      method: 'POST',
      headers: { 'x-employee-view-session': tokenA },
      body: {},
    }),
    { params: Promise.resolve({ personId: personB.personId }) },
  )
  const forbiddenPayload = await forbidden.json()
  assert.equal(forbidden.status, 403, JSON.stringify(forbiddenPayload))
  assert.equal(forbiddenPayload.code, 'reenrollment_forbidden')

  const missingTarget = await reenrollPerson(
    sameOriginRequest('/api/persons/person-that-does-not-exist/reenroll', {
      method: 'POST',
      headers: { 'x-employee-view-session': tokenA },
      body: {},
    }),
    { params: Promise.resolve({ personId: 'person-that-does-not-exist' }) },
  )
  const missingTargetPayload = await missingTarget.json()
  assert.equal(missingTarget.status, 403, JSON.stringify(missingTargetPayload))
  assert.equal(missingTargetPayload.code, 'reenrollment_forbidden')

  await queryPostgres(
    `
      INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key)
      VALUES ('reenroll-preserved-attendance', '955555', $1, 'ReenrollA, Test', 'checkin', 1787260800000, '2026-08-21')
    `,
    [personA.personId],
  )
  const coreBefore = await queryPostgres(
    `
      SELECT employee_id, name, position, office_id, division_id, lifecycle_status,
             active, approval_status, access_code, submitted_at, approved_at
      FROM persons WHERE id = $1
    `,
    [personA.personId],
  )
  const attendanceBefore = await queryPostgres(
    `SELECT * FROM attendance WHERE person_id = $1 ORDER BY id`,
    [personA.personId],
  )
  const auditBefore = await queryPostgres(
    `SELECT id FROM audit_logs WHERE target_id = $1 ORDER BY id`,
    [personA.personId],
  )

  const handler = createPersonReenrollHandler({
    buildAuthoritativeEnrollmentPayload: async () => ({
      descriptors: Array.from({ length: 8 }, (_, sampleIndex) => (
        Array.from({ length: 128 }, (_, dimension) => (dimension === 120 + sampleIndex ? 1 : 0))
      )),
      captureMetadata: { qualityScore: 0.97 },
      biometricModelVersion: 'route-test-reenroll-v2',
    }),
  })
  const updated = await handler(
    sameOriginRequest(`/api/persons/${personA.personId}/reenroll`, {
      method: 'POST',
      headers: { 'x-employee-view-session': tokenA },
      body: { sampleFrames: [], captureMetadata: {}, photoDataUrl: await pngDataUrl() },
    }),
    { params: Promise.resolve({ personId: personA.personId }) },
  )
  const updatedPayload = await updated.json()
  assert.equal(updated.status, 200, JSON.stringify(updatedPayload))

  const coreAfter = await queryPostgres(
    `
      SELECT employee_id, name, position, office_id, division_id, lifecycle_status,
             active, approval_status, access_code, submitted_at, approved_at
      FROM persons WHERE id = $1
    `,
    [personA.personId],
  )
  assert.deepEqual(coreAfter.rows[0], coreBefore.rows[0])
  const attendanceAfter = await queryPostgres(
    `SELECT * FROM attendance WHERE person_id = $1 ORDER BY id`,
    [personA.personId],
  )
  assert.deepEqual(attendanceAfter.rows, attendanceBefore.rows)
  const biometric = await queryPostgres(
    `SELECT sample_count, photo_content_type, data->>'biometricModelVersion' AS model_version FROM persons WHERE id = $1`,
    [personA.personId],
  )
  assert.deepEqual(biometric.rows[0], {
    sample_count: 8,
    photo_content_type: 'image/jpeg',
    model_version: 'route-test-reenroll-v2',
  })
  const auditAfter = await queryPostgres(
    `SELECT id, action FROM audit_logs WHERE target_id = $1 ORDER BY id`,
    [personA.personId],
  )
  assert.deepEqual(auditAfter.rows.slice(0, auditBefore.rowCount).map(row => row.id), auditBefore.rows.map(row => row.id))
  assert.equal(auditAfter.rowCount, auditBefore.rowCount + 1)
  assert.equal(auditAfter.rows.at(-1).action, 'person_self_reenroll')
})

test('failed biometric refresh rolls back database and photo replacement', async () => {
  const response = await register(registrationFixture({
    employeeId: '944001',
    lastName: 'Rollback',
    photoDataUrl: await pngDataUrl(),
  }))
  const enrolled = await response.json()
  assert.equal(response.status, 200, JSON.stringify(enrolled))

  const before = await queryPostgres(
    `SELECT descriptors, sample_count, photo_path, photo_content_type, data FROM persons WHERE id = $1`,
    [enrolled.personId],
  )
  const beforeRow = before.rows[0]
  const photoRoot = path.join(getLocalFileStorageRoot(), 'photos', 'enrollments')
  const beforeFiles = (await readdir(photoRoot)).sort()
  const previousPhoto = await readFile(path.join(getLocalFileStorageRoot(), beforeRow.photo_path))
  const auditBefore = await queryPostgres('SELECT count(*)::integer AS count FROM audit_logs WHERE target_id = $1', [enrolled.personId])
  const biometricIndexBefore = await queryPostgres(
    'SELECT * FROM biometric_index WHERE person_id = $1 ORDER BY sample_index',
    [enrolled.personId],
  )

  await assert.rejects(
    refreshLocalPersonBiometrics(enrolled.personId, {
      descriptors: Array.from({ length: 8 }, (_, index) => seededDescriptor(9000 + index)),
      normalizedPhoto: await normalizeDataImage(await pngDataUrl({ width: 3, height: 3 })),
      captureMetadata: { qualityScore: 0.98 },
      biometricModelVersion: 'route-test-rollback-v2',
      auditEntry: {
        action: 'person_test_rollback',
        metadata: { forceLateFailure: 1n },
      },
    }),
    /BigInt|serialize/i,
  )

  const after = await queryPostgres(
    `SELECT descriptors, sample_count, photo_path, photo_content_type, data FROM persons WHERE id = $1`,
    [enrolled.personId],
  )
  assert.deepEqual(after.rows[0], beforeRow)
  assert.deepEqual(await readFile(path.join(getLocalFileStorageRoot(), beforeRow.photo_path)), previousPhoto)
  assert.deepEqual((await readdir(photoRoot)).sort(), beforeFiles)
  const auditAfter = await queryPostgres('SELECT count(*)::integer AS count FROM audit_logs WHERE target_id = $1', [enrolled.personId])
  assert.equal(auditAfter.rows[0].count, auditBefore.rows[0].count)
  const biometricIndexAfter = await queryPostgres(
    'SELECT * FROM biometric_index WHERE person_id = $1 ORDER BY sample_index',
    [enrolled.personId],
  )
  assert.deepEqual(biometricIndexAfter.rows, biometricIndexBefore.rows)
})

test('employee view sessions allow optional Employee ID but require canonical person ID', () => {
  const token = createEmployeeViewSessionCookieValue({ personId: 'person-without-employee-id', employeeId: '' })
  assert.equal(typeof token, 'string')
  assert.throws(
    () => createEmployeeViewSessionCookieValue({ employeeId: '955555' }),
    /person ID is required/i,
  )
})

test('employee with no Employee ID can load attendance by canonical session person ID', async () => {
  const response = await register(registrationFixture({
    employeeId: '',
    lastName: 'OptionalId',
    photoDataUrl: await pngDataUrl(),
  }))
  const enrolled = await response.json()
  assert.equal(response.status, 200, JSON.stringify(enrolled))
  await queryPostgres(
    `
      INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key, date_label, time_label)
      VALUES ('optional-id-attendance', '', $1, 'OptionalId, Test', 'checkout', $2, '2026-08-21', 'August 21, 2026', '11:58 AM')
    `,
    [enrolled.personId, Date.parse('2026-08-21T11:58:00+08:00')],
  )
  const token = createEmployeeViewSessionCookieValue({ personId: enrolled.personId, employeeId: '' })
  const attendance = await getAttendanceTable(sameOriginRequest('/api/attendance/table?month=8&year=2026', {
    headers: { 'x-employee-view-session': token },
  }))
  const payload = await attendance.json()
  assert.equal(attendance.status, 200, JSON.stringify(payload))
  assert.equal(payload.personId, enrolled.personId)
  assert.equal(payload.employeeId, '')
  assert.equal(payload.totalLogs, 1)
  assert.equal(payload.days[0].amIn, '--')
  assert.notEqual(payload.days[0].amOut, '--')

  await queryPostgres(
    `INSERT INTO holidays (id, holiday_date, name, scope_type, office_id, division_id, remarks)
     VALUES ('optional-id-holiday', '2026-08-18', 'Route Test Holiday', 'office', $1, '', 'DTR route proof')`,
    [office.id],
  )
  await queryPostgres(
    `INSERT INTO employee_leaves (id, person_id, leave_type, start_date, end_date, remarks)
     VALUES ('optional-id-leave', $1, 'SL', '2026-08-19', '2026-08-19', 'DTR route proof')`,
    [enrolled.personId],
  )
  await queryPostgres(
    `INSERT INTO official_orders (id, person_id, order_type, order_number, start_date, end_date, remarks)
     VALUES ('optional-id-order', $1, 'Regional Order', 'ROUTE-DTR-1', '2026-08-20', '2026-08-20', 'DTR route proof')`,
    [enrolled.personId],
  )

  const dtr = await getAttendanceDtr(sameOriginRequest('/api/attendance/dtr?month=8&year=2026', {
    headers: { 'x-employee-view-session': token },
  }))
  assert.equal(dtr.status, 200, await dtr.clone().text())
  assert.match(String(dtr.headers.get('content-type') || ''), /spreadsheetml/)
  const workbook = unzipSync(new Uint8Array(await dtr.arrayBuffer()))
  const workbookXml = strFromU8(workbook['xl/workbook.xml'])
  const dtrXml = strFromU8(workbook['xl/worksheets/sheet1.xml'])
  const cellXml = reference => dtrXml.match(new RegExp(`<c r="${reference}"[^>]*>[\\s\\S]*?</c>`))?.[0] || ''
  assert.match(workbookXml, /Time Log Details/)
  assert.match(cellXml('B28'), /<t>HOLIDAY<\/t>/)
  assert.match(cellXml('B29'), /<t>SL<\/t>/)
  assert.match(cellXml('B30'), /<t>OB<\/t>/)
})

test('attendance correction creates and deletes a scoped manual entry with daily projection and audit', async () => {
  const response = await register(registrationFixture({
    employeeId: '799001',
    lastName: 'Correction',
    photoDataUrl: await pngDataUrl(),
  }))
  const enrolled = await response.json()
  assert.equal(response.status, 200, JSON.stringify(enrolled))
  await transitionLifecycle(enrolled.personId, 'active', 'Activate attendance correction test employee')

  const timestamp = Date.parse('2026-08-22T08:00:00+08:00')
  const createResponse = await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', {
    method: 'POST',
    headers: { cookie: adminCookie() },
    body: {
      employeeId: '799001',
      personId: enrolled.personId,
      name: 'Correction, Test',
      officeId: office.id,
      officeName: office.name,
      action: 'checkin',
      manualSlot: 'amIn',
      timestamp,
      dateKey: '2026-08-22',
      reason: 'Route-test correction',
    },
  }))
  const created = await createResponse.json()
  assert.equal(createResponse.status, 200, JSON.stringify(created))
  assert.ok(created.attendanceId)

  const stored = await queryPostgres(
    "SELECT data->>'source' AS source, person_id, date_key FROM attendance WHERE id = $1",
    [created.attendanceId],
  )
  assert.deepEqual(stored.rows[0], {
    source: 'manual_override',
    person_id: enrolled.personId,
    date_key: '2026-08-22',
  })
  const daily = await queryPostgres(
    'SELECT log_count, data FROM attendance_daily WHERE person_id = $1 AND date_key = $2',
    [enrolled.personId, '2026-08-22'],
  )
  assert.equal(daily.rows[0]?.log_count, 1)
  assert.equal(daily.rows[0]?.data?.personId, enrolled.personId)

  const deleteResponse = await deleteAttendanceCorrection(
    sameOriginRequest(`/api/admin/attendance/${created.attendanceId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie() },
    }),
    { params: Promise.resolve({ attendanceId: created.attendanceId }) },
  )
  assert.equal(deleteResponse.status, 200, await deleteResponse.clone().text())
  assert.equal((await queryPostgres('SELECT count(*)::integer AS count FROM attendance WHERE id = $1', [created.attendanceId])).rows[0].count, 0)
  const audit = await queryPostgres(
    "SELECT action FROM audit_logs WHERE target_id = $1 AND action IN ('attendance_override_add', 'attendance_override_delete') ORDER BY created_at",
    [created.attendanceId],
  )
  assert.deepEqual(audit.rows.map(row => row.action), ['attendance_override_add', 'attendance_override_delete'])
})

test('daily-summary cron rejects wrong authorization and rebuilds yesterday through PostgreSQL', async () => {
  const previousSecret = process.env.CRON_SECRET
  try {
    delete process.env.CRON_SECRET
    const missingSecret = await rebuildDailySummary(new Request('http://127.0.0.1:3000/api/cron/rebuild-daily-summary', {
      headers: { authorization: 'Bearer undefined' },
    }))
    assert.equal(missingSecret.status, 401)

    process.env.CRON_SECRET = 'route-test-cron-secret'
    const unauthorized = await rebuildDailySummary(new Request('http://127.0.0.1:3000/api/cron/rebuild-daily-summary', {
      headers: { authorization: 'Bearer wrong-secret' },
    }))
    assert.equal(unauthorized.status, 401)

    const response = await register(registrationFixture({
      employeeId: '799002',
      lastName: 'Cron',
      photoDataUrl: await pngDataUrl(),
    }))
    const enrolled = await response.json()
    assert.equal(response.status, 200, JSON.stringify(enrolled))
    const dateKey = formatAttendanceDateKey(new Date(Date.now() - 86400000))
    const timestamp = Date.parse(`${dateKey}T08:00:00+08:00`)
    await queryPostgres(
      `
        INSERT INTO attendance (
          id, employee_id, person_id, name, action, timestamp_ms, date_key,
          date_label, time_label, office_id, office_name
        ) VALUES ($1, $2, $3, $4, 'checkin', $5, $6, $6, '8:00 AM', $7, $8)
      `,
      ['route-test-cron-attendance', '799002', enrolled.personId, 'Cron, Test', timestamp, dateKey, office.id, office.name],
    )

    const authorized = await rebuildDailySummary(new Request('http://127.0.0.1:3000/api/cron/rebuild-daily-summary', {
      headers: { authorization: 'Bearer route-test-cron-secret' },
    }))
    const payload = await authorized.json()
    assert.equal(authorized.status, 200, JSON.stringify(payload))
    assert.ok(payload.rebuilt >= 1)
    const daily = await queryPostgres(
      'SELECT log_count, data FROM attendance_daily WHERE person_id = $1 AND date_key = $2',
      [enrolled.personId, dateKey],
    )
    assert.equal(daily.rows[0]?.log_count, 1)
    assert.equal(daily.rows[0]?.data?.personId, enrolled.personId)
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousSecret
  }
})

test('kiosk persists the matched person ID and rejects unsafe submissions without attendance writes', async () => {
  const personAResponse = await register(registrationFixture({
    employeeId: '',
    lastName: 'KioskA',
    photoDataUrl: await pngDataUrl(),
  }))
  const personBResponse = await register(registrationFixture({
    employeeId: '',
    lastName: 'KioskB',
    photoDataUrl: await pngDataUrl(),
  }))
  const pendingResponse = await register(registrationFixture({
    employeeId: '',
    lastName: 'KioskPending',
    photoDataUrl: await pngDataUrl(),
  }))
  const personARegistration = await personAResponse.json()
  const personBRegistration = await personBResponse.json()
  const pendingRegistration = await pendingResponse.json()
  assert.equal(personAResponse.status, 200, JSON.stringify(personARegistration))
  assert.equal(personBResponse.status, 200, JSON.stringify(personBRegistration))
  assert.equal(pendingResponse.status, 200, JSON.stringify(pendingRegistration))
  await transitionLifecycle(personARegistration.personId, 'active', 'Activate canonical kiosk identity test')

  const personA = await getLocalPersonById(personARegistration.personId)
  const pendingPerson = await getLocalPersonById(pendingRegistration.personId)
  const validLivenessEvidence = {
    earSamples: [0.24, 0.17, 0.25],
    meshDeltas: [0.31, 0.29],
    irisDeltas: [0.22, 0.24],
    avgAntispoof: 0.92,
    avgLiveness: 0.88,
    hasEyeSignal: true,
    hasMotionSignal: true,
    frameCount: 3,
    pass: true,
  }
  const authoritativeDescriptor = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0))
  let matchedPerson = personA
  const services = {
    buildAuthoritativeAttendancePayload: async () => ({
      descriptor: authoritativeDescriptor,
      descriptors: [authoritativeDescriptor, authoritativeDescriptor],
      descriptorSpread: 0.1,
      antispoof: 0.92,
      liveness: 0.88,
      acceptedFrames: [],
      rejectedFrames: [],
      processedCount: 2,
      diagnostics: {
        modelVersion: 'route-test-attendance-model-v1',
        acceptedCount: 2,
        rejectedCount: 0,
        averagePerformanceMs: 1,
      },
    }),
    findClaimedEmployeeMatch: async (_db, _offices, _descriptor, options = {}) => {
      if (options.entry?.employeeId === '0000') {
        return { ok: false, decisionCode: 'blocked_unknown_access_code', message: 'Access code was not found.' }
      }
      return {
        ok: true,
        person: matchedPerson,
        personId: matchedPerson.id,
        confidence: 0.99,
        decisionCode: 'matched_person',
        debug: {},
      }
    },
  }
  const postAttendance = createAttendanceV2PostHandler({ services })

  const buildBody = (accessCode, overrides = {}) => ({
    employeeId: accessCode,
    name: 'Client-supplied identity',
    officeId: 'client-supplied-office',
    officeName: 'Client-supplied office',
    latitude: 6.1164,
    longitude: 125.1716,
    scanFrames: [
      { frameDataUrl: 'data:image/jpeg;base64,AAA' },
      { frameDataUrl: 'data:image/jpeg;base64,BBB' },
    ],
    captureContext: {
      capturePolicyVersion: 'scan-v4',
      verificationFrames: 3,
      trackWidth: 720,
      trackHeight: 1280,
      trackFacingMode: 'user',
      mobile: false,
    },
    scanDiagnostics: { strictFrames: 3, descriptorSpread: 0.1 },
    livenessEvidence: validLivenessEvidence,
    kioskContext: { kioskId: 'route-test-kiosk', source: 'web-scan' },
    ...overrides,
  })
  const submit = async (body, handler = postAttendance) => {
    const challenge = await issueAttendanceChallenge(null, {
      employeeId: body.employeeId,
      kioskId: body.kioskContext.kioskId,
      source: body.kioskContext.source,
    })
    return handler(sameOriginRequest('/api/attendance/v2', {
      method: 'POST',
      body: { ...body, challenge },
    }))
  }
  const attendanceCount = async () => Number((await queryPostgres('SELECT count(*)::integer AS count FROM attendance')).rows[0].count)

  const countBefore = await attendanceCount()
  const accepted = await submit(buildBody(personBRegistration.accessCode))
  const acceptedPayload = await accepted.json()
  assert.equal(accepted.status, 200, JSON.stringify(acceptedPayload))
  assert.equal(acceptedPayload.entry.personId, personA.id)
  assert.equal(acceptedPayload.entry.employeeId, '')
  assert.equal(await attendanceCount(), countBefore + 1)
  const stored = await queryPostgres('SELECT * FROM attendance ORDER BY created_at DESC LIMIT 1')
  assert.equal(stored.rows[0].person_id, personA.id)
  assert.equal(stored.rows[0].employee_id, '')
  assert.equal(stored.rows[0].name, personA.name)
  assert.equal(stored.rows[0].office_id, personA.officeId)
  assert.equal(stored.rows[0].office_name, office.name)
  const storedDaily = await queryPostgres('SELECT person_id, employee_id FROM attendance_daily WHERE person_id = $1', [personA.id])
  assert.deepEqual(storedDaily.rows[0], { person_id: personA.id, employee_id: '' })
  const acceptedScan = await queryPostgres(
    `SELECT person_id, employee_id FROM scan_events WHERE status = 'accepted' ORDER BY id DESC LIMIT 1`,
  )
  assert.deepEqual(acceptedScan.rows[0], { person_id: personA.id, employee_id: '' })
  assert.equal(parseEmployeeViewSessionCookieValue(acceptedPayload.employeeViewSession)?.personId, personA.id)
  const lock = await queryPostgres('SELECT * FROM attendance_locks WHERE employee_id = $1', [personA.id])
  assert.equal(lock.rowCount, 1)

  const expectBlockedWithoutWrite = async (body, expectedStatus, expectedDecisionCode) => {
    const before = await attendanceCount()
    const response = await submit(body)
    const payload = await response.json()
    assert.equal(response.status, expectedStatus, JSON.stringify(payload))
    assert.equal(payload.decisionCode, expectedDecisionCode)
    assert.equal(await attendanceCount(), before)
  }

  await expectBlockedWithoutWrite(buildBody('0000'), 403, 'blocked_unknown_access_code')
  matchedPerson = { ...personA, active: false }
  await expectBlockedWithoutWrite(buildBody(personARegistration.accessCode), 403, 'blocked_inactive')
  matchedPerson = pendingPerson
  await expectBlockedWithoutWrite(buildBody(pendingRegistration.accessCode), 403, 'blocked_pending_approval')
  const productionMatcherPost = createAttendanceV2PostHandler({
    services: { buildAuthoritativeAttendancePayload: services.buildAuthoritativeAttendancePayload },
  })
  const beforeProductionPending = await attendanceCount()
  const productionPending = await submit(buildBody(pendingRegistration.accessCode), productionMatcherPost)
  const productionPendingPayload = await productionPending.json()
  assert.equal(productionPending.status, 403, JSON.stringify(productionPendingPayload))
  assert.equal(productionPendingPayload.decisionCode, 'blocked_pending_approval')
  assert.equal(await attendanceCount(), beforeProductionPending)
  matchedPerson = personA
  await expectBlockedWithoutWrite(buildBody(personARegistration.accessCode), 409, 'blocked_recent_duplicate')
  const cooldownScan = await queryPostgres(
    `SELECT person_id, employee_id FROM scan_events WHERE decision_code = 'blocked_recent_duplicate' ORDER BY id DESC LIMIT 1`,
  )
  assert.deepEqual(cooldownScan.rows[0], { person_id: personA.id, employee_id: '' })
  matchedPerson = { ...personA, id: '' }
  await expectBlockedWithoutWrite(buildBody(personARegistration.accessCode), 403, 'blocked_no_reliable_match')
  matchedPerson = personA
  await expectBlockedWithoutWrite(buildBody(personARegistration.accessCode, {
    livenessEvidence: {
      earSamples: [0.25, 0.25, 0.25],
      meshDeltas: [0.34, 0.39],
      irisDeltas: [0.02, 0.03],
      avgAntispoof: 0.82,
      avgLiveness: 0.74,
      frameCount: 3,
    },
  }), 403, 'blocked_liveness')
  await expectBlockedWithoutWrite(buildBody(personARegistration.accessCode, {
    latitude: 0,
    longitude: 0,
  }), 403, 'blocked_geofence')
})
