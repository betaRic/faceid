import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { strFromU8, unzipSync } from 'fflate'
import sharp from 'sharp'
import { normalizeDataImage } from '../../lib/images/safe-data-image.js'
import { SafeRequestError } from '../../lib/http/server-error.js'
import { buildAuthoritativeEnrollmentPayload } from '../../lib/biometrics/server-enrollment.js'
import * as personsRouteFactories from '../../lib/routes/persons-route.js'
import { closePostgresPool, getPostgresPool, queryPostgres } from '../../lib/postgres/client.js'
import { enrollLocalPerson, getLocalPersonById, refreshLocalPersonBiometrics } from '../../lib/postgres/person-store.js'
import { getLocalAttendanceById } from '../../lib/postgres/report-store.js'
import { upsertLocalDailyAttendanceRecord } from '../../lib/postgres/attendance-store.js'
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
  hrSessionAllowsOffice,
  parseHrSessionCookieValue,
  resolveHrSession,
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
import { GET as getAdminAuditLogs } from '../../app/api/admin/audit-logs/route.js'
import { GET as getReenrollmentCandidates } from '../../app/api/admin/reenrollment-candidates/route.js'
import { GET as getHealth } from '../../app/api/health/route.js'
import {
  DEFAULTS as THRESHOLD_DEFAULTS,
  getActiveThresholdsForUpdate,
} from '../../lib/thresholds.js'
import { isRegionalPinEnabled } from '../../lib/bootstrap-pin.js'
import { GET as getPersons } from '../../app/api/persons/route.js'
import { GET as getPendingCount } from '../../app/api/persons/pending-count/route.js'
import { GET as getRecentAttendance } from '../../app/api/attendance/recent/route.js'
import { GET as getHrEmployees } from '../../app/api/hr/employees/route.js'
import { GET as getHrDtrEmployees } from '../../app/api/hr/dtr/employees/route.js'
import { GET as getHrDtr } from '../../app/api/hr/dtr/route.js'
import { POST as getHrDtrWorkbook } from '../../app/api/hr/dtr/workbook/route.js'
import {
  GET as getWorkforceRecords,
  POST as createWorkforceRecord,
  PATCH as updateWorkforceRecord,
  DELETE as deleteWorkforceRecord,
} from '../../app/api/hr/workforce-records/route.js'
import {
  GET as getPersonPhoto,
  POST as updatePersonPhoto,
} from '../../app/api/persons/[personId]/photo/route.js'
import { POST as regeneratePersonAccessCode } from '../../app/api/persons/[personId]/access-code/route.js'
import * as employeeAccess from '../../lib/employee-access.js'
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
  GET as getAttendanceCorrections,
  POST as createAttendanceCorrection,
} from '../../app/api/admin/attendance/route.js'
import {
  DELETE as deleteAttendanceCorrection,
  PATCH as reviewAttendanceFieldDuty,
} from '../../app/api/admin/attendance/[attendanceId]/route.js'
import { GET as rebuildDailySummary } from '../../app/api/cron/rebuild-daily-summary/route.js'
import { formatAttendanceDateKey } from '../../lib/attendance-time.js'
import { createAttendanceV2PostHandler } from '../../app/api/attendance/v2/route.js'
import { consumePostgresRateLimit, hashRateLimitKey } from '../../lib/postgres/rate-limit-store.js'
import { enforceRateLimit, getRequestIp } from '../../lib/rate-limit.js'
import { normalizeEmployeeNameFields } from '../../lib/person-name.js'
import {
  GET as getHrOfficeSettings,
  PUT as updateHrOfficeSettings,
} from '../../app/api/hr/office-settings/route.js'
import { POST as createHrUser } from '../../app/api/hr-users/route.js'
import { PUT as updateHrUser } from '../../app/api/hr-users/[hrUserId]/route.js'
import { GET as getOffices } from '../../app/api/offices/route.js'
import {
  createPublicOfficesGetHandler,
  GET as getPublicOffices,
} from '../../app/api/public/offices/route.js'

const office = {
  id: 'office-route-test',
  name: 'Route Test Gensan Field Office',
  officeType: 'Field Office',
  divisions: [],
}
const otherOffice = {
  id: 'office-route-test-other',
  name: 'Route Test Cotabato Field Office',
  officeType: 'Field Office',
  divisions: [],
}
const regionalOffice = {
  id: 'regional-office-route-test',
  name: 'Route Test Regional Office',
  officeType: 'Regional Office',
  location: 'Route Test Regional Center',
  provinceOrCity: 'Koronadal City',
  wifiSsid: ['ROUTE-TEST-REGIONAL-WIFI'],
  divisions: [
    { id: 'finance-division', shortName: 'FD', name: 'Finance Division' },
    { id: 'operations-division', shortName: 'OD', name: 'Operations Division' },
  ],
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
    INSERT INTO offices (
      id, name, name_lower, office_type, latitude, longitude, radius_meters, divisions, data
    )
    VALUES ($1, $2, $3, $4, 6.1, 125.1, 500, $5::jsonb, $6::jsonb)
  `, [
    regionalOffice.id,
    regionalOffice.name,
    regionalOffice.name.toLowerCase(),
    regionalOffice.officeType,
    JSON.stringify(regionalOffice.divisions),
    JSON.stringify(regionalOffice),
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
      ('route-test-office-hr', 'route-test-office-hr@example.test', 'route-test-office-hr@example.test', 'Route Test Office HR', 'Route Test Office HR', 'office', $1, true, $3::jsonb),
      ('route-test-other-office-hr', 'route-test-other-office-hr@example.test', 'route-test-other-office-hr@example.test', 'Route Test Cotabato HR', 'Route Test Cotabato HR', 'office', $4, true, $3::jsonb),
      ('route-test-regional-hr', 'route-test-regional-hr@example.test', 'route-test-regional-hr@example.test', 'Route Test Regional HR', 'Route Test Regional HR', 'regional', $2, true, $3::jsonb),
      ('route-test-unassigned-regional-hr', 'route-test-unassigned-regional-hr@example.test', 'route-test-unassigned-regional-hr@example.test', 'Route Test Unassigned Regional HR', 'Route Test Unassigned Regional HR', 'regional', '', true, $3::jsonb)
  `, [office.id, regionalOffice.id, JSON.stringify({ permissions: ['employees', 'summary', 'dtr'] }), otherOffice.id])
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

