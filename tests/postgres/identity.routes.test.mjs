import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
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
} from '../../lib/admin-auth.js'
import {
  createEmployeeViewSessionCookieValue,
  parseEmployeeViewSessionCookieValue,
} from '../../lib/employee-view-auth.js'
import {
  createHrSessionCookieValue,
  getHrSessionCookieName,
} from '../../lib/hr-auth.js'
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
      VALUES ('optional-id-attendance', '', $1, 'OptionalId, Test', 'checkin', 1787260800000, '2026-08-21', 'August 21, 2026', '8:00 AM')
    `,
    [enrolled.personId],
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

  const dtr = await getAttendanceDtr(sameOriginRequest('/api/attendance/dtr?month=8&year=2026', {
    headers: { 'x-employee-view-session': token },
  }))
  assert.equal(dtr.status, 200, await dtr.clone().text())
  assert.match(String(dtr.headers.get('content-type') || ''), /spreadsheetml/)
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
