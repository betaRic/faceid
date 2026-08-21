import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { normalizeDataImage } from '../../lib/images/safe-data-image.js'
import { createPersonsPostHandler } from '../../lib/routes/persons-route.js'
import { closePostgresPool, queryPostgres } from '../../lib/postgres/client.js'
import { enrollLocalPerson, refreshLocalPersonBiometrics } from '../../lib/postgres/person-store.js'
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
} from '../../lib/employee-view-auth.js'
import { GET as getPersons } from '../../app/api/persons/route.js'
import { PUT as updatePerson } from '../../app/api/persons/[personId]/route.js'
import {
  createPersonReenrollHandler,
  POST as reenrollPerson,
} from '../../app/api/persons/[personId]/reenroll/route.js'
import { GET as getAttendanceTable } from '../../app/api/attendance/table/route.js'
import { GET as getAttendanceDtr } from '../../app/api/attendance/dtr/route.js'

const office = {
  id: 'office-route-test',
  name: 'Route Test Field Office',
  officeType: 'Field Office',
  divisions: [],
}
let registrationSequence = 0

before(async () => {
  process.env.ADMIN_SESSION_SECRET = 'route-test-admin-session-secret'
  process.env.EMPLOYEE_VIEW_SESSION_SECRET = 'route-test-employee-session-secret'
  await queryPostgres(`
    INSERT INTO offices (id, name, name_lower, office_type, divisions)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [office.id, office.name, office.name.toLowerCase(), office.officeType, '[]'])
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

function adminCookie() {
  const value = createAdminSessionCookieValue({
    email: 'route-test-admin@example.test',
    uid: 'route-test-admin',
    scope: 'regional',
  })
  return `${getAdminSessionCookieName()}=${value}`
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