async function pngDataUrl({
  width = 2,
  height = 2,
  background = { r: 20, g: 80, b: 140, alpha: 1 },
} = {}) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
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
  return personsRouteFactories.createPersonsPostHandler({
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

function assignedOfficeActors() {
  return [
    {
      name: 'Regional HR', officeId: regionalOffice.id,
      cookie: hrCookie({ email: 'route-test-regional-hr@example.test', uid: 'route-test-regional-hr', hrUserId: 'route-test-regional-hr', scope: 'regional', officeId: regionalOffice.id }),
    },
    { name: 'Gensan HR', officeId: office.id, cookie: hrCookie() },
    {
      name: 'Cotabato HR', officeId: otherOffice.id,
      cookie: hrCookie({ email: 'route-test-other-office-hr@example.test', uid: 'route-test-other-office-hr', hrUserId: 'route-test-other-office-hr', officeId: otherOffice.id }),
    },
  ]
}

async function createAssignedOfficePeople(lastName, { active = true } = {}) {
  const people = []
  const photoDataUrl = await pngDataUrl()
  for (const [assignedOffice, divisionId] of [
    [regionalOffice, 'finance-division'], [regionalOffice, 'operations-division'],
    [office, ''], [otherOffice, ''],
  ]) {
    const body = registrationFixture({ lastName: `${lastName}${people.length}`, photoDataUrl })
    Object.assign(body.profile, { officeId: assignedOffice.id, officeName: assignedOffice.name, divisionId })
    const response = await register(body)
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    if (active) await transitionLifecycle(result.personId, 'active')
    people.push(await getLocalPersonById(result.personId))
  }
  return people
}

let assignedOfficeReadFixtures
async function assignedOfficeReads() {
  if (!assignedOfficeReadFixtures) {
    assignedOfficeReadFixtures = (async () => {
      const active = await createAssignedOfficePeople('Assignedreadactive')
      const pending = await createAssignedOfficePeople('Assignedreadpending', { active: false })
      for (const [index, person] of active.entries()) {
        await queryPostgres(`
          INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key, office_id, office_name)
          VALUES ($1, $2, $3, $4, 'checkin', $5, '2026-09-01', $6, $7)
        `, [`assigned-office-attendance-${person.id}`, person.employeeId, person.id, person.name, Date.now() + index, person.officeId, person.officeName])
      }
      return { active, pending, all: [...active, ...pending] }
    })()
  }
  return assignedOfficeReadFixtures
}

async function assertJsonStatus(response, status, label = '') {
  const payload = await response.json()
  assert.equal(response.status, status, `${label}: ${JSON.stringify(payload)}`)
  return payload
}

function assertAssignedRows(rows, actor, expectedPeople, idField = 'id') {
  assert.ok(rows.length > 0, `${actor.name} must retain own-office access`)
  assert.ok(rows.every(row => row.officeId === actor.officeId), `${actor.name} leaked another office`)
  for (const person of expectedPeople.filter(person => person.officeId === actor.officeId)) {
    assert.ok(rows.some(row => row[idField] === person.id), `${actor.name} omitted ${person.name}`)
  }
}

test('cross-office session filter keeps every HR assigned and preserves Regional Admin request filters', () => {
  assert.equal(typeof employeeAccess.getSessionOfficeFilter, 'function')
  const filter = employeeAccess.getSessionOfficeFilter
  for (const scope of ['regional', 'office']) {
    assert.equal(filter({ active: true, role: 'hr', scope, officeId: ' assigned ' }, 'forged'), 'assigned')
  }
  assert.equal(filter({ active: true, role: 'admin', scope: 'regional' }, ' requested '), 'requested')
  assert.equal(filter({ active: true, role: 'admin', scope: 'regional' }), '')
  assert.equal(filter({ active: true, role: 'admin', scope: 'office', officeId: ' assigned ' }, 'forged'), 'assigned')
  assert.equal(filter({ active: false, role: 'hr', scope: 'regional', officeId: 'assigned' }), '')
  assert.equal(filter(null, 'forged'), '')
})

test('cross-office ordinary person directory permits own-office HR and preserves global Admin access', async () => {
  const { all } = await assignedOfficeReads()
  for (const actor of assignedOfficeActors()) {
    const payload = await assertJsonStatus(await getPersons(sameOriginRequest(`/api/persons?officeId=${otherOffice.id}`, { cookie: actor.cookie })), 200, actor.name)
    assertAssignedRows(payload.persons, actor, all)
  }
  const global = await assertJsonStatus(await getPersons(sameOriginRequest('/api/persons', { cookie: adminCookie() })), 200)
  for (const person of all) assert.ok(global.persons.some(row => row.id === person.id))
})

test('cross-office paged person directory fails closed on an out-of-scope query result', async () => {
  assert.equal(typeof personsRouteFactories.createPersonsGetHandler, 'function')
  const handler = personsRouteFactories.createPersonsGetHandler({
    loadLocalPersonDirectory: async () => ({
      persons: [
        { id: 'forced-in-scope-person', officeId: regionalOffice.id },
        { id: 'forced-outside-person', officeId: otherOffice.id },
      ],
      hasMore: true,
      total: 2,
      approved: 2,
      pending: 0,
      rejected: 0,
    }),
  })
  const response = await handler(sameOriginRequest('/api/persons?mode=directory', {
    cookie: assignedOfficeActors()[0].cookie,
  }))
  const payload = await response.json()
  assert.equal(response.status, 403, JSON.stringify(payload))
  assert.equal(payload.persons, undefined)
  assert.equal(payload.page, undefined)
  assert.equal(JSON.stringify(payload).includes('nextCursor'), false)
  assert.equal(JSON.stringify(payload).includes('forced-outside-person'), false)
})

test('cross-office paged person directory ignores forged office filters for HR and narrows Regional divisions', async () => {
  const { all } = await assignedOfficeReads()
  for (const actor of assignedOfficeActors()) {
    const rows = []
    let cursor = ''
    let total
    do {
      const params = new URLSearchParams({ mode: 'directory', q: 'Assignedread', limit: '1', officeId: actor.officeId === office.id ? otherOffice.id : office.id, cursor })
      const payload = await assertJsonStatus(await getPersons(sameOriginRequest(`/api/persons?${params}`, { cookie: actor.cookie })), 200, actor.name)
      total = payload.page.total
      rows.push(...payload.persons)
      cursor = payload.page.hasMore ? payload.page.nextCursor : ''
      assert.ok(rows.length <= all.length, 'directory pagination must terminate without repeated pages')
    } while (cursor)
    assertAssignedRows(rows, actor, all)
    assert.equal(total, all.filter(person => person.officeId === actor.officeId).length)
    assert.equal(new Set(rows.map(row => row.id)).size, total)
  }
  for (const division of regionalOffice.divisions) {
    const payload = await assertJsonStatus(await getPersons(sameOriginRequest(`/api/persons?mode=directory&q=Assignedread&officeId=${otherOffice.id}&divisionId=${division.id}`, { cookie: assignedOfficeActors()[0].cookie })), 200)
    assert.equal(payload.persons.length, 2)
    assert.ok(payload.persons.every(row => row.officeId === regionalOffice.id && row.divisionId === division.id))
  }
  const global = await assertJsonStatus(await getPersons(sameOriginRequest(`/api/persons?mode=directory&q=Assignedread&officeId=${otherOffice.id}`, { cookie: adminCookie() })), 200)
  assert.equal(global.persons.length, 2)
  assert.ok(global.persons.every(row => row.officeId === otherOffice.id))
})

test('cross-office pending count includes only the assigned Regional Office or assigned field office', async () => {
  await assignedOfficeReads()
  for (const actor of [...assignedOfficeActors(), { name: 'Regional Admin', cookie: adminCookie(), officeId: '' }]) {
    const payload = await assertJsonStatus(await getPendingCount(sameOriginRequest('/api/persons/pending-count', { cookie: actor.cookie })), 200, actor.name)
    const expected = await queryPostgres("SELECT count(*)::integer AS count FROM persons WHERE lifecycle_status = 'pending' AND ($1 = '' OR office_id = $1)", [actor.officeId])
    assert.ok(expected.rows[0].count > 0)
    assert.equal(payload.pending, expected.rows[0].count, actor.name)
  }
})

test('cross-office recent attendance permits HR reads without returning another office', async () => {
  const { active } = await assignedOfficeReads()
  for (const actor of assignedOfficeActors()) {
    const payload = await assertJsonStatus(await getRecentAttendance(sameOriginRequest('/api/attendance/recent', { cookie: actor.cookie })), 200, actor.name)
    assertAssignedRows(payload.attendance, actor, active, 'personId')
  }
  const global = await assertJsonStatus(await getRecentAttendance(sameOriginRequest('/api/attendance/recent', { cookie: adminCookie() })), 200)
  for (const person of active) assert.ok(global.attendance.some(row => row.personId === person.id))
})

let recentLocationFixtures
async function createRecentLocationFixtures() {
  if (recentLocationFixtures) return recentLocationFixtures
  const { active } = await assignedOfficeReads()
  const location = { latitude: 6.123456789, longitude: 125.987654321, radiusMeters: 987, wifiSsid: 'RECENT-WIFI-SECRET', mapUrl: 'https://example.test/RECENT-MAP-SECRET' }
  const metadata = { capture: { office: { gps: location } } }
  const geofenceStatus = `Inside office radius · Wi-Fi context mismatch (${location.wifiSsid})`
  for (const person of active) {
    const data = { ...location, gps: location, metadata, captureContext: metadata, scanDiagnostics: metadata, source: 'manual_override', manualSlot: 'am_in', fieldDutyStatus: 'approved' }
    await queryPostgres(`
      UPDATE attendance SET latitude = $2, longitude = $3, geofence_status = $4,
        attendance_mode = 'On-site', decision_code = 'accepted_onsite', confidence = 0.98,
        date_label = 'September 1, 2026', time_label = '08:00 AM', data = $5::jsonb
      WHERE id = $1
    `, [`assigned-office-attendance-${person.id}`, location.latitude, location.longitude, geofenceStatus, JSON.stringify(data)])
    await queryPostgres(`
      INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key, office_id, office_name, data)
      VALUES ($1,$2,$3,$4,'checkout',$5,'2026-09-01',$6,$7,$8::jsonb)
    `, [`recent-nested-status-${person.id}`, person.employeeId, person.id, person.name, Date.now(), person.officeId, person.officeName, JSON.stringify({ source: metadata, manualSlot: [location], fieldDutyStatus: metadata })])
  }
  recentLocationFixtures = { active, location, metadata, geofenceStatus }
  return recentLocationFixtures
}

for (const [actorIndex, actorName] of ['Regional HR', 'Gensan HR', 'Cotabato HR'].entries()) {
  test(`recent attendance hides location and nested payloads for ${actorName}`, async () => {
    const { active } = await createRecentLocationFixtures()
    const actor = assignedOfficeActors()[actorIndex]
    const payload = await assertJsonStatus(await getRecentAttendance(sameOriginRequest('/api/attendance/recent', { cookie: actor.cookie })), 200, actor.name)
    assertAssignedRows(payload.attendance, actor, active, 'personId')
    const expectedFields = ['id', 'employeeId', 'personId', 'name', 'action', 'timestamp', 'dateKey', 'dateLabel', 'date', 'time', 'officeId', 'officeName', 'attendanceMode', 'decisionCode', 'confidence', 'source', 'manualSlot', 'fieldDutyStatus'].sort()
    for (const person of active.filter(entry => entry.officeId === actor.officeId)) {
      const row = payload.attendance.find(entry => entry.id === `assigned-office-attendance-${person.id}`)
      assert.deepEqual(Object.keys(row).sort(), expectedFields, `${actor.name}: only explicit ordinary attendance fields`)
      assert.equal(row.employeeId, person.employeeId)
      assert.equal(row.name, person.name)
      assert.equal(row.action, 'checkin')
      assert.equal(row.dateKey, '2026-09-01')
      assert.equal(row.dateLabel, 'September 1, 2026')
      assert.equal(row.time, '08:00 AM')
      assert.equal(typeof row.timestamp, 'number')
      assert.equal(row.attendanceMode, 'On-site')
      assert.equal(row.decisionCode, 'accepted_onsite')
      assert.equal(row.confidence, 0.98)
      assert.equal(row.source, 'manual_override')
      assert.equal(row.manualSlot, 'am_in')
      assert.equal(row.fieldDutyStatus, 'approved')
      const nested = payload.attendance.find(entry => entry.id === `recent-nested-status-${person.id}`)
      for (const field of ['source', 'manualSlot', 'fieldDutyStatus']) assert.equal(nested[field], undefined)
    }
    assert.ok(payload.attendance.every(row => Object.values(row).every(value => value === null || typeof value !== 'object')))
    assert.doesNotMatch(JSON.stringify(payload), /latitude|longitude|radius|geofence|wifi|mapUrl|metadata|captureContext|scanDiagnostics|RECENT-WIFI-SECRET|RECENT-MAP-SECRET/i)
  })
}

test('recent attendance preserves location payloads for Regional and Office Administrators', async () => {
  const { active, location, metadata, geofenceStatus } = await createRecentLocationFixtures()
  for (const actor of [
    { cookie: adminCookie(), officeId: '' },
    { cookie: adminCookie({ uid: 'route-test-office-admin', email: 'route-test-office-admin@example.test', scope: 'office', officeId: office.id }), officeId: office.id },
  ]) {
    const payload = await assertJsonStatus(await getRecentAttendance(sameOriginRequest('/api/attendance/recent', { cookie: actor.cookie })), 200)
    if (actor.officeId) assert.ok(payload.attendance.every(row => row.officeId === actor.officeId))
    for (const person of active.filter(entry => !actor.officeId || entry.officeId === actor.officeId)) {
      const row = payload.attendance.find(entry => entry.id === `assigned-office-attendance-${person.id}`)
      for (const [key, value] of Object.entries(location)) assert.equal(row[key], value)
      assert.equal(row.geofenceStatus, geofenceStatus)
      assert.deepEqual(row.metadata, metadata)
      const nested = payload.attendance.find(entry => entry.id === `recent-nested-status-${person.id}`)
      assert.deepEqual(nested.source, metadata)
    }
  }
})

test('cross-office HR employee pages and access-code export ignore forged requested offices', async () => {
  const { all } = await assignedOfficeReads()
  for (const actor of assignedOfficeActors()) {
    for (const mode of ['', 'access-codes']) {
      for (const officeId of ['', actor.officeId === office.id ? otherOffice.id : office.id]) {
        const params = new URLSearchParams({ mode, officeId, query: 'Assignedread' })
        const payload = await assertJsonStatus(await getHrEmployees(sameOriginRequest(`/api/hr/employees?${params}`, { cookie: actor.cookie })), 200, `${actor.name} ${mode}`)
        assertAssignedRows(payload.employees, actor, all)
        if (!mode) assert.equal(payload.pagination.total, all.filter(person => person.officeId === actor.officeId).length)
      }
    }
  }
})

test('cross-office DTR employee list stays assigned-office scoped with optional division narrowing', async () => {
  const { active } = await assignedOfficeReads()
  for (const actor of assignedOfficeActors()) {
    const payload = await assertJsonStatus(await getHrDtrEmployees(sameOriginRequest(`/api/hr/dtr/employees?officeId=${otherOffice.id}`, { cookie: actor.cookie })), 200, actor.name)
    assertAssignedRows(payload.employees, actor, active)
    const divided = await assertJsonStatus(await getHrDtrEmployees(sameOriginRequest('/api/hr/dtr/employees?divisionId=finance-division', { cookie: actor.cookie })), 200, actor.name)
    assert.equal(divided.employees.length, actor.officeId === regionalOffice.id ? 1 : 0)
    assert.ok(divided.employees.every(row => row.officeId === actor.officeId && row.divisionId === 'finance-division'))
  }
  const global = await assertJsonStatus(await getHrDtrEmployees(sameOriginRequest('/api/hr/dtr/employees', { cookie: adminCookie() })), 200)
  for (const person of active) assert.ok(global.employees.some(row => row.id === person.id))
})

test('cross-office DTR JSON and workbook reject outside employees while both Regional divisions remain accessible', async () => {
  const { active } = await assignedOfficeReads()
  for (const actor of [...assignedOfficeActors(), { name: 'Regional Admin', cookie: adminCookie(), officeId: '' }]) {
    const own = active.filter(person => !actor.officeId || person.officeId === actor.officeId)
    for (const person of active) {
      const allowed = !actor.officeId || person.officeId === actor.officeId
      const payload = await assertJsonStatus(await getHrDtr(sameOriginRequest(`/api/hr/dtr?employeeId=${person.id}&month=9&year=2026`, { cookie: actor.cookie })), allowed ? 200 : 403, actor.name)
      if (allowed) assert.equal(payload.dtr.employee.id, person.id)
      else await assertJsonStatus(await getHrDtrWorkbook(sameOriginRequest('/api/hr/dtr/workbook', {
        method: 'POST', cookie: actor.cookie, body: { employeeIds: [own[0].id, person.id], month: 9, year: 2026 },
      })), 403, `${actor.name} mixed-office workbook`)
    }
    const workbook = await getHrDtrWorkbook(sameOriginRequest('/api/hr/dtr/workbook', {
      method: 'POST', cookie: actor.cookie, body: { employeeIds: own.map(person => person.id), month: 9, year: 2026 },
    }))
    assert.equal(workbook.status, 200, actor.name)
    const contents = unzipSync(new Uint8Array(await workbook.arrayBuffer()))
    const sheets = Object.keys(contents).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    assert.ok(sheets.length >= own.length, 'workbook may include the shared time-log details sheet')
    const xml = Object.entries(contents).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('\n')
    for (const person of active) assert.equal(xml.includes(person.lastName), own.includes(person), `${actor.name}: workbook employee ${person.name}`)
  }
})

test('cross-office read endpoints keep unauthenticated and unassigned HR sessions denied', async () => {
  const invalidCookie = hrCookie({ email: 'route-test-unassigned-regional-hr@example.test', uid: 'route-test-unassigned-regional-hr', hrUserId: 'route-test-unassigned-regional-hr', scope: 'regional', officeId: '' })
  for (const cookie of ['', invalidCookie, `${getHrSessionCookieName()}=invalid`]) {
    for (const [handler, url] of [
      [getPersons, '/api/persons'], [getPersons, '/api/persons?mode=directory'],
      [getPendingCount, '/api/persons/pending-count'], [getRecentAttendance, '/api/attendance/recent'],
      [getHrEmployees, '/api/hr/employees'], [getHrEmployees, '/api/hr/employees?mode=access-codes'],
      [getHrDtrEmployees, '/api/hr/dtr/employees'], [getHrDtr, '/api/hr/dtr?employeeId=invalid&month=9&year=2026'],
    ]) {
      const response = await handler(sameOriginRequest(url, { cookie }))
      assert.ok([401, 403].includes(response.status), `${url} accepted invalid access`)
    }
    const response = await getHrDtrWorkbook(sameOriginRequest('/api/hr/dtr/workbook', { method: 'POST', cookie, body: { employeeIds: ['invalid'], month: 9, year: 2026 } }))
    assert.equal(response.status, 401)
  }
})

test('cross-office employee mutations, photo access, and access-code regeneration reject outside employees without blocking own office', async () => {
  const active = await createAssignedOfficePeople('Assignedmutationactive')
  const pending = await createAssignedOfficePeople('Assignedmutationpending', { active: false })
  const newPhotoDataUrl = await pngDataUrl({ width: 3, height: 3 })

  const profileBody = person => ({
    lastName: person.lastName,
    firstName: person.firstName,
    middleName: person.middleName || '',
    employeeId: person.employeeId,
    position: `${person.position} Updated`,
    officeId: person.officeId,
    officeName: person.officeName,
    divisionId: person.divisionId || '',
    divisionName: person.divisionName || '',
  })
  const context = person => ({ params: Promise.resolve({ personId: person.id }) })

  for (const actor of assignedOfficeActors()) {
    const own = active.filter(person => person.officeId === actor.officeId)
    const outside = active.filter(person => person.officeId !== actor.officeId)
    assert.ok(own.length > 0 && outside.length > 0)

    for (const person of outside) {
      await assertJsonStatus(await updatePerson(sameOriginRequest(`/api/persons/${person.id}`, {
        method: 'PUT', cookie: actor.cookie, body: profileBody(person),
      }), context(person)), 403, `${actor.name} outside profile`)
      await assertJsonStatus(await updatePerson(sameOriginRequest(`/api/persons/${person.id}`, {
        method: 'PUT', cookie: actor.cookie,
        body: { command: 'transitionLifecycle', lifecycleStatus: 'rejected', reason: 'Cross-office rejection must fail' },
      }), context(person)), 403, `${actor.name} outside lifecycle`)
      await assertJsonStatus(await deletePerson(sameOriginRequest(`/api/persons/${person.id}`, {
        method: 'DELETE', cookie: actor.cookie, body: {},
      }), context(person)), 403, `${actor.name} outside deletion`)
      await assertJsonStatus(await getPersonPhoto(sameOriginRequest(`/api/persons/${person.id}/photo`, { cookie: actor.cookie }), context(person)), 403, `${actor.name} outside photo read`)
      await assertJsonStatus(await updatePersonPhoto(sameOriginRequest(`/api/persons/${person.id}/photo`, {
        method: 'POST', cookie: actor.cookie, body: { photoDataUrl: newPhotoDataUrl },
      }), context(person)), 403, `${actor.name} outside photo write`)
      await assertJsonStatus(await regeneratePersonAccessCode(sameOriginRequest(`/api/persons/${person.id}/access-code`, {
        method: 'POST', cookie: actor.cookie,
      }), context(person)), 403, `${actor.name} outside access code`)
    }

    const person = own[0]
    await assertJsonStatus(await updatePerson(sameOriginRequest(`/api/persons/${person.id}`, {
      method: 'PUT', cookie: actor.cookie, body: profileBody(person),
    }), context(person)), 200, `${actor.name} own profile`)
    assert.equal((await getPersonPhoto(sameOriginRequest(`/api/persons/${person.id}/photo`, { cookie: actor.cookie }), context(person))).status, 200)
    await assertJsonStatus(await updatePersonPhoto(sameOriginRequest(`/api/persons/${person.id}/photo`, {
      method: 'POST', cookie: actor.cookie, body: { photoDataUrl: newPhotoDataUrl },
    }), context(person)), 200, `${actor.name} own photo write`)
    await assertJsonStatus(await regeneratePersonAccessCode(sameOriginRequest(`/api/persons/${person.id}/access-code`, {
      method: 'POST', cookie: actor.cookie,
    }), context(person)), 200, `${actor.name} own access code`)

    const lifecyclePerson = pending.find(candidate => candidate.officeId === actor.officeId)
    for (const lifecycleStatus of ['active', 'pending', 'rejected']) {
      await assertJsonStatus(await updatePerson(sameOriginRequest(`/api/persons/${lifecyclePerson.id}`, {
        method: 'PUT', cookie: actor.cookie,
        body: { command: 'transitionLifecycle', lifecycleStatus, reason: `${actor.name} own lifecycle proof` },
      }), context(lifecyclePerson)), 200, `${actor.name} own ${lifecycleStatus}`)
    }
    await assertJsonStatus(await deletePerson(sameOriginRequest(`/api/persons/${person.id}`, {
      method: 'DELETE', cookie: actor.cookie, body: {},
    }), context(person)), 200, `${actor.name} own deletion`)
  }
  for (const person of pending) {
    const stored = await getLocalPersonById(person.id)
    if (stored?.lifecycleStatus === 'pending') {
      await transitionLifecycle(person.id, 'rejected', 'Clean up assigned-office mutation fixture')
    }
  }
})

for (const actorIndex of [0, 1]) {
  test(`division holiday membership rejects outside and unknown divisions for ${actorIndex === 0 ? 'Regional' : 'Office'} HR`, async () => {
    const actor = assignedOfficeActors()[actorIndex]
    const ownDivisionId = actorIndex === 0 ? 'finance-division' : 'field-only-division'
    const outsideDivisionId = actorIndex === 0 ? 'field-only-division' : 'finance-division'
    const fieldDivisions = [{ id: 'field-only-division', name: 'Field Division' }]
    await queryPostgres('UPDATE offices SET divisions = $2::jsonb WHERE id = $1', [office.id, JSON.stringify(fieldDivisions)])
    try {
      const body = { type: 'holiday', date: '2040-06-01', name: `${actor.name} division holiday`, scopeType: 'division', officeId: actor.officeId, divisionId: ownDivisionId }
      const created = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
        method: 'POST', cookie: actor.cookie, body,
      })), 200, `${actor.name} own division`)
      await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
        method: 'PATCH', cookie: actor.cookie,
        body: { ...body, id: created.id, scopeType: 'national', officeId: otherOffice.id, divisionId: outsideDivisionId },
      })), 200, 'PATCH keeps original scope')
      const persisted = (await queryPostgres('SELECT scope_type, office_id, division_id FROM holidays WHERE id = $1', [created.id])).rows[0]
      assert.deepEqual(persisted, { scope_type: 'division', office_id: actor.officeId, division_id: ownDivisionId })
      for (const divisionId of [outsideDivisionId, 'unknown-division']) {
        const deniedBody = { ...body, date: divisionId === outsideDivisionId ? '2040-06-02' : '2040-06-03', divisionId }
        await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
          method: 'POST', cookie: actor.cookie, body: deniedBody,
        })), 403, `${actor.name} ${divisionId}`)
        assert.equal((await queryPostgres('SELECT id FROM holidays WHERE office_id = $1 AND division_id = $2 AND holiday_date = $3', [actor.officeId, divisionId, deniedBody.date])).rowCount, 0)
      }
      const admin = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
        method: 'POST', cookie: adminCookie(), body: { ...body, date: '2040-06-04' },
      })), 200, 'Regional Admin valid division holiday')
      assert.ok(admin.id)
    } finally {
      await queryPostgres('UPDATE offices SET divisions = $2::jsonb WHERE id = $1', [office.id, JSON.stringify(office.divisions)])
    }
  })
}

let workforceSqlFixtures
async function createWorkforceSqlFixtures() {
  if (workforceSqlFixtures) return workforceSqlFixtures
  const { active } = await assignedOfficeReads()
  const records = { holiday: [], policy: [], leave: [], order: [] }
  for (const [index, assignedOffice] of [regionalOffice, office, otherOffice].entries()) {
    for (const scopeType of ['office', 'division']) {
      const id = `scope-sql-holiday-${index}-${scopeType}`
      await queryPostgres('INSERT INTO holidays (id, holiday_date, name, scope_type, office_id, division_id) VALUES ($1,$2,$1,$3,$4,$5)',
        [id, scopeType === 'office' ? '2041-06-10' : '2041-06-11', scopeType, assignedOffice.id, scopeType === 'division' ? 'finance-division' : ''])
      records.holiday.push({ id, offices: [assignedOffice.id] })
    }
    const id = `scope-sql-policy-${index}`
    await queryPostgres("INSERT INTO workforce_policies (id, scope_type, scope_id) VALUES ($1,'office',$2)", [id, assignedOffice.id])
    records.policy.push({ id, offices: [assignedOffice.id] })
  }
  // Scope type is authoritative even when a legacy row carries a misleading office key.
  await queryPostgres("INSERT INTO holidays (id, holiday_date, name, scope_type, office_id) VALUES ('scope-sql-national','2041-06-12','National','national',$1), ('scope-sql-other-year','2042-06-10','Other year','office',$1)", [office.id])
  records.holiday.push({ id: 'scope-sql-national', offices: [] })
  for (const [scopeType, scopeId] of [['organization', ''], ['division', office.id]]) {
    const id = `scope-sql-policy-${scopeType}`
    await queryPostgres('INSERT INTO workforce_policies (id, scope_type, scope_id) VALUES ($1,$2,$3)', [id, scopeType, scopeId])
    records.policy.push({ id, offices: [] })
  }
  for (const [index, person] of active.entries()) {
    const leaveId = `scope-sql-leave-${index}`
    await queryPostgres("INSERT INTO employee_leaves (id, person_id, leave_type, start_date, end_date) VALUES ($1,$2,'VL','2041-06-10','2041-06-10')", [leaveId, person.id])
    records.leave.push({ id: leaveId, offices: [person.officeId] })
  }
  const orderCases = [
    ...active.map(person => ({ people: [person] })),
    { people: [active[0], active[1]] },
    { people: [active[0], active[2]] },
    { people: [active[2], active[0]] },
    { people: [active[0], { id: 'scope-sql-missing-member', officeId: null }], invalid: true },
    { people: [{ id: 'scope-sql-missing-root', officeId: null }, active[0]], invalid: true },
  ]
  // Only this guarded synthetic-fixture transaction bypasses foreign-key triggers,
  // to exercise legacy/malformed roots and members. Normal queries retain constraints.
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL session_replication_role = 'replica'")
    for (const [index, entry] of orderCases.entries()) {
      const id = `scope-sql-order-${index}`
      await client.query("INSERT INTO official_orders (id, person_id, start_date, end_date) VALUES ($1,$2,'2041-06-10','2041-06-10')", [id, entry.people[0].id])
      // Leave single-person legacy orders without membership rows; root still counts.
      for (const person of entry.people.slice(1)) {
        await client.query('INSERT INTO official_order_members (official_order_id, person_id) VALUES ($1,$2)', [id, person.id])
      }
      records.order.push({ id, offices: entry.people.map(person => person.officeId), invalid: entry.invalid, personIds: entry.people.map(person => person.id) })
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  workforceSqlFixtures = records
  return records
}

for (const type of ['holiday', 'policy', 'leave', 'order']) {
  test(`workforce SQL bounds ${type} rows before application filtering`, async (t) => {
    const fixtures = await createWorkforceSqlFixtures()
    const table = { holiday: 'holidays', policy: 'workforce_policies', leave: 'employee_leaves', order: 'official_orders' }[type]
    const pool = getPostgresPool()
    const originalQuery = pool.query
    let observed = []
    let personLookupCount = 0
    t.mock.method(pool, 'query', async function (...args) {
      const result = await originalQuery.apply(this, args)
      if (/\bFROM\s+persons\b/i.test(String(args[0]))) personLookupCount += 1
      if (new RegExp(`\\bFROM\\s+${table}\\b`, 'i').test(String(args[0]))) {
        observed.push({ rows: structuredClone(result.rows) })
      }
      return result
    })
    const actors = [
      ...assignedOfficeActors(),
      { name: 'Office Admin', officeId: office.id, cookie: adminCookie({ uid: 'route-test-office-admin', email: 'route-test-office-admin@example.test', scope: 'office', officeId: office.id }) },
      { name: 'Regional Admin', global: true, cookie: adminCookie() },
    ]
    for (const actor of actors) {
      observed = []
      personLookupCount = 0
      const request = sameOriginRequest(`/api/hr/workforce-records?type=${type}&year=2041&officeId=${otherOffice.id}`, { cookie: actor.cookie })
      const payload = await assertJsonStatus(await getWorkforceRecords(request), 200, actor.name)
      assert.ok(observed.length > 0, 'Observe the real workforce base SELECT')
      const expected = fixtures[type].filter(row => actor.global || (row.offices.length > 0 && row.offices.every(id => id === actor.officeId) && !row.invalid))
      const fixtureIds = rows => rows.filter(row => row.id.startsWith(`scope-sql-${type === 'holiday' ? '' : `${type}-`}`)).map(row => row.id).sort()
      assert.deepEqual(fixtureIds(observed[0].rows), expected.map(row => row.id).sort(), `${actor.name}: database returned out-of-scope ${type} rows before filtering`)
      assert.deepEqual(fixtureIds(payload.records), expected.filter(row => !row.invalid).map(row => row.id).sort(), `${actor.name}: response scope`)
      if (type === 'order') {
        assert.equal(observed.length, 1, 'Order listing must not run one order query per result')
        assert.equal(personLookupCount, 1, 'Order authorization must batch the person lookup')
        for (const row of payload.records) {
          const fixture = fixtures.order.find(entry => entry.id === row.id)
          if (fixture) assert.deepEqual([...row.person_ids].sort(), [...fixture.personIds].sort())
        }
      }
    }
  })
}

test('national holiday and organization-wide workforce changes require Regional Admin', async () => {
  const actors = assignedOfficeActors()
  for (const actor of actors) {
    await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'POST', cookie: actor.cookie, body: { type: 'holiday', seedYear: 2034 },
    })), 403, `${actor.name} national holiday seed`)
    await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'POST', cookie: actor.cookie,
      body: { type: 'holiday', date: '2037-01-01', name: 'Forbidden national holiday', scopeType: 'national' },
    })), 403, `${actor.name} national holiday`)
    await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'POST', cookie: actor.cookie,
      body: { type: 'policy', scopeType: 'organization', weeklySchedule: {} },
    })), 403, `${actor.name} organization policy`)
    await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'POST', cookie: actor.cookie,
      body: { type: 'policy', scopeType: 'division', scopeId: 'finance-division', weeklySchedule: {} },
    })), 403, `${actor.name} division policy`)
  }

  const seeded = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'POST', cookie: adminCookie(), body: { type: 'holiday', seedYear: 2034 },
  })), 200, 'Regional Admin national holiday seed')
  assert.ok(seeded.seeded > 0)
  const national = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'POST', cookie: adminCookie(),
    body: { type: 'holiday', date: '2037-01-01', name: 'Regional Admin holiday', scopeType: 'national' },
  })), 200, 'Regional Admin national holiday')
  const organization = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'POST', cookie: adminCookie(),
    body: { type: 'policy', scopeType: 'organization', weeklySchedule: {} },
  })), 200, 'Regional Admin organization policy')
  const division = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'POST', cookie: adminCookie(),
    body: { type: 'policy', scopeType: 'division', scopeId: 'finance-division', weeklySchedule: {} },
  })), 200, 'Regional Admin division policy')

  for (const actor of actors) {
    const holidayRead = await assertJsonStatus(await getWorkforceRecords(sameOriginRequest('/api/hr/workforce-records?type=holiday&year=2037', { cookie: actor.cookie })), 200)
    assert.equal(holidayRead.records.some(record => record.id === national.id), false)
    const policyRead = await assertJsonStatus(await getWorkforceRecords(sameOriginRequest('/api/hr/workforce-records?type=policy', { cookie: actor.cookie })), 200)
    assert.equal(policyRead.records.some(record => record.id === organization.id), false)
    assert.equal(policyRead.records.some(record => record.id === division.id), false)
    await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'PATCH', cookie: actor.cookie,
      body: { type: 'holiday', id: national.id, date: '2037-01-02', name: 'Forbidden update' },
    })), 403, `${actor.name} national holiday patch`)
    await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=holiday&id=${national.id}`, {
      method: 'DELETE', cookie: actor.cookie,
    })), 403, `${actor.name} national holiday delete`)
    await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'PATCH', cookie: actor.cookie,
      body: { type: 'policy', id: organization.id, weeklySchedule: {} },
    })), 403, `${actor.name} organization policy patch`)
    await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=policy&id=${organization.id}`, {
      method: 'DELETE', cookie: actor.cookie,
    })), 403, `${actor.name} organization policy delete`)
    await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'PATCH', cookie: actor.cookie,
      body: { type: 'policy', id: division.id, weeklySchedule: {} },
    })), 403, `${actor.name} division policy patch`)
    await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=policy&id=${division.id}`, {
      method: 'DELETE', cookie: actor.cookie,
    })), 403, `${actor.name} division policy delete`)
  }
  const adminHolidays = await assertJsonStatus(await getWorkforceRecords(sameOriginRequest('/api/hr/workforce-records?type=holiday&year=2037', { cookie: adminCookie() })), 200)
  assert.ok(adminHolidays.records.some(record => record.id === national.id))
  const adminPolicies = await assertJsonStatus(await getWorkforceRecords(sameOriginRequest('/api/hr/workforce-records?type=policy', { cookie: adminCookie() })), 200)
  assert.ok(adminPolicies.records.some(record => record.id === organization.id))
  assert.ok(adminPolicies.records.some(record => record.id === division.id))
  await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'PATCH', cookie: adminCookie(),
    body: { type: 'holiday', id: national.id, date: '2037-01-02', name: 'Regional Admin updated holiday' },
  })), 200, 'Regional Admin national holiday patch')
  await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'PATCH', cookie: adminCookie(),
    body: { type: 'policy', id: organization.id, weeklySchedule: {} },
  })), 200, 'Regional Admin organization policy patch')
  await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'PATCH', cookie: adminCookie(),
    body: { type: 'policy', id: division.id, weeklySchedule: {} },
  })), 200, 'Regional Admin division policy patch')
  await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=holiday&id=${national.id}`, {
    method: 'DELETE', cookie: adminCookie(),
  })), 200, 'Regional Admin national holiday delete')
  await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=policy&id=${organization.id}`, {
    method: 'DELETE', cookie: adminCookie(),
  })), 200, 'Regional Admin organization policy delete')
  await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=policy&id=${division.id}`, {
    method: 'DELETE', cookie: adminCookie(),
  })), 200, 'Regional Admin division policy delete')
  await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
    method: 'PATCH', cookie: adminCookie(),
    body: { type: 'policy', id: 'missing-workforce-policy', weeklySchedule: {} },
  })), 404, 'Regional Admin missing policy patch')
  await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest('/api/hr/workforce-records?type=policy&id=missing-workforce-policy', {
    method: 'DELETE', cookie: adminCookie(),
  })), 404, 'Regional Admin missing policy delete')
})

test('cross-office leave and official-order paths accept each assigned office and reject every outside employee', async () => {
  const { active } = await assignedOfficeReads()
  const created = []
  const actors = assignedOfficeActors()
  for (const [actorIndex, actor] of actors.entries()) {
    const own = active.filter(person => person.officeId === actor.officeId)
    const outside = active.filter(person => person.officeId !== actor.officeId)
    for (const [personIndex, person] of own.entries()) {
      const day = 10 + actorIndex * 3 + personIndex
      const date = `2036-06-${String(day).padStart(2, '0')}`
      const leave = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
        method: 'POST', cookie: actor.cookie,
        body: { type: 'leave', personId: person.id, leaveType: 'VL', startDate: date, endDate: date },
      })), 200, `${actor.name} own leave ${person.divisionId}`)
      const order = await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
        method: 'POST', cookie: actor.cookie,
        body: { type: 'order', personIds: [person.id], startDate: date, endDate: date, orderNumber: `ASSIGNED-${actorIndex}-${personIndex}` },
      })), 200, `${actor.name} own order ${person.divisionId}`)
      created.push({ actor, person, leaveId: leave.id, orderId: order.id, date })
    }
    for (const [personIndex, person] of outside.entries()) {
      const date = `2036-07-${String(10 + actorIndex * 4 + personIndex).padStart(2, '0')}`
      await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
        method: 'POST', cookie: actor.cookie,
        body: { type: 'leave', personId: person.id, leaveType: 'SL', startDate: date, endDate: date },
      })), 403, `${actor.name} outside leave`)
      await assertJsonStatus(await createWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
        method: 'POST', cookie: actor.cookie,
        body: { type: 'order', personIds: [own[0].id, person.id], startDate: date, endDate: date },
      })), 403, `${actor.name} mixed-office order`)
    }
  }

  for (const actor of actors) {
    for (const type of ['leave', 'order']) {
      const payload = await assertJsonStatus(await getWorkforceRecords(sameOriginRequest(`/api/hr/workforce-records?type=${type}`, { cookie: actor.cookie })), 200, actor.name)
      assert.ok(payload.records.length > 0)
      const expected = created.filter(record => record.actor.officeId === actor.officeId).map(record => type === 'leave' ? record.leaveId : record.orderId)
      assert.ok(expected.every(id => payload.records.some(record => record.id === id)))
      assert.ok(created.filter(record => record.actor.officeId !== actor.officeId).every(record => !payload.records.some(row => row.id === (type === 'leave' ? record.leaveId : record.orderId))))
    }
    const outsideRecord = created.find(record => record.actor.officeId !== actor.officeId)
    await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'PATCH', cookie: actor.cookie,
      body: { type: 'leave', id: outsideRecord.leaveId, leaveType: 'SL', startDate: outsideRecord.date, endDate: outsideRecord.date },
    })), 403, `${actor.name} outside leave patch`)
    await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=leave&id=${outsideRecord.leaveId}`, {
      method: 'DELETE', cookie: actor.cookie,
    })), 403, `${actor.name} outside leave delete`)
    await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'PATCH', cookie: actor.cookie,
      body: { type: 'order', id: outsideRecord.orderId, personIds: [outsideRecord.person.id], startDate: outsideRecord.date, endDate: outsideRecord.date },
    })), 403, `${actor.name} outside order patch`)
    await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=order&id=${outsideRecord.orderId}`, {
      method: 'DELETE', cookie: actor.cookie,
    })), 403, `${actor.name} outside order delete`)
  }
  for (const actor of actors) {
    const ownRecord = created.find(record => record.actor.officeId === actor.officeId)
    await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'PATCH', cookie: actor.cookie,
      body: { type: 'leave', id: ownRecord.leaveId, leaveType: 'SL', startDate: ownRecord.date, endDate: ownRecord.date },
    })), 200, `${actor.name} own leave patch`)
    await assertJsonStatus(await updateWorkforceRecord(sameOriginRequest('/api/hr/workforce-records', {
      method: 'PATCH', cookie: actor.cookie,
      body: { type: 'order', id: ownRecord.orderId, personIds: [ownRecord.person.id], startDate: ownRecord.date, endDate: ownRecord.date },
    })), 200, `${actor.name} own order patch`)
    await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=leave&id=${ownRecord.leaveId}`, {
      method: 'DELETE', cookie: actor.cookie,
    })), 200, `${actor.name} own leave delete`)
    await assertJsonStatus(await deleteWorkforceRecord(sameOriginRequest(`/api/hr/workforce-records?type=order&id=${ownRecord.orderId}`, {
      method: 'DELETE', cookie: actor.cookie,
    })), 200, `${actor.name} own order delete`)
  }
  const { pending } = await assignedOfficeReads()
  for (const person of pending) {
    await transitionLifecycle(person.id, 'rejected', 'Clean up assigned-office read fixture')
  }
})

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

test('public health reports process health without claiming dependency readiness', async () => {
  const response = await getHealth()
  const payload = await response.json()
  assert.deepEqual(payload, {
    ok: true,
    kind: 'process-health',
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

test('Regional HR cookie and resolved session retain one assigned Regional Office', async () => {
  const cookie = createHrSessionCookieValue({
    email: 'route-test-regional-hr@example.test',
    uid: 'route-test-regional-hr',
    hrUserId: 'route-test-regional-hr',
    scope: 'regional',
    officeId: `  ${regionalOffice.id}  `,
  })
  const parsed = parseHrSessionCookieValue(cookie)

  assert.equal(parsed.officeId, regionalOffice.id)

  const resolved = await resolveHrSession(null, parsed)
  assert.equal(resolved.officeId, regionalOffice.id)
  assert.equal(resolved.scope, 'regional')
  assert.equal(hrSessionAllowsOffice(resolved, regionalOffice.id), true)
  assert.equal(hrSessionAllowsOffice(resolved, office.id), false)
  assert.equal(hrSessionAllowsOffice(resolved, otherOffice.id), false)
})

test('Regional HR without an assigned office cannot resolve a session', async () => {
  const resolved = await resolveHrSession(null, {
    role: 'hr',
    scope: 'regional',
    officeId: '',
    email: 'route-test-unassigned-regional-hr@example.test',
    uid: 'route-test-unassigned-regional-hr',
    hrUserId: 'route-test-unassigned-regional-hr',
  })

  assert.equal(resolved, null)
})

test('HR session identity reloads the signed account by id and never reattaches an old cookie by email', async () => {
  const originalId = 'route-test-session-identity-old'
  const replacementId = 'route-test-session-identity-new'
  const email = 'route-test-session-identity@example.test'
  const pinHash = hashLocalPin('4826')

  await queryPostgres(`
    INSERT INTO hr_users (
      id, email, email_lower, name, display_name, scope, office_id, active, pin_hash, data
    ) VALUES ($1, $2, $2, 'Session Identity HR', 'Session Identity HR', 'office', $3, true, $4, $5::jsonb)
  `, [originalId, email, office.id, pinHash, JSON.stringify({ permissions: ['employees', 'summary', 'dtr'] })])

  try {
    const parsed = parseHrSessionCookieValue(createHrSessionCookieValue({
      email,
      uid: originalId,
      hrUserId: originalId,
      scope: 'office',
      officeId: office.id,
    }))

    const initial = await resolveHrSession(null, parsed)
    assert.equal(initial?.hrUserId, originalId)
    assert.equal(initial?.officeId, office.id)

    await queryPostgres('UPDATE hr_users SET office_id = $2 WHERE id = $1', [originalId, otherOffice.id])
    const reassigned = await resolveHrSession(null, parsed)
    assert.equal(reassigned?.hrUserId, originalId)
    assert.equal(reassigned?.officeId, otherOffice.id)

    await queryPostgres('UPDATE hr_users SET active = false WHERE id = $1', [originalId])
    assert.equal(await resolveHrSession(null, parsed), null)

    await queryPostgres('DELETE FROM hr_users WHERE id = $1', [originalId])
    await queryPostgres(`
      INSERT INTO hr_users (
        id, email, email_lower, name, display_name, scope, office_id, active, pin_hash, data
      ) VALUES ($1, $2, $2, 'Replacement HR', 'Replacement HR', 'office', $3, true, $4, $5::jsonb)
    `, [replacementId, email, office.id, pinHash, JSON.stringify({ permissions: ['employees', 'summary', 'dtr'] })])

    assert.equal(await resolveHrSession(null, parsed), null)

    const emailOnlySession = parseHrSessionCookieValue(createHrSessionCookieValue({
      email,
      uid: replacementId,
      scope: 'office',
      officeId: office.id,
    }))
    assert.equal(await resolveHrSession(null, emailOnlySession), null)

    const specialPinSession = await resolveHrSession(null, {
      ...parsed,
      email: 'hr-pin-admin@local',
      uid: 'hr-pin',
      hrUserId: 'special-pin-session',
      officeId: `  ${office.id}  `,
    })
    assert.equal(specialPinSession?.uid, 'hr-pin')
    assert.equal(specialPinSession?.displayName, 'HR PIN User')
    assert.equal(specialPinSession?.officeId, office.id)
    for (const officeId of [undefined, '', '   ']) {
      assert.equal(await resolveHrSession(null, { ...specialPinSession, officeId }), null)
    }
  } finally {
    await queryPostgres('DELETE FROM hr_users WHERE id = ANY($1::text[])', [[originalId, replacementId]])
  }
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
    error => error instanceof SafeRequestError
      && error.status === 400
      && error.code === 'invalid_enrollment_photo',
  )
  await assert.rejects(
    normalizeDataImage(`data:image/jpeg;base64,${disguisedSvg}`),
    error => error instanceof SafeRequestError
      && error.status === 400
      && error.code === 'invalid_enrollment_photo',
  )
  await assert.rejects(
    normalizeDataImage('data:image/jpeg;base64,not-valid-base64%%%'),
    error => error instanceof SafeRequestError
      && error.status === 400
      && error.code === 'invalid_enrollment_photo',
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

test('registration hides internal error details behind a reference ID', async () => {
  const response = await register(
    registrationFixture({ photoDataUrl: await pngDataUrl() }),
    {
      enrollLocalPerson: async () => {
        throw Object.assign(
          new Error('postgres://private-registration-host/faceid'),
          { code: 'internal_database_failure', status: 418 },
        )
      },
    },
  )
  const payload = await response.json()
  assert.equal(response.status, 500)
  assert.match(payload.errorId, /^[0-9a-f-]{36}$/i)
  assert.equal(
    payload.message,
    `Registration could not be completed. Please try again or contact HR. Reference: ${payload.errorId}`,
  )
  assert.deepEqual(Object.keys(payload).sort(), ['errorId', 'message', 'ok'])
  assert.doesNotMatch(JSON.stringify(payload), /postgres|private-registration-host/i)
})

test('public route hides internal error behind a reference ID', async () => {
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const handler = createPublicOfficesGetHandler({
      listOffices: async () => {
        throw new Error('postgres://private-office-user:private-password@private-host/faceid')
      },
    })
    const response = await handler()
    const payload = await response.json()

    assert.equal(response.status, 500)
    assert.match(payload.errorId, /^[0-9a-f-]{36}$/i)
    assert.equal(payload.message, `Failed to load offices. Reference: ${payload.errorId}`)
    assert.deepEqual(Object.keys(payload).sort(), ['errorId', 'message', 'ok'])
    assert.doesNotMatch(JSON.stringify(payload), /private-office-user|private-password|private-host/i)
  } finally {
    console.error = originalConsoleError
  }
})

test('server enrollment capture validation uses the approved safe request contract', async () => {
  await assert.rejects(
    buildAuthoritativeEnrollmentPayload([], null),
    error => {
      assert.ok(error instanceof SafeRequestError)
      assert.equal(error.status, 400)
      assert.equal(error.code, 'invalid_enrollment_capture')
      assert.equal(error.message, 'Guided enrollment snapshots are required.')
      return true
    },
  )
})

test('registration returns an actual server enrollment capture validation as safe 400', async () => {
  const response = await register(
    registrationFixture({ photoDataUrl: await pngDataUrl() }),
    {
      buildAuthoritativeEnrollmentPayload: async () => buildAuthoritativeEnrollmentPayload([], null),
    },
  )
  const payload = await response.json()

  assert.equal(response.status, 400, JSON.stringify(payload))
  assert.deepEqual(payload, {
    ok: false,
    code: 'invalid_enrollment_capture',
    message: 'Guided enrollment snapshots are required.',
  })
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

test('HR account assignment validates office type and repairs a partial Regional HR record without identity drift', async () => {
  const payloads = [
    { email: 'route-test-new-regional-blank@example.test', displayName: 'Blank Regional HR', scope: 'regional', officeId: '', pin: '4137' },
    { email: 'route-test-new-regional-field@example.test', displayName: 'Field Regional HR', scope: 'regional', officeId: office.id, pin: '4138' },
    { email: 'route-test-new-regional-valid@example.test', displayName: 'Valid Regional HR', scope: 'regional', officeId: regionalOffice.id, pin: '4139' },
    { email: 'route-test-new-office-regional@example.test', displayName: 'Regional Office HR', scope: 'office', officeId: regionalOffice.id, pin: '4140' },
  ]
  const responses = []
  const createdIds = []

  try {
    for (const body of payloads) {
      const response = await createHrUser(sameOriginRequest('/api/hr-users', {
        method: 'POST',
        headers: { cookie: adminCookie() },
        body,
      }))
      const responsePayload = await response.json()
      responses.push({ status: response.status, payload: responsePayload })
      if (responsePayload.id) createdIds.push(responsePayload.id)
    }

    assert.equal(responses[0].status, 400, JSON.stringify(responses[0].payload))
    assert.equal(responses[1].status, 400, JSON.stringify(responses[1].payload))
    assert.equal(responses[2].status, 200, JSON.stringify(responses[2].payload))
    assert.equal(responses[3].status, 400, JSON.stringify(responses[3].payload))

    const validCreated = (await queryPostgres(
      'SELECT scope, office_id FROM hr_users WHERE id = $1',
      [responses[2].payload.id],
    )).rows[0]
    assert.deepEqual(validCreated, { scope: 'regional', office_id: regionalOffice.id })
    assert.equal((await queryPostgres(
      "SELECT office_id FROM audit_logs WHERE target_id = $1 AND action = 'hr_user_create'",
      [responses[2].payload.id],
    )).rows[0]?.office_id, regionalOffice.id)

    const repairId = 'route-test-repair-regional-hr'
    const repairPinHash = hashLocalPin('6259')
    await queryPostgres(`
      INSERT INTO hr_users (
        id, email, email_lower, name, display_name, scope, office_id, active, pin_hash, data
      ) VALUES ($1, $2, $2, $3, $3, 'regional', '', false, $4, $5::jsonb)
    `, [
      repairId,
      'route-test-repair-regional@example.test',
      'Regional HR Pending Repair',
      repairPinHash,
      JSON.stringify({ permissions: ['employees', 'summary', 'dtr'] }),
    ])
    createdIds.push(repairId)

    const beforeRepair = (await queryPostgres(
      'SELECT email, display_name, active, pin_hash FROM hr_users WHERE id = $1',
      [repairId],
    )).rows[0]
    for (const assignment of [
      { scope: 'regional', officeId: office.id },
      { scope: 'office', officeId: regionalOffice.id },
      { scope: 'regional', officeId: '' },
    ]) {
      const invalidUpdate = await updateHrUser(
        sameOriginRequest(`/api/hr-users/${repairId}`, {
          method: 'PUT',
          headers: { cookie: adminCookie() },
          body: { email: beforeRepair.email, displayName: beforeRepair.display_name, active: false, ...assignment },
        }),
        { params: Promise.resolve({ hrUserId: repairId }) },
      )
      assert.equal(invalidUpdate.status, 400, JSON.stringify(await invalidUpdate.json()))
    }
    const repairResponse = await updateHrUser(
      sameOriginRequest(`/api/hr-users/${repairId}`, {
        method: 'PUT',
        headers: { cookie: adminCookie() },
        body: { scope: 'regional', officeId: regionalOffice.id },
      }),
      { params: Promise.resolve({ hrUserId: repairId }) },
    )
    const repairPayload = await repairResponse.json()
    assert.equal(repairResponse.status, 200, JSON.stringify(repairPayload))

    const afterRepair = (await queryPostgres(
      'SELECT email, display_name, scope, office_id, active, pin_hash FROM hr_users WHERE id = $1',
      [repairId],
    )).rows[0]
    assert.deepEqual(afterRepair, {
      ...beforeRepair,
      scope: 'regional',
      office_id: regionalOffice.id,
    })
    assert.equal((await queryPostgres(
      "SELECT office_id FROM audit_logs WHERE target_id = $1 AND action = 'hr_user_update'",
      [repairId],
    )).rows[0]?.office_id, regionalOffice.id)
    for (const body of [null, [], 'not-json']) {
      const invalidBody = await updateHrUser(
        sameOriginRequest(`/api/hr-users/${repairId}`, {
          method: 'PUT',
          headers: { cookie: adminCookie() },
          body,
        }),
        { params: Promise.resolve({ hrUserId: repairId }) },
      )
      assert.equal(invalidBody.status, 400, JSON.stringify(await invalidBody.json()))
    }

    const duplicateEmail = await updateHrUser(
      sameOriginRequest(`/api/hr-users/${repairId}`, {
        method: 'PUT',
        headers: { cookie: adminCookie() },
        body: { email: 'route-test-regional-hr@example.test' },
      }),
      { params: Promise.resolve({ hrUserId: repairId }) },
    )
    assert.equal(duplicateEmail.status, 409, JSON.stringify(await duplicateEmail.json()))
  } finally {
    if (createdIds.length > 0) {
      await queryPostgres('DELETE FROM hr_users WHERE id = ANY($1::text[])', [createdIds])
    }
  }
})

test('HR office response hides protected location data while admin and public contracts stay intact', async () => {
  const regionalCookie = hrCookie({
    email: 'route-test-regional-hr@example.test',
    uid: 'route-test-regional-hr',
    hrUserId: 'route-test-regional-hr',
    scope: 'regional',
    officeId: regionalOffice.id,
  })
  const hrResponse = await getOffices(sameOriginRequest('/api/offices', {
    headers: { cookie: regionalCookie },
  }))
  const hrPayload = await hrResponse.json()
  assert.equal(hrResponse.status, 200, JSON.stringify(hrPayload))
  assert.deepEqual(hrPayload.offices.map(item => item.id), [regionalOffice.id])
  assert.deepEqual(Object.keys(hrPayload.offices[0]).sort(), [
    'code', 'divisions', 'employees', 'id', 'name', 'officeType', 'shortName', 'status', 'workPolicy',
  ])
  for (const division of hrPayload.offices[0].divisions) {
    assert.deepEqual(Object.keys(division).sort(), ['id', 'name', 'shortName'])
  }
  assert.deepEqual(
    hrPayload.offices[0].divisions.map(division => division.id),
    ['finance-division', 'operations-division'],
  )
  assert.doesNotMatch(JSON.stringify(hrPayload), /latitude|longitude|radius|gps|location|wifi|map/i)

  const adminResponse = await getOffices(sameOriginRequest('/api/offices', {
    headers: { cookie: adminCookie() },
  }))
  const adminPayload = await adminResponse.json()
  assert.equal(adminResponse.status, 200, JSON.stringify(adminPayload))
  const adminRegional = adminPayload.offices.find(item => item.id === regionalOffice.id)
  assert.equal(adminRegional.gps.latitude, 6.1)
  assert.equal(adminRegional.gps.longitude, 125.1)
  assert.equal(adminRegional.gps.radiusMeters, 500)
  assert.equal(adminRegional.location, regionalOffice.location)

  const publicResponse = await getPublicOffices()
  const publicPayload = await publicResponse.json()
  assert.equal(publicResponse.status, 200, JSON.stringify(publicPayload))
  const publicRegional = publicPayload.offices.find(item => item.id === regionalOffice.id)
  assert.equal(publicRegional.location, regionalOffice.location)
  assert.equal(publicRegional.provinceOrCity, regionalOffice.provinceOrCity)
  assert.doesNotMatch(JSON.stringify(publicPayload), /latitude|longitude|radius|gps|wifi|map/i)
})

test('HR office settings for Office HR expose and mutate only the assigned office work policy', async () => {
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

test('HR office settings allow Regional HR only its assigned Regional Office and ignore forged protected fields', async () => {
  const regionalCookie = hrCookie({
    email: 'route-test-regional-hr@example.test',
    uid: 'route-test-regional-hr',
    hrUserId: 'route-test-regional-hr',
    scope: 'regional',
    officeId: regionalOffice.id,
  })
  const before = (await queryPostgres(`
    SELECT id, name, latitude, longitude, radius_meters, work_policy, data
    FROM offices
    WHERE id = ANY($1::text[])
    ORDER BY id
  `, [[regionalOffice.id, otherOffice.id]])).rows
  const beforeRegional = before.find(row => row.id === regionalOffice.id)
  const beforeOther = before.find(row => row.id === otherOffice.id)
  const protectedBefore = JSON.stringify({
    name: beforeRegional.name,
    latitude: beforeRegional.latitude,
    longitude: beforeRegional.longitude,
    radiusMeters: beforeRegional.radius_meters,
    data: Object.fromEntries(Object.entries(beforeRegional.data).filter(([key]) => key !== 'workPolicy')),
  })
  const desiredPolicy = {
    schedule: 'Regional HR assigned-office schedule',
    workingDays: [1, 2, 3, 4, 5],
    wfhDays: [3],
    morningIn: '08:00',
    morningOut: '12:00',
    afternoonIn: '13:00',
    afternoonOut: '17:00',
    gracePeriodMinutes: 12,
    checkInCooldownMinutes: 25,
    checkOutCooldownMinutes: 8,
  }

  const unassignedCookie = hrCookie({
    email: 'route-test-unassigned-regional-hr@example.test',
    uid: 'route-test-unassigned-regional-hr',
    hrUserId: 'route-test-unassigned-regional-hr',
    scope: 'regional',
    officeId: '',
  })
  for (const [method, handler] of [['GET', getHrOfficeSettings], ['PUT', updateHrOfficeSettings]]) {
    const denied = await handler(sameOriginRequest('/api/hr/office-settings', {
      method,
      headers: { cookie: unassignedCookie },
      ...(method === 'PUT' ? { body: { workPolicy: desiredPolicy } } : {}),
    }))
    assert.equal(denied.status, 403)
    assert.equal((await denied.json()).message, 'Assigned HR office access is required.')
  }

  try {
    const getResponse = await getHrOfficeSettings(sameOriginRequest('/api/hr/office-settings', {
      headers: { cookie: regionalCookie },
    }))
    const getPayload = await getResponse.json()
    assert.equal(getResponse.status, 200, JSON.stringify(getPayload))
    assert.deepEqual(Object.keys(getPayload.office).sort(), ['id', 'name', 'workPolicy'])
    assert.equal(getPayload.office.id, regionalOffice.id)
    assert.doesNotMatch(JSON.stringify(getPayload.office), /gps|latitude|longitude|radius|location|wifi|map/i)

    const putResponse = await updateHrOfficeSettings(sameOriginRequest('/api/hr/office-settings', {
      method: 'PUT',
      headers: { cookie: regionalCookie },
      body: {
        id: otherOffice.id,
        location: 'Forged Regional HR location',
        wifiSsid: ['FORGED-REGIONAL-WIFI'],
        gps: { latitude: 0, longitude: 0, radiusMeters: 999999 },
        workPolicy: { ...desiredPolicy, radiusMeters: 999999, map: 'forged-map' },
      },
    }))
    const putPayload = await putResponse.json()
    assert.equal(putResponse.status, 200, JSON.stringify(putPayload))
    assert.deepEqual(Object.keys(putPayload.office).sort(), ['id', 'name', 'workPolicy'])
    assert.equal(putPayload.office.id, regionalOffice.id)
    assert.deepEqual(putPayload.office.workPolicy, desiredPolicy)
    assert.doesNotMatch(JSON.stringify(putPayload.office), /gps|latitude|longitude|radius|location|wifi|map/i)

    const after = (await queryPostgres(`
      SELECT id, name, latitude, longitude, radius_meters, work_policy, data
      FROM offices
      WHERE id = ANY($1::text[])
      ORDER BY id
    `, [[regionalOffice.id, otherOffice.id]])).rows
    const afterRegional = after.find(row => row.id === regionalOffice.id)
    const afterOther = after.find(row => row.id === otherOffice.id)
    assert.equal(JSON.stringify({
      name: afterRegional.name,
      latitude: afterRegional.latitude,
      longitude: afterRegional.longitude,
      radiusMeters: afterRegional.radius_meters,
      data: Object.fromEntries(Object.entries(afterRegional.data).filter(([key]) => key !== 'workPolicy')),
    }), protectedBefore)
    assert.deepEqual(afterRegional.work_policy, desiredPolicy)
    assert.deepEqual(afterOther, beforeOther)
  } finally {
    await queryPostgres(
      'UPDATE offices SET work_policy = $2::jsonb, data = $3::jsonb WHERE id = $1',
      [regionalOffice.id, JSON.stringify(beforeRegional.work_policy), JSON.stringify(beforeRegional.data)],
    )
  }
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

test('duplicate registration rejects a matching face without an Employee ID', async () => {
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
  assert.equal(payload.code, 'duplicate_person_registration')
  assert.equal(payload.message, 'This registration matches an existing employee record and cannot be submitted again.')
})

test('simultaneous same-face public registrations create exactly one pending person', async (t) => {
  const photos = [
    await pngDataUrl({ background: { r: 180, g: 30, b: 40, alpha: 1 } }),
    await pngDataUrl({ background: { r: 30, g: 160, b: 70, alpha: 1 } }),
  ]
  const expectedPhotos = await Promise.all(photos.map(async photo => (await normalizeDataImage(photo)).buffer))
  const descriptors = Array.from({ length: 8 }, (_, sampleIndex) => (
    Array.from({ length: 128 }, (_, valueIndex) => valueIndex === sampleIndex ? 1 : 0)
  ))
  const bodies = ['ConcurrentFaceA', 'ConcurrentFaceB'].map((lastName, index) => (
    registrationFixture({ employeeId: '', lastName, photoDataUrl: photos[index] })
  ))
  const buildAuthoritativeEnrollmentPayload = async () => ({
    descriptors,
    captureMetadata: { qualityScore: 0.91 },
    biometricModelVersion: 'route-test-concurrent-model-v1',
    diagnostics: {},
  })
  await queryPostgres(
    'DELETE FROM request_rate_limits WHERE key_hash = ANY($1::text[])',
    [[
      hashRateLimitKey('persons-ip:direct:unknown'),
      hashRateLimitKey(`persons-employee:${office.id}:`),
    ]],
  )
  const handler = registrationHandler({ buildAuthoritativeEnrollmentPayload })

  await queryPostgres(`
    CREATE OR REPLACE FUNCTION route_test_hold_concurrent_person_insert()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.name_lower IN ('concurrentfacea, test', 'concurrentfaceb, test') THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('route_test:concurrent_person_insert', 0));
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `)
  await queryPostgres(`
    DROP TRIGGER IF EXISTS route_test_hold_concurrent_person_insert ON persons;
    CREATE TRIGGER route_test_hold_concurrent_person_insert
    BEFORE INSERT ON persons
    FOR EACH ROW EXECUTE FUNCTION route_test_hold_concurrent_person_insert()
  `)
  t.after(async () => {
    await queryPostgres('DROP TRIGGER IF EXISTS route_test_hold_concurrent_person_insert ON persons')
    await queryPostgres('DROP FUNCTION IF EXISTS route_test_hold_concurrent_person_insert()')
  })

  // Hold a test-only insert gate. Without decision serialization, both
  // transactions pass duplicate detection and wait in the trigger. With it,
  // one waits in the trigger while the other waits at the biometric lock.
  const gateClient = await getPostgresPool().connect()
  let responsesPromise
  let waitingLocks = []
  try {
    await gateClient.query('BEGIN')
    await gateClient.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['route_test:concurrent_person_insert'],
    )
    responsesPromise = Promise.all(bodies.map(body => handler(sameOriginRequest('/api/persons', {
      method: 'POST',
      body,
    }))))

    const deadline = Date.now() + 5_000
    do {
      const waiting = await gateClient.query(`
        WITH targets(lock_key) AS (
          VALUES
            (hashtextextended($1, 0)),
            (hashtextextended($2, 0))
        )
        SELECT pid, classid, objid, objsubid
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND granted = false
          AND objsubid = 1
          AND EXISTS (
            SELECT 1
            FROM targets
            WHERE classid::bigint = ((targets.lock_key >> 32) & 4294967295)
              AND objid::bigint = (targets.lock_key & 4294967295)
          )
        ORDER BY pid
      `, ['route_test:concurrent_person_insert', 'person_registration:biometric'])
      waitingLocks = waiting.rows
      if (waitingLocks.length >= 2) break
      await new Promise(resolve => setTimeout(resolve, 10))
    } while (Date.now() < deadline)
  } finally {
    await gateClient.query('ROLLBACK').catch(() => {})
    gateClient.release()
  }

  const responses = await responsesPromise
  const payloads = await Promise.all(responses.map(response => response.json()))
  assert.equal(waitingLocks.length, 2, JSON.stringify({
    waitingLocks,
    statuses: responses.map(response => response.status),
    payloads,
  }))
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409], JSON.stringify(payloads))

  const normalizedNames = bodies.map(body => (
    `${body.profile.lastName}, ${body.profile.firstName}`.toLowerCase()
  ))
  const saved = await queryPostgres(`
    SELECT
      id, employee_id, name, name_lower, last_name, first_name, middle_name,
      position, office_id, office_name, division_id, division_name,
      lifecycle_status, approval_status, descriptors, sample_count,
      photo_path, photo_content_type, data
    FROM persons
    WHERE name_lower = ANY($1::text[])
    ORDER BY name_lower
  `, [normalizedNames])
  assert.equal(saved.rowCount, 1, JSON.stringify(saved.rows))

  const winner = saved.rows[0]
  const winnerIndex = winner.name_lower === normalizedNames[0] ? 0 : 1
  const winnerBody = bodies[winnerIndex].profile
  const winnerNames = normalizeEmployeeNameFields(winnerBody)
  const successPayload = payloads.find(payload => payload.ok)
  assert.equal(winner.id, successPayload.personId)
  assert.equal(winner.employee_id, '')
  assert.equal(winner.name, winnerNames.name)
  assert.equal(winner.name_lower, normalizedNames[winnerIndex])
  assert.equal(winner.last_name, winnerNames.lastName)
  assert.equal(winner.first_name, winnerNames.firstName)
  assert.equal(winner.middle_name, winnerNames.middleName)
  assert.equal(winner.position, winnerBody.position)
  assert.equal(winner.office_id, winnerBody.officeId)
  assert.equal(winner.office_name, winnerBody.officeName)
  assert.equal(winner.division_id, winnerBody.divisionId)
  assert.equal(winner.division_name, '')
  assert.equal(winner.lifecycle_status, 'pending')
  assert.equal(winner.approval_status, 'pending')
  assert.equal(winner.sample_count, descriptors.length)
  assert.deepEqual(winner.descriptors, descriptors.map(vector => ({ vector })))
  assert.equal(winner.data.biometricModelVersion, 'route-test-concurrent-model-v1')
  assert.equal(winner.photo_content_type, 'image/jpeg')
  assert.match(winner.photo_path, /\.jpg$/)
  const savedPhoto = await readFile(path.join(getLocalFileStorageRoot(), ...winner.photo_path.split('/')))
  assert.deepEqual(savedPhoto, expectedPhotos[winnerIndex])
  assert.notDeepEqual(savedPhoto, expectedPhotos[1 - winnerIndex])

  const audit = await queryPostgres(`
    SELECT action, summary
    FROM audit_logs
    WHERE target_id = $1
      AND action = 'person_submission_create'
  `, [winner.id])
  assert.deepEqual(audit.rows, [{
    action: 'person_submission_create',
    summary: `Public enrollment submitted for ${winner.name}`,
  }])
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

test('attendance table returns safe 503 when office policy is missing', async () => {
  const response = await register(registrationFixture({
    employeeId: '955550',
    lastName: 'MissingPolicy',
    photoDataUrl: await pngDataUrl(),
  }))
  const enrolled = await response.json()
  assert.equal(response.status, 200, JSON.stringify(enrolled))
  await queryPostgres(
    `UPDATE persons
     SET office_id = '', office_name = '', data = data || '{"officeId":"","officeName":""}'::jsonb
     WHERE id = $1`,
    [enrolled.personId],
  )

  const token = createEmployeeViewSessionCookieValue({
    personId: enrolled.personId,
    employeeId: '955550',
  })
  const attendance = await getAttendanceTable(sameOriginRequest('/api/attendance/table?month=8&year=2026', {
    headers: { 'x-employee-view-session': token },
  }))
  const payload = await attendance.json()

  assert.equal(attendance.status, 503, JSON.stringify(payload))
  assert.deepEqual(payload, {
    ok: false,
    code: 'office_policy_unavailable',
    message: 'Office work policy is not configured for attendance history.',
  })
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

let correctionPeopleFixture
async function correctionPeople() {
  if (!correctionPeopleFixture) {
    correctionPeopleFixture = (async () => {
      const people = await createAssignedOfficePeople('Correctionidentity')
      await queryPostgres("UPDATE persons SET employee_id = '', employee_id_lower = '' WHERE id = ANY($1::text[])", [people.map(person => person.id)])
      return Promise.all(people.map(person => getLocalPersonById(person.id)))
    })()
  }
  return correctionPeopleFixture
}

function correctionBody(person, dateKey = '2042-06-02') {
  return { personId: person.id, action: 'checkin', manualSlot: 'am_in', timestamp: Date.parse(`${dateKey}T09:00:00+08:00`), dateKey, reason: 'Verified scanner failure' }
}

async function seedCorrectionLog(person, id, dateKey, data = {}, { action = 'checkin', time = '09:00' } = {}) {
  await queryPostgres(`
    INSERT INTO attendance (id, employee_id, person_id, name, action, timestamp_ms, date_key, office_id, office_name, data)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
  `, [id, person.employeeId, person.id, person.name, action, Date.parse(`${dateKey}T${time}:00+08:00`), dateKey, person.officeId, person.officeName, JSON.stringify(data)])
}

test('attendance correction uses saved blank-ID identity, office, division, and audit despite forged browser copies', async () => {
  const people = await correctionPeople()
  for (const actor of assignedOfficeActors()) {
    for (const person of people.filter(candidate => candidate.officeId === actor.officeId)) {
      const body = { ...correctionBody(person), employeeId: '999999', name: 'Forged name', officeId: 'forged-office', officeName: 'Forged office', divisionId: 'forged-division', divisionName: 'Forged division' }
      const created = await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', {
        method: 'POST', cookie: actor.cookie, body,
      })), 200, `${actor.name} ${person.divisionId}`)
      assert.equal(created.attendanceId, `${person.id}_${body.timestamp}_override`)
      const stored = (await queryPostgres('SELECT employee_id, person_id, name, office_id, office_name, latitude, longitude, data FROM attendance WHERE id = $1', [created.attendanceId])).rows[0]
      assert.deepEqual({ employeeId: stored.employee_id, personId: stored.person_id, name: stored.name, officeId: stored.office_id, officeName: stored.office_name }, {
        employeeId: '', personId: person.id, name: person.name, officeId: person.officeId, officeName: person.officeName,
      })
      for (const field of ['employeeId', 'name', 'officeId', 'officeName', 'divisionId', 'divisionName']) assert.equal(stored.data[field], person[field], field)
      assert.equal(stored.data.source, 'manual_override')
      assert.equal(stored.data.dateKey, body.dateKey)
      assert.equal(stored.data.manualSlot, body.manualSlot)
      for (const field of ['descriptor', 'landmarks', 'latitude', 'longitude']) assert.equal(stored.data[field], null, field)
      assert.equal(stored.latitude, null)
      assert.equal(stored.longitude, null)
      const daily = (await queryPostgres('SELECT employee_id, data FROM attendance_daily WHERE person_id = $1 AND date_key = $2', [person.id, body.dateKey])).rows[0]
      assert.equal(daily.employee_id, '')
      assert.equal(daily.data.divisionId, person.divisionId)
      const audit = (await queryPostgres("SELECT office_id, summary, metadata FROM audit_logs WHERE target_id = $1 AND action = 'attendance_override_add'", [created.attendanceId])).rows[0]
      assert.equal(audit.office_id, person.officeId)
      assert.equal(audit.metadata.personId, person.id)
      assert.equal(audit.metadata.employeeId, '')
      assert.equal(audit.metadata.name, person.name)
      assert.equal(audit.metadata.dateKey, body.dateKey)
      assert.doesNotMatch(audit.summary, /Forged|999999/)
      await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', { method: 'POST', cookie: actor.cookie, body })), 409)
    }
  }
})

test('attendance correction GET needs only saved person ID and date and ignores caller EmployeeID', async () => {
  const people = await correctionPeople()
  for (const actor of assignedOfficeActors()) {
    for (const person of people.filter(candidate => candidate.officeId === actor.officeId)) {
      const dateKey = '2042-06-03'
      const id = `correction-get-${person.id}`
      await seedCorrectionLog(person, id, dateKey)
      // A saved historical row in another office must still be filtered after person authorization.
      await seedCorrectionLog({ ...person, officeId: 'unassigned-old-office' }, `${id}-outside`, dateKey)
      for (const suffix of ['', '&employeeId=999999']) {
        const payload = await assertJsonStatus(await getAttendanceCorrections(sameOriginRequest(`/api/admin/attendance?personId=${person.id}&date=${dateKey}${suffix}`, { cookie: actor.cookie })), 200)
        assert.deepEqual(payload.logs.map(log => log.id), [id])
        assert.equal(payload.logs[0].employeeId, '')
      }
    }
  }
})

test('attendance correction rejects missing people, invalid input, and wrong Manila dates without writes', async () => {
  const person = (await correctionPeople())[2]
  const valid = { ...correctionBody(person, '2042-06-04'), employeeId: '999999', officeId: person.officeId }
  const before = await queryPostgres('SELECT id FROM attendance WHERE person_id = $1 ORDER BY id', [person.id])
  const invalidBodies = [
    ...['personId', 'action', 'dateKey', 'reason'].map(field => ({ ...valid, [field]: '' })),
    ...['personId', 'action', 'manualSlot', 'dateKey', 'reason'].map(field => ({ ...valid, [field]: {} })),
    { ...valid, action: 'invalid' }, { ...valid, dateKey: 'not-a-date' },
    ...[null, 0, -1, 'invalid', 1e30].map(timestamp => ({ ...valid, timestamp })),
    { ...valid, timestamp: Date.parse('2042-06-04T16:00:00Z') },
    { ...valid, timestamp: Date.parse('2042-06-03T15:59:59Z') },
  ]
  for (const body of invalidBodies) {
    await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', { method: 'POST', cookie: hrCookie(), body })), 400, JSON.stringify(body))
  }
  await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', {
    method: 'POST', cookie: hrCookie(), body: { ...valid, personId: 'missing-correction-person' },
  })), 404)
  for (const query of [`date=${valid.dateKey}&employeeId=999999`, `personId=${person.id}`, `personId=${person.id}&date=invalid`, `personId=${person.id}&date=2042-02-30`]) {
    await assertJsonStatus(await getAttendanceCorrections(sameOriginRequest(`/api/admin/attendance?${query}`, { cookie: hrCookie() })), 400)
  }
  await assertJsonStatus(await getAttendanceCorrections(sameOriginRequest(`/api/admin/attendance?personId=missing-correction-person&employeeId=999999&date=${valid.dateKey}`, { cookie: hrCookie() })), 404)
  assert.deepEqual((await queryPostgres('SELECT id FROM attendance WHERE person_id = $1 ORDER BY id', [person.id])).rows, before.rows)
  assert.equal((await queryPostgres('SELECT id FROM attendance_daily WHERE person_id = $1 AND date_key = $2', [person.id, valid.dateKey])).rowCount, 0)
})

test('attendance correction rejects coerced boolean object array exponent and hex timestamps without writes', async () => {
  const person = (await correctionPeople())[2]
  const dateKey = '1970-01-01'
  const before = await queryPostgres('SELECT id FROM attendance WHERE person_id = $1 AND date_key = $2 ORDER BY id', [person.id, dateKey])
  for (const timestamp of [true, {}, [1], '1e3', '0x10', '+1', '1.0']) {
    await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', {
      method: 'POST',
      cookie: hrCookie(),
      body: { personId: person.id, action: 'checkin', timestamp, dateKey, reason: 'Invalid timestamp coercion' },
    })), 400, JSON.stringify(timestamp))
  }
  assert.deepEqual((await queryPostgres('SELECT id FROM attendance WHERE person_id = $1 AND date_key = $2 ORDER BY id', [person.id, dateKey])).rows, before.rows)
})

test('attendance correction rejects fractional number and string timestamps without writes', async () => {
  const person = (await correctionPeople())[2]
  const dateKey = '2042-06-09'
  const timestamp = Date.parse(`${dateKey}T09:00:00+08:00`) + 0.5
  const before = await queryPostgres('SELECT id FROM attendance WHERE person_id = $1 AND date_key = $2 ORDER BY id', [person.id, dateKey])
  for (const candidate of [timestamp, String(timestamp)]) {
    await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', {
      method: 'POST',
      cookie: hrCookie(),
      body: { personId: person.id, action: 'checkin', timestamp: candidate, dateKey, reason: 'Invalid fractional timestamp' },
    })), 400, String(candidate))
  }
  assert.deepEqual((await queryPostgres('SELECT id FROM attendance WHERE person_id = $1 AND date_key = $2 ORDER BY id', [person.id, dateKey])).rows, before.rows)
})

test('attendance correction preserves optional manual slots and numeric-string timestamps', async () => {
  const person = (await correctionPeople())[2]
  const actor = assignedOfficeActors().find(candidate => candidate.officeId === person.officeId)
  const dateKey = '2042-06-08'
  const timestamp = Date.parse(`${dateKey}T09:00:00+08:00`)
  const created = await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', {
    method: 'POST',
    cookie: actor.cookie,
    body: { personId: person.id, action: 'checkin', timestamp: `  ${timestamp}  `, dateKey, reason: 'Legacy correction client' },
  })), 200)
  const stored = await getLocalAttendanceById(created.attendanceId)
  assert.equal(stored.personId, person.id)
  assert.equal(stored.timestamp, timestamp)
  assert.equal(stored.manualSlot, '')
})

test('attendance correction GET POST DELETE and field-duty PATCH enforce saved office for every HR scope', async () => {
  const people = await correctionPeople()
  for (const actor of assignedOfficeActors()) {
    for (const person of people.filter(candidate => candidate.officeId !== actor.officeId)) {
      const id = `correction-denied-${actor.officeId}-${person.id}`
      const body = { ...correctionBody(person, '2042-06-05'), employeeId: '999999', officeId: actor.officeId }
      await seedCorrectionLog(person, id, body.dateKey, { source: 'field_duty', fieldDutyStatus: 'pending' })
      const storedBefore = await getLocalAttendanceById(id)
      await assertJsonStatus(await getAttendanceCorrections(sameOriginRequest(`/api/admin/attendance?personId=${person.id}&employeeId=999999&date=${body.dateKey}`, { cookie: actor.cookie })), 403)
      await assertJsonStatus(await createAttendanceCorrection(sameOriginRequest('/api/admin/attendance', { method: 'POST', cookie: actor.cookie, body })), 403)
      for (const [handler, method, requestBody] of [[deleteAttendanceCorrection, 'DELETE'], [reviewAttendanceFieldDuty, 'PATCH', { fieldDutyStatus: 'approved', officeId: actor.officeId }]]) {
        await assertJsonStatus(await handler(sameOriginRequest(`/api/admin/attendance/${id}`, { method, cookie: actor.cookie, body: requestBody }), { params: Promise.resolve({ attendanceId: id }) }), 403)
      }
      assert.deepEqual(await getLocalAttendanceById(id), storedBefore)
      assert.equal(await getLocalAttendanceById(`${person.id}_${body.timestamp}_override`), null)
    }
  }
})

for (const operation of ['delete', 'approved', 'rejected']) {
  test(`attendance correction ${operation} refreshes blank-ID daily totals with saved division and employee policy`, async () => {
    const person = (await correctionPeople())[0]
    const dateKey = '2042-06-06'
    const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
    const id = `correction-refresh-${operation}`
    const policyId = `correction-policy-${operation}`
    await queryPostgres(`INSERT INTO workforce_policies (id, scope_type, scope_id, weekly_schedule) VALUES ($1,'division',$2,$3::jsonb)`, [
      policyId, person.divisionId, JSON.stringify({ [day]: { working: true, morningIn: '09:00', morningOut: '12:00', afternoonIn: '13:00', afternoonOut: '17:00' } }),
    ])
    try {
      for (const [suffix, schedule, expectedLate, expectedUndertime] of [['division', {}, 60, 300], ['employee', { [day]: { morningIn: '10:00' } }, 0, 240]]) {
        await queryPostgres('UPDATE persons SET weekly_schedule = $2::jsonb WHERE id = $1', [person.id, JSON.stringify(schedule)])
        const attendanceId = `${id}-${suffix}`
        const baseId = `${id}-${suffix}-base`
        await seedCorrectionLog(person, `${baseId}-in`, dateKey, {}, { time: '10:00' })
        await seedCorrectionLog(person, `${baseId}-out`, dateKey, {}, { action: 'checkout', time: '12:00' })
        await seedCorrectionLog(person, attendanceId, dateKey, { source: 'field_duty', fieldDutyStatus: 'pending', divisionId: 'forged-old-division' }, { time: '13:00' })
        await upsertLocalDailyAttendanceRecord({ personId: person.id, employeeId: '', dateKey, logCount: 99, divisionId: 'stale' })
        const method = operation === 'delete' ? 'DELETE' : 'PATCH'
        const handler = operation === 'delete' ? deleteAttendanceCorrection : reviewAttendanceFieldDuty
        await assertJsonStatus(await handler(sameOriginRequest(`/api/admin/attendance/${attendanceId}`, {
          method, cookie: assignedOfficeActors()[0].cookie, body: operation === 'delete' ? undefined : { fieldDutyStatus: operation },
        }), { params: Promise.resolve({ attendanceId }) }), 200)
        const daily = (await queryPostgres('SELECT employee_id, log_count, data FROM attendance_daily WHERE person_id = $1 AND date_key = $2', [person.id, dateKey])).rows[0]
        assert.equal(daily.employee_id, '')
        assert.equal(daily.log_count, operation === 'delete' ? 2 : 3)
        assert.equal(daily.data.divisionId, person.divisionId)
        assert.equal(daily.data.divisionName, person.divisionName)
        assert.equal(daily.data.amInTimestamp, Date.parse(`${dateKey}T10:00:00+08:00`))
        assert.equal(daily.data.amOutTimestamp, Date.parse(`${dateKey}T12:00:00+08:00`))
        assert.equal(daily.data.pmInTimestamp, operation === 'approved' ? Date.parse(`${dateKey}T13:00:00+08:00`) : null)
        assert.equal(daily.data.workingMinutes, 120)
        assert.equal(daily.data.lateMinutes, expectedLate)
        assert.equal(daily.data.undertimeMinutes, expectedUndertime)
        if (operation !== 'delete') assert.equal((await getLocalAttendanceById(attendanceId)).fieldDutyStatus, operation)
        await queryPostgres('DELETE FROM attendance WHERE id = ANY($1::text[])', [[attendanceId, `${baseId}-in`, `${baseId}-out`]])
      }
    } finally {
      await queryPostgres('DELETE FROM workforce_policies WHERE id = $1', [policyId])
      await queryPostgres("UPDATE persons SET weekly_schedule = '{}'::jsonb WHERE id = $1", [person.id])
    }
  })
}

test('attendance correction history hides HR location and nested metadata but preserves Administrator payloads', async () => {
  const people = await correctionPeople()
  const location = { latitude: 6.12345, longitude: 125.54321, radiusMeters: 456, wifiSsid: 'CORRECTION-WIFI-SECRET', mapUrl: 'https://example.test/CORRECTION-MAP-SECRET' }
  const nested = { capture: { gps: location } }
  for (const actor of assignedOfficeActors()) {
    const person = people.find(candidate => candidate.officeId === actor.officeId)
    const dateKey = '2042-06-07'
    const id = `correction-private-${person.id}`
    const data = { ...location, metadata: nested, captureContext: nested, scanDiagnostics: nested, source: 'manual_override', manualSlot: 'am_in', fieldDutyStatus: 'pending', overrideReason: 'Approved scanner correction', fieldDutyReason: 'Unrendered legacy reason', unknown: 'Unknown payload' }
    await seedCorrectionLog(person, id, dateKey, data)
    await queryPostgres('UPDATE attendance SET latitude = $2, longitude = $3, geofence_status = $4 WHERE id = $1', [id, location.latitude, location.longitude, `Inside radius with ${location.wifiSsid}`])
    await seedCorrectionLog(person, `${id}-nested`, dateKey, { source: nested, manualSlot: [location], fieldDutyStatus: nested, overrideReason: nested })
    const url = `/api/admin/attendance?personId=${person.id}&employeeId=legacy-ignored&date=${dateKey}`
    const hr = await assertJsonStatus(await getAttendanceCorrections(sameOriginRequest(url, { cookie: actor.cookie })), 200)
    const row = hr.logs.find(log => log.id === id)
    assert.equal(row.overrideReason, data.overrideReason)
    assert.equal(row.fieldDutyStatus, 'pending')
    assert.deepEqual(Object.keys(row).sort(), ['id', 'employeeId', 'personId', 'name', 'officeId', 'officeName', 'action', 'timestamp', 'dateKey', 'dateLabel', 'date', 'time', 'attendanceMode', 'decisionCode', 'confidence', 'source', 'manualSlot', 'fieldDutyStatus', 'overrideReason'].sort())
    assert.ok(hr.logs.every(log => Object.values(log).every(value => value === null || typeof value !== 'object')))
    assert.doesNotMatch(JSON.stringify(hr), /latitude|longitude|radius|geofence|wifi|mapUrl|metadata|captureContext|scanDiagnostics|unknown|fieldDutyReason|CORRECTION-WIFI-SECRET|CORRECTION-MAP-SECRET/i)
    for (const cookie of [adminCookie(), ...(person.officeId === office.id ? [adminCookie({ uid: 'route-test-office-admin', email: 'route-test-office-admin@example.test', scope: 'office', officeId: office.id })] : [])]) {
      const admin = await assertJsonStatus(await getAttendanceCorrections(sameOriginRequest(url, { cookie })), 200)
      for (const attendanceId of [id, `${id}-nested`]) assert.deepEqual(admin.logs.find(log => log.id === attendanceId), await getLocalAttendanceById(attendanceId))
    }
  }
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

function atomicAttendanceServices(person, { synchronizeMatches = false } = {}) {
  const descriptor = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0))
  let matchCalls = 0
  let releaseMatches
  const matchBarrier = new Promise(resolve => { releaseMatches = resolve })
  return {
    buildAuthoritativeAttendancePayload: async () => ({
      descriptor,
      descriptors: [descriptor, descriptor],
      descriptorSpread: 0.1,
      antispoof: 0.92,
      acceptedFrames: [],
      rejectedFrames: [],
      processedCount: 2,
      diagnostics: {
        modelVersion: 'route-test-atomic-attendance-v1',
        acceptedCount: 2,
        rejectedCount: 0,
        averagePerformanceMs: 1,
      },
    }),
    findClaimedEmployeeMatch: async () => {
      if (synchronizeMatches) {
        matchCalls += 1
        if (matchCalls >= 2) releaseMatches()
        await Promise.race([
          matchBarrier,
          new Promise(resolve => setTimeout(resolve, 500)),
        ])
      }
      return {
        ok: true,
        person,
        personId: person.id,
        confidence: 0.99,
        decisionCode: 'matched_person',
        debug: {},
      }
    },
  }
}

function atomicAttendanceBody(person) {
  return {
    employeeId: person.accessCode,
    latitude: 6.1164,
    longitude: 125.1716,
    scanFrames: [
      { frameDataUrl: 'data:image/jpeg;base64,ATOMIC-A' },
      { frameDataUrl: 'data:image/jpeg;base64,ATOMIC-B' },
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
    kioskContext: { kioskId: `atomic-${person.id}`, source: 'web-scan' },
  }
}

async function submitAtomicAttendance(handler, person) {
  const body = atomicAttendanceBody(person)
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

test('attendance hides internal error for one-frame and fallback-frame embedding failures', async t => {
  const previousFastSingleFrame = process.env.ATTENDANCE_FAST_SINGLE_FRAME_ENABLED
  const originalConsoleError = console.error
  process.env.ATTENDANCE_FAST_SINGLE_FRAME_ENABLED = 'true'
  console.error = () => {}

  const descriptor = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0))
  const successfulSingleFramePayload = {
    descriptor,
    descriptors: [descriptor],
    descriptorSpread: 0.1,
    antispoof: 0.92,
    acceptedFrames: [{ descriptor, antispoof: 0.92, performanceMs: 1 }],
    rejectedFrames: [],
    processedCount: 1,
    diagnostics: {
      modelVersion: 'route-test-safe-error-v1',
      acceptedCount: 1,
      rejectedCount: 0,
      averagePerformanceMs: 1,
    },
  }
  const assertSafeServerError = async (response, privatePattern) => {
    const payload = await response.json()
    assert.equal(response.status, 500, JSON.stringify(payload))
    assert.match(payload.errorId, /^[0-9a-f-]{36}$/i)
    assert.equal(
      payload.message,
      `Attendance service encountered an unexpected error. Please try again. Reference: ${payload.errorId}`,
    )
    assert.equal(payload.decisionCode, 'blocked_server_error')
    assert.doesNotMatch(JSON.stringify(payload), privatePattern)
  }

  try {
    await t.test('one-frame failure', async () => {
      const privateError = 'postgres://private-attendance-user:private-password@private-host/faceid'
      const privateStage = 'https://private-stage.example/D:/secret-models/weights.bin'
      const callOptions = []
      const handler = createAttendanceV2PostHandler({
        services: {
          buildAuthoritativeAttendancePayload: async (_frames, options) => {
            callOptions.push(options)
            throw Object.assign(
              new Error(privateError),
              {
                code: 'blocked_no_reliable_match',
                status: 403,
                attendanceStage: privateStage,
              },
            )
          },
        },
      })

      const response = await submitAtomicAttendance(handler, { id: 'safe-error-one', accessCode: '7111' })
      const responsePayload = await response.clone().json()
      await assertSafeServerError(response, /private-attendance-user|private-password|private-host/i)
      assert.equal(callOptions.length, 1)
      assert.deepEqual(callOptions[0], { frameLimit: 1, minFrames: 1 })

      const auditDateKey = formatAttendanceDateKey(Date.now())
      const auditResponse = await getAdminAuditLogs(sameOriginRequest(
        `/api/admin/audit-logs?decisionCode=attendance_server_error&date=${auditDateKey}&limit=500`,
        { cookie: adminCookie() },
      ))
      const auditPayload = await auditResponse.json()
      assert.equal(auditResponse.status, 200, JSON.stringify(auditPayload))
      const auditLog = auditPayload.logs.find(log => log.targetId === responsePayload.errorId)
      assert.ok(auditLog, 'Admin audit readback must contain the matching safe server-error record')
      assert.deepEqual(auditLog.metadata, {
        errorId: responsePayload.errorId,
        stage: 'process_submission',
        errorType: 'Error',
      })
      assert.equal(auditLog.summary, 'Attendance submission failed at process_submission.')
      assert.doesNotMatch(
        JSON.stringify(auditLog),
        /private-attendance-user|private-password|private-host|private-stage|secret-models|weights\.bin/i,
      )
    })

    await t.test('fallback-frame failure', async () => {
      const privateError = 'D:\\private-face-models\\attendance\\weights.bin'
      let buildCalls = 0
      const handler = createAttendanceV2PostHandler({
        services: {
          buildAuthoritativeAttendancePayload: async () => {
            buildCalls += 1
            if (buildCalls === 1) return successfulSingleFramePayload
            throw new Error(privateError)
          },
          findClaimedEmployeeMatch: async () => ({
            ok: true,
            debug: {
              bestDistance: 0.7,
              secondDistance: 0.75,
              supportCount: 2,
              supportDescriptorCount: 2,
            },
          }),
        },
      })

      const response = await submitAtomicAttendance(handler, { id: 'safe-error-fallback', accessCode: '7222' })
      await assertSafeServerError(response, /private-face-models|weights\.bin/i)
      assert.equal(buildCalls, 2)
    })
  } finally {
    console.error = originalConsoleError
    if (previousFastSingleFrame === undefined) delete process.env.ATTENDANCE_FAST_SINGLE_FRAME_ENABLED
    else process.env.ATTENDANCE_FAST_SINGLE_FRAME_ENABLED = previousFastSingleFrame
  }
})

async function createActiveAtomicAttendancePerson(lastName) {
  const response = await register(registrationFixture({
    lastName,
    photoDataUrl: await pngDataUrl(),
  }))
  const registration = await response.json()
  assert.equal(response.status, 200, JSON.stringify(registration))
  await transitionLifecycle(registration.personId, 'active', `Activate ${lastName} attendance test employee`)
  return getLocalPersonById(registration.personId)
}

test('simultaneous first scans commit exactly one accepted attendance operation', async () => {
  const person = await createActiveAtomicAttendancePerson('AtomicConcurrent')
  const handler = createAttendanceV2PostHandler({
    services: atomicAttendanceServices(person, { synchronizeMatches: true }),
  })

  const responses = await Promise.all([
    submitAtomicAttendance(handler, person),
    submitAtomicAttendance(handler, person),
  ])
  const payloads = await Promise.all(responses.map(response => response.json()))
  assert.deepEqual(responses.map(response => response.status).sort((left, right) => left - right), [200, 409])

  const accepted = payloads.find(payload => payload.ok)
  const blocked = payloads.find(payload => !payload.ok)
  assert.equal(accepted?.entry?.personId, person.id)
  assert.equal(accepted?.entry?.action, 'checkin')
  assert.equal(blocked?.decisionCode, 'blocked_recent_duplicate')

  const [raw, daily, events, locks] = await Promise.all([
    queryPostgres('SELECT action FROM attendance WHERE person_id = $1', [person.id]),
    queryPostgres('SELECT data FROM attendance_daily WHERE person_id = $1', [person.id]),
    queryPostgres("SELECT decision_code, data FROM scan_events WHERE person_id = $1 AND status = 'accepted'", [person.id]),
    queryPostgres('SELECT last_action FROM attendance_locks WHERE employee_id = $1', [person.id]),
  ])
  assert.equal(raw.rowCount, 1)
  assert.equal(raw.rows[0].action, 'checkin')
  assert.equal(daily.rowCount, 1)
  assert.equal(daily.rows[0].data.logCount, 1)
  assert.equal(events.rowCount, 1)
  assert.equal(events.rows[0].data.verificationMode, 'challenge_v2')
  assert.equal(locks.rowCount, 1)
  assert.equal(locks.rows[0].last_action, 'checkin')
})

test('accepted attendance rolls back every write when accepted scan history fails', async () => {
  const person = await createActiveAtomicAttendancePerson('AtomicRollback')
  const handler = createAttendanceV2PostHandler({ services: atomicAttendanceServices(person) })
  assert.match(person.id, /^[0-9a-f-]+$/i)
  const triggerName = 'route_test_fail_accepted_scan_event'
  const functionName = 'route_test_fail_accepted_scan_event_fn'

  await queryPostgres(`DROP TRIGGER IF EXISTS ${triggerName} ON scan_events`)
  await queryPostgres(`DROP FUNCTION IF EXISTS ${functionName}()`)
  try {
    await queryPostgres(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.status = 'accepted' AND NEW.person_id = '${person.id}' THEN
          RAISE EXCEPTION 'simulated accepted scan event failure';
        END IF;
        RETURN NEW;
      END
      $function$
    `)
    await queryPostgres(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON scan_events
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()
    `)

    const response = await submitAtomicAttendance(handler, person)
    const payload = await response.json()
    assert.equal(response.status, 500, JSON.stringify(payload))
    assert.equal(payload.decisionCode, 'blocked_server_error')

    const [raw, daily, events, locks] = await Promise.all([
      queryPostgres('SELECT id FROM attendance WHERE person_id = $1', [person.id]),
      queryPostgres('SELECT id FROM attendance_daily WHERE person_id = $1', [person.id]),
      queryPostgres("SELECT id FROM scan_events WHERE person_id = $1 AND status = 'accepted'", [person.id]),
      queryPostgres('SELECT employee_id FROM attendance_locks WHERE employee_id = $1', [person.id]),
    ])
    assert.equal(raw.rowCount, 0)
    assert.equal(daily.rowCount, 0)
    assert.equal(events.rowCount, 0)
    assert.equal(locks.rowCount, 0)
  } finally {
    await queryPostgres(`DROP TRIGGER IF EXISTS ${triggerName} ON scan_events`)
    await queryPostgres(`DROP FUNCTION IF EXISTS ${functionName}()`)
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
  const authoritativeDescriptor = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0))
  let matchedPerson = personA
  const services = {
    buildAuthoritativeAttendancePayload: async () => ({
      descriptor: authoritativeDescriptor,
      descriptors: [authoritativeDescriptor, authoritativeDescriptor],
      descriptorSpread: 0.1,
      antispoof: 0.92,
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
    latitude: 0,
    longitude: 0,
  }), 403, 'blocked_geofence')
})

test('server anti-spoof blocks missing and weak authoritative scores despite browser claims', async () => {
  const descriptor = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0))
  let authoritativeAntispoof = null
  const handler = createAttendanceV2PostHandler({
    services: {
      buildAuthoritativeAttendancePayload: async () => ({
        descriptor,
        descriptors: [descriptor, descriptor],
        descriptorSpread: 0.1,
        antispoof: authoritativeAntispoof,
        acceptedFrames: [],
        rejectedFrames: [],
        processedCount: 2,
        diagnostics: {
          modelVersion: 'route-test-antispoof-model-v1',
          acceptedCount: 2,
          rejectedCount: 0,
          averagePerformanceMs: 1,
        },
      }),
      findClaimedEmployeeMatch: async () => ({
        ok: false,
        decisionCode: 'blocked_no_reliable_match',
        message: 'No reliable face match found.',
      }),
    },
  })
  const body = {
    employeeId: '1234',
    latitude: 6.1164,
    longitude: 125.1716,
    scanFrames: [
      { frameDataUrl: 'data:image/jpeg;base64,ANTISPOOF-A' },
      { frameDataUrl: 'data:image/jpeg;base64,ANTISPOOF-B' },
    ],
    antispoof: 1,
    captureContext: {
      capturePolicyVersion: 'scan-v4',
      verificationFrames: 3,
      trackWidth: 720,
      trackHeight: 1280,
      trackFacingMode: 'user',
      mobile: false,
    },
    scanDiagnostics: { strictFrames: 3, descriptorSpread: 0.1 },
    kioskContext: { kioskId: 'route-test-antispoof', source: 'web-scan' },
  }
  const attendanceCount = async () => Number((await queryPostgres('SELECT count(*)::integer AS count FROM attendance')).rows[0].count)
  const submit = async () => {
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
  const assertBlocked = async expectedDecisionCode => {
    const before = await attendanceCount()
    const response = await submit()
    const payload = await response.json()
    assert.equal(response.status, 403, JSON.stringify(payload))
    assert.equal(payload.decisionCode, expectedDecisionCode)
    assert.equal(await attendanceCount(), before)
  }

  await assertBlocked('blocked_missing_antispoof')
  authoritativeAntispoof = 0.57
  await assertBlocked('blocked_antispoof')
})
